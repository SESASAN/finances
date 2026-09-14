// Thin wiring only — all logic lives in the testable factory. Never unit-tested itself
// (see design §2.10 / test posture: route.ts files are 3-line bindings).
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { createConfirmHandler } from "@/features/auth/confirm-handler";

export const GET = createConfirmHandler(createSupabaseServerClient);
