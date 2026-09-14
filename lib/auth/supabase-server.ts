import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "@/lib/auth/supabase-env";

export type SupabaseServerClientFactory = () => Promise<SupabaseClient>;

// Non-goal: no singleton, no module-level cache. Per @supabase/ssr's own
// createServerClient docs: "Always create a new client with this function for each
// server render — never share a client across requests."
export const createSupabaseServerClient: SupabaseServerClientFactory = async () => {
  const { url, anonKey } = readSupabaseEnv();
  const cookieStore = await cookies(); // Next 16: cookies() is async — must await.

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // `setAll` also receives a 2nd arg (@supabase/ssr 0.12.x) carrying
      // Cache-Control/Expires/Pragma so a response with a refreshed auth cookie is
      // never cached by a CDN/reverse proxy. Intentionally not declared as a parameter
      // here (TS/JS allow a function to accept fewer params than its type declares):
      // response headers cannot be set from an RSC anyway — proxy.ts
      // (lib/auth/session-proxy.ts) is the only layer holding a real NextResponse, and
      // it is where those headers actually get applied.
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where `cookies()` is read-only and `.set()`
          // throws. Safe to ignore ONLY because proxy.ts already refreshed the session
          // on this same request. This try/catch is load-bearing: removing it crashes
          // every RSC render that happens right after a token refresh.
        }
      },
    },
  });
};
