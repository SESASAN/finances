// Thin wiring only — all logic lives in the testable factory. Never unit-tested itself
// (see design §2.9 / test posture: route.ts files are 3-line bindings).
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { createCallbackHandler } from "@/features/auth/callback-handler";

export const GET = createCallbackHandler(createSupabaseServerClient);
