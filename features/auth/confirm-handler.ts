// Email-link confirmation: signup confirm, magic link, recovery, email change. Separate
// from callback-handler.ts on purpose (see that file's header comment) — `token_hash` has
// no browser binding, so it works even when the link is opened in a different browser or
// a webmail preview, unlike the PKCE `code` flow.
//
// Same dependency-injection seam as callback-handler.ts: `getClient` is injected, so the
// whole decision table is unit-testable with a plain-object fake and a real `Request`.
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth/redirects";
import type { SupabaseServerClientFactory } from "@/lib/auth/supabase-server";

// `EmailOtpType` (verified against @supabase/auth-js's installed .d.ts) is
// `'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email' | (string & {})`.
// The `(string & {})` member means TypeScript accepts ANY string for `type` — it is not a
// closed type at the TS level. This allow-list is the ONLY runtime guard preventing an
// attacker-supplied `type` query param from being forwarded straight to the Auth API. Do
// not relax this without an equivalent runtime check.
export const ALLOWED_OTP_TYPES = [
  "signup",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const;

type AllowedOtpType = (typeof ALLOWED_OTP_TYPES)[number];

function isAllowedOtpType(value: string): value is AllowedOtpType {
  return (ALLOWED_OTP_TYPES as readonly string[]).includes(value);
}

function redirectTo(base: string, path: string, search?: string): NextResponse {
  return NextResponse.redirect(new URL(`${path}${search ?? ""}`, base), 303);
}

export function createConfirmHandler(
  getClient: SupabaseServerClientFactory
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const url = new URL(request.url);
    const { searchParams } = url;

    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");

    // Row 1: missing token_hash or type.
    if (!tokenHash || !type) {
      return redirectTo(url.origin, "/auth-error", "?reason=missing_token");
    }

    // Row 2: `type` not in the runtime allow-list.
    if (!isAllowedOtpType(type)) {
      return redirectTo(url.origin, "/auth-error", "?reason=invalid_type");
    }

    const { auth } = await getClient();
    // `VerifyTokenHashParams` (verified) has NO `options` member — adding `redirectTo`
    // will not typecheck and would not work. This handler computes its own destination.
    const { error } = await auth.verifyOtp({ token_hash: tokenHash, type });

    // Row 3: expired or already-consumed token.
    if (error) {
      return redirectTo(url.origin, "/auth-error", "?reason=link_expired");
    }

    // Row 4: recovery success ALWAYS lands on /reset-password — `next` is ignored. A
    // recovery session's only legitimate use is setting a new password; honouring `next`
    // would drop a user holding an elevated, email-derived session onto an arbitrary
    // app page.
    if (type === "recovery") {
      return redirectTo(url.origin, "/reset-password");
    }

    // Row 5: any other type, success.
    const next = safeNextPath(searchParams.get("next"));
    return redirectTo(url.origin, next);
  };
}
