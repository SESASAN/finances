// Google OAuth PKCE callback. Separate from confirm-handler.ts on purpose: the PKCE code
// verifier lives in a cookie on the browser that STARTED the flow, so this handler only
// ever makes sense for that exact round trip — see ADR (design-amendments §4, "two route
// handlers of callback").
//
// Zero Next.js imports beyond NextResponse (a Response subtype), no `cookies()` binding:
// the Supabase client is dependency-injected via `getClient`, so the whole decision table
// below is unit-testable with a plain-object fake and a real `Request` — no Next request
// cycle needed. `app/auth/callback/route.ts` is the only place binding the real
// `createSupabaseServerClient`.
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth/redirects";
import type { SupabaseServerClientFactory } from "@/lib/auth/supabase-server";

function redirectTo(base: string, path: string, search?: string): NextResponse {
  return NextResponse.redirect(new URL(`${path}${search ?? ""}`, base), 303);
}

export function createCallbackHandler(
  getClient: SupabaseServerClientFactory
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const url = new URL(request.url);
    const { searchParams } = url;

    // Row 1: Google consent denied (error=access_denied, etc). `error_description` is
    // attacker-influenced text (reflected-XSS / phishing vector) — NEVER echoed into the
    // Location header or the page. Only this fixed `reason` enum reaches /auth-error.
    if (searchParams.has("error")) {
      return redirectTo(url.origin, "/auth-error", "?reason=oauth_denied");
    }

    const code = searchParams.get("code");
    if (!code) {
      return redirectTo(url.origin, "/auth-error", "?reason=missing_code");
    }

    const { auth } = await getClient();
    const { error } = await auth.exchangeCodeForSession(code);

    if (error) {
      return redirectTo(url.origin, "/auth-error", "?reason=exchange_failed");
    }

    const next = safeNextPath(searchParams.get("next"));
    return redirectTo(url.origin, next);
  };
}
