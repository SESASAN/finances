"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "@/lib/auth/supabase-env";

let client: SupabaseClient | undefined;

// `cookies` is intentionally omitted: it is OPTIONAL for the browser client (verified
// against the installed @supabase/ssr types), which falls back to `document.cookie`.
// Do not hand-roll a browser cookie adapter — hand-rolled adapters are the documented
// cause of "random logouts".
//
// Module-level memo is fine here (unlike lib/auth/supabase-server.ts): the browser has a
// single session in a single tab, so there is no cross-request state to leak.
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    const { url, anonKey } = readSupabaseEnv();
    client = createBrowserClient(url, anonKey);
  }
  return client;
}
