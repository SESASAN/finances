import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthRedirect } from "@/lib/auth/redirects";
import { readSupabaseEnv } from "@/lib/auth/supabase-env";

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { url, anonKey } = readSupabaseEnv();

  // CORRECTNESS — the most important lines in this file. Create the response object
  // ONCE here; every cookie Supabase writes during the refresh lands on THIS object,
  // and THIS object (or a redirect built from it, below) is what we return. Building a
  // fresh NextResponse at the end silently discards the refreshed session and produces
  // random logouts. This is a well-documented @supabase/ssr footgun — do NOT
  // "simplify" this by constructing a new response after the fact.
  let response = NextResponse.next({ request });
  const cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        // `headers` is the 2nd arg added in @supabase/ssr 0.12.x: Cache-Control /
        // Expires / Pragma. A response carrying Set-Cookie for an auth token must never
        // be cached by a CDN or reverse proxy, or one user's session token gets served
        // to another user. Most published examples online omit this argument — they
        // are stale relative to the version installed here.
        Object.assign(cacheHeaders, headers);

        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        // Rebuild the response so it carries the request's updated cookies too (Next's
        // own recommended pattern), then re-apply the actual Set-Cookie values plus the
        // cache headers onto THIS SAME response — the one `updateSession` returns below.
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Must be awaited BEFORE any response is committed: the server client uses lazy
  // session initialization, and a refresh that finishes after commit cannot be written
  // back to cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const decision = resolveAuthRedirect({
    hasUser: Boolean(user),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
  });

  if (decision.kind === "redirect") {
    const redirectResponse = NextResponse.redirect(new URL(decision.to, request.url), 303);
    // Carry the refreshed cookies AND the cache headers onto the redirect response, or a
    // refresh that happened on this request is thrown away the moment we redirect
    // instead of returning `response` directly. Only cookies + the three known cache
    // headers are copied — not `response.headers` wholesale, which would drag
    // content-type/vary onto a 303.
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    for (const [key, value] of Object.entries(cacheHeaders)) {
      redirectResponse.headers.set(key, value);
    }
    return redirectResponse;
  }

  return response;
}
