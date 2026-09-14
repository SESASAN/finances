export const DEFAULT_NEXT_PATH = "/";

// Anchor origin used only to parse `raw` as a URL and compare origins — never surfaced.
const SAFE_ORIGIN = "http://127.0.0.1";

// Control chars (incl. space, CR, LF, tab) — CRLF header injection / parser differentials.
const CONTROL_CHAR_PATTERN = /[\x00-\x20\x7f]/;

// Destinations that are never a sensible landing place (stops a crafted redirect loop
// back into the auth callback handlers or the API).
const BLOCKED_PREFIXES = ["/auth/", "/api/"];

function hasControlCharsOrBackslash(value: string): boolean {
  // Browsers normalize backslash to forward slash, so `/\evil.com` is protocol-relative
  // in practice even though it isn't literally `//`.
  return CONTROL_CHAR_PATTERN.test(value) || value.includes("\\");
}

function isProtocolRelative(value: string): boolean {
  return value.length > 1 && value[1] === "/";
}

/** Same-origin relative paths only. Anything suspicious collapses to `fallback`. */
export function safeNextPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_NEXT_PATH
): string {
  // 1. Not a non-empty string → fallback.
  if (typeof raw !== "string" || raw.length === 0) return fallback;

  // 2 + 3. Control chars or backslash anywhere → fallback.
  if (hasControlCharsOrBackslash(raw)) return fallback;

  // 4. Does not start with "/" → fallback. Kills absolute URLs, scheme URLs, bare hosts.
  if (!raw.startsWith("/")) return fallback;

  // 5. Protocol-relative ("//evil.com") → fallback.
  if (isProtocolRelative(raw)) return fallback;

  // 6. Defence in depth against double/percent-encoded bypasses (%2f%2f, %5c, ...).
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (hasControlCharsOrBackslash(decoded) || isProtocolRelative(decoded)) {
    return fallback;
  }

  // 7. Normalise + final origin assertion — the real guard; steps above are cheap,
  // explicit early exits.
  let url: URL;
  try {
    url = new URL(raw, SAFE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== SAFE_ORIGIN) return fallback;

  // 8. Reject destinations that are never a sensible landing place.
  if (BLOCKED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return fallback;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export type AuthRedirectDecision =
  | { kind: "continue" }
  | { kind: "redirect"; to: string };

// Route groups `(auth)`/`(app)` do not appear in URLs, so "protected" cannot be matched
// by prefix — fail-closed: everything is protected unless explicitly listed here.
const PUBLIC_EXACT = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/auth-error",
  "/pricing",
  "/features",
]);

const PUBLIC_PREFIXES = ["/auth/"]; // the two callback handlers

const SIGNED_IN_SHOULD_LEAVE = new Set(["/login", "/signup", "/forgot-password"]);

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export function resolveAuthRedirect(input: {
  hasUser: boolean;
  pathname: string;
  search: string; // includes leading "?" or ""
}): AuthRedirectDecision {
  const { hasUser, pathname, search } = input;

  if (!hasUser) {
    if (isPublicPath(pathname)) return { kind: "continue" };
    const next = encodeURIComponent(`${pathname}${search}`);
    return { kind: "redirect", to: `/login?next=${next}` };
  }

  // `/reset-password` is the subtle exception: recovery `verifyOtp` creates a session,
  // so the user arrives here already signed in. Treating it like `/login` would bounce
  // them away from the only page that can complete the reset.
  if (pathname === "/reset-password") return { kind: "continue" };

  if (SIGNED_IN_SHOULD_LEAVE.has(pathname)) {
    return { kind: "redirect", to: "/" };
  }

  return { kind: "continue" };
}
