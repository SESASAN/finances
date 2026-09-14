// Zero Next.js imports on purpose (defend this in review): no `redirect()`, no
// `cookies()`, no `revalidatePath()`. The Supabase client is dependency-injected via
// `getClient`, so every branch below is unit-testable with a plain-object fake — no
// network, no Next request cycle. `actions.ts` (Unit 4) is the only place that binds the
// real `createSupabaseServerClient` and calls Next's `redirect()` on the outcome.

import { mapAuthError } from "@/lib/auth/auth-errors";
import { safeNextPath } from "@/lib/auth/redirects";
import type { SupabaseServerClientFactory } from "@/lib/auth/supabase-server";
import type {
  LoginInput,
  MagicLinkInput,
  NewPasswordInput,
  PasswordResetRequestInput,
  SignupInput,
} from "@/features/auth/schemas";
import type { AuthOutcome } from "@/features/auth/types";

export type AuthServiceDeps = {
  getClient: SupabaseServerClientFactory;
  appUrl: string;
};

export interface AuthService {
  signUp(input: SignupInput): Promise<AuthOutcome>;
  signIn(input: LoginInput, next: string | null): Promise<AuthOutcome>;
  signOut(): Promise<AuthOutcome>;
  requestMagicLink(input: MagicLinkInput): Promise<AuthOutcome>;
  requestPasswordReset(input: PasswordResetRequestInput): Promise<AuthOutcome>;
  confirmPasswordReset(input: NewPasswordInput): Promise<AuthOutcome>;
  startGoogleOAuth(next: string | null): Promise<AuthOutcome>;
}

// Not exported from lib/auth/auth-errors.ts (that module only exposes the mapped
// message, not the raw codes) — kept minimal and local rather than widening that
// module's public surface for two call sites.
const RATE_LIMIT_CODES = new Set([
  "over_email_send_rate_limit",
  "over_request_rate_limit",
]);

function isRateLimitError(
  error: { code?: string; status?: number } | null | undefined
): boolean {
  if (!error) return false;
  return (error.code !== undefined && RATE_LIMIT_CODES.has(error.code)) || error.status === 429;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { getClient, appUrl } = deps;

  return {
    // The anti-enumeration centrepiece (ADR-5). Three distinct Supabase responses MUST
    // produce one identical outcome — see the deep-equality test in
    // tests/unit/auth/auth-service.test.ts. Do not add a branch here that would make
    // any of the three cases distinguishable.
    async signUp(input) {
      const { auth } = await getClient();
      const { error } = await auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          emailRedirectTo: `${appUrl}/auth/confirm`,
          // `data.name` lands in auth.users.raw_user_meta_data, read by handle_new_user()
          // into profiles.name. INVARIANT: raw_user_meta_data is user-editable — never use
          // it (or profiles.name) in an authorization decision.
          data: { name: input.name },
        },
      });

      // Existing confirmed user, either Confirm-email/Confirm-phone setting off.
      if (error?.code === "user_already_exists") {
        return { status: "notice", redirectTo: "/verify-email" };
      }

      if (error) {
        return { status: "error", ...mapAuthError(error, "signup") };
      }

      // No error covers BOTH remaining cases: a genuine new signup (session: null) and
      // an existing confirmed user obfuscated as a fresh user with identities: [] (both
      // Confirm-email and Confirm-phone on). Intentionally not distinguished — same
      // outcome either way, which is what makes the ADR-5 test pass.
      return { status: "notice", redirectTo: "/verify-email" };
    },

    async signIn(input, next) {
      const { auth } = await getClient();
      const { error } = await auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });

      if (error) {
        return { status: "error", ...mapAuthError(error, "login") };
      }

      return { status: "success", redirectTo: safeNextPath(next) };
    },

    async signOut() {
      const { auth } = await getClient();
      // `local`, not `global`: logging out on one device should not silently sign the
      // user out everywhere else. Errors are swallowed to success — a failed sign-out
      // must never strand the user believing they are still logged in.
      try {
        await auth.signOut({ scope: "local" });
      } catch (err) {
        console.error("[auth-service] signOut failed, returning success anyway", err);
      }
      return { status: "success", redirectTo: "/login" };
    },

    // `shouldCreateUser: false` is deliberate: a magic link must not silently create an
    // account (signup requires a name and an explicit password step). That makes
    // "user not found" a distinguishable Supabase response, so every error EXCEPT
    // rate-limit is swallowed into the same neutral notice (anti-enumeration). Rate
    // limit is about the requester, not the target — safe to surface.
    async requestMagicLink(input) {
      const { auth } = await getClient();
      const { error } = await auth.signInWithOtp({
        email: input.email,
        options: {
          emailRedirectTo: `${appUrl}/auth/confirm`,
          shouldCreateUser: false,
        },
      });

      if (isRateLimitError(error)) {
        return { status: "error", ...mapAuthError(error, "magic-link") };
      }

      return { status: "notice", redirectTo: "/verify-email?sent=magic-link" };
    },

    // Same posture as requestMagicLink: identical neutral notice whether or not the
    // address exists, except rate-limit.
    async requestPasswordReset(input) {
      const { auth } = await getClient();
      const { error } = await auth.resetPasswordForEmail(input.email, {
        redirectTo: `${appUrl}/auth/confirm?next=/reset-password`,
      });

      if (isRateLimitError(error)) {
        return { status: "error", ...mapAuthError(error, "password-reset-request") };
      }

      return { status: "notice", redirectTo: "/forgot-password?sent=1" };
    },

    async confirmPasswordReset(input) {
      const { auth } = await getClient();

      // getUser(), NEVER getSession(): this must revalidate against Supabase, not trust
      // an unverified cookie. Requires the recovery session /auth/confirm already set.
      const {
        data: { user },
      } = await auth.getUser();

      if (!user) {
        return {
          status: "error",
          formError: "El enlace expiró o ya fue usado. Pedí uno nuevo.",
        };
      }

      const { error } = await auth.updateUser({ password: input.password });

      if (error) {
        return { status: "error", ...mapAuthError(error, "password-reset-confirm") };
      }

      // A password reset should invalidate sessions an attacker may hold. Best-effort:
      // failure here is logged, never surfaced — the password change already succeeded.
      try {
        await auth.signOut({ scope: "others" });
      } catch (err) {
        console.error(
          "[auth-service] failed to invalidate other sessions after password reset",
          err
        );
      }

      return { status: "success", redirectTo: "/login?reset=1" };
    },

    // Server-side there is no browser to navigate, so this does not redirect itself —
    // it returns the provider consent URL as its own AuthOutcome variant (ADR-6),
    // never "success", so it can never be fed through safeNextPath by mistake.
    async startGoogleOAuth(next) {
      const { auth } = await getClient();
      const { data, error } = await auth.signInWithOAuth({
        provider: "google",
        options: {
          // safeNextPath is applied to the `next` WE embed here — never to the
          // Supabase-issued `data.url` below, which is off-origin by design.
          redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`,
        },
      });

      if (error || !data?.url) {
        return { status: "error", ...mapAuthError(error, "oauth") };
      }

      return { status: "external-redirect", url: data.url };
    },
  };
}
