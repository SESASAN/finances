"use server";

// `'use server'` files may only export async functions — that constraint is what pushed
// `AuthFormState`/`AuthOutcome` into types.ts and all branching into auth-service.ts
// (Unit 3) and the route handlers (this unit). Do not "tidy" that split back together;
// it is what makes the rest of this feature unit-testable without a Next request cycle.
//
// Every action re-parses `FormData` with the SAME Zod schema used client-side. React
// Hook Form validation on the client is UX only — `formData` arrives from an untrusted
// client, so this parse is the authoritative one. Same posture as "the proxy is UX, RLS
// is the boundary" (see lib/auth/session-proxy.ts).
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAuthService } from "@/features/auth/auth-service";
import {
  loginSchema,
  magicLinkSchema,
  newPasswordSchema,
  passwordResetRequestSchema,
  signupSchema,
} from "@/features/auth/schemas";
import type { AuthFormState, AuthOutcome } from "@/features/auth/types";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { readSupabaseEnv } from "@/lib/auth/supabase-env";

const authService = createAuthService({
  getClient: createSupabaseServerClient,
  appUrl: readSupabaseEnv().appUrl,
});

function getOptionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

// `redirect()` works by THROWING a `NEXT_REDIRECT` error. Never call it inside a `try`
// whose `catch` swallows — the redirect would become a silent no-op. Every `try/catch`
// that could swallow such an error lives one layer down, inside auth-service.ts, strictly
// around the Supabase call — never around this call.
//
// Callers narrow `outcome.status !== "error"` before calling this, so the "error" variant
// (which has no `redirectTo`/`url`) is excluded by the type checker, not by a runtime
// check here.
function redirectFromOutcome(outcome: Exclude<AuthOutcome, { status: "error" }>): never {
  if (outcome.status === "external-redirect") {
    redirect(outcome.url);
  }
  redirect(outcome.redirectTo);
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const outcome = await authService.signIn(parsed.data, getOptionalString(formData, "next"));
  if (outcome.status === "error") {
    return { formError: outcome.formError, fieldErrors: outcome.fieldErrors };
  }

  redirectFromOutcome(outcome);
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const outcome = await authService.signUp(parsed.data);
  if (outcome.status === "error") {
    return { formError: outcome.formError, fieldErrors: outcome.fieldErrors };
  }

  redirectFromOutcome(outcome);
}

export async function requestMagicLinkAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = magicLinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const outcome = await authService.requestMagicLink(parsed.data);
  if (outcome.status === "error") {
    return { formError: outcome.formError, fieldErrors: outcome.fieldErrors };
  }

  redirectFromOutcome(outcome);
}

export async function requestPasswordResetAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = passwordResetRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const outcome = await authService.requestPasswordReset(parsed.data);
  if (outcome.status === "error") {
    return { formError: outcome.formError, fieldErrors: outcome.fieldErrors };
  }

  redirectFromOutcome(outcome);
}

export async function confirmPasswordResetAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const outcome = await authService.confirmPasswordReset(parsed.data);
  if (outcome.status === "error") {
    return { formError: outcome.formError, fieldErrors: outcome.fieldErrors };
  }

  redirectFromOutcome(outcome);
}

export async function signOutAction(): Promise<void> {
  const outcome = await authService.signOut();
  if (outcome.status === "error") {
    // signOut() never actually returns "error" (auth-service.ts swallows every failure
    // into success — a failed sign-out must never strand the user believing they are
    // still logged in). This branch exists only to satisfy AuthOutcome's exhaustiveness.
    redirect("/login");
  }

  redirectFromOutcome(outcome);
}

export async function startGoogleOAuthAction(formData: FormData): Promise<void> {
  const outcome = await authService.startGoogleOAuth(getOptionalString(formData, "next"));
  if (outcome.status === "error") {
    // This action has no form to render a field/form error on (it is a plain
    // `<button formAction={startGoogleOAuthAction}>`) — redirect to a fixed, safe
    // destination instead of silently failing.
    redirect("/auth-error?reason=oauth_start_failed");
  }

  redirectFromOutcome(outcome);
}
