import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthService, type AuthService } from "@/features/auth/auth-service";

const APP_URL = "https://app.test";
const SENTINEL = "__sentinel_message_must_never_leak__";

function createFakeAuth() {
  return {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOtp: vi.fn(),
    signInWithOAuth: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
    getUser: vi.fn(),
  };
}

type FakeAuth = ReturnType<typeof createFakeAuth>;

function createService(auth: FakeAuth): AuthService {
  return createAuthService({
    getClient: async () => ({ auth }) as never,
    appUrl: APP_URL,
  });
}

let auth: FakeAuth;
let service: AuthService;

beforeEach(() => {
  auth = createFakeAuth();
  service = createService(auth);
});

describe("signUp", () => {
  const input = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "correct-horse",
    confirmPassword: "correct-horse",
  };

  it("calls signUp with emailRedirectTo and the name in user metadata", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: "1" }, session: null }, error: null });

    await service.signUp(input);

    expect(auth.signUp).toHaveBeenCalledWith({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: `${APP_URL}/auth/confirm`,
        data: { name: input.name },
      },
    });
  });

  // ADR-5: the single most important test in the change. All three Supabase response
  // shapes for signUp MUST collapse into a byte-identical AuthOutcome, or the app becomes
  // an account-enumeration oracle.
  it("ADR-5: returns byte-identical outcomes for all three signUp response shapes", async () => {
    const genuineNewUser = { data: { user: { id: "1" }, session: null }, error: null };
    const obfuscatedExistingUser = {
      data: { user: { id: "2", identities: [] }, session: null },
      error: null,
    };
    const alreadyRegisteredError = {
      data: { user: null, session: null },
      error: { code: "user_already_exists", message: "User already registered" },
    };

    auth.signUp.mockResolvedValueOnce(genuineNewUser);
    const outcomeGenuine = await service.signUp(input);

    auth.signUp.mockResolvedValueOnce(obfuscatedExistingUser);
    const outcomeObfuscated = await service.signUp(input);

    auth.signUp.mockResolvedValueOnce(alreadyRegisteredError);
    const outcomeAlreadyRegistered = await service.signUp(input);

    expect(outcomeGenuine).toEqual({ status: "notice", redirectTo: "/verify-email" });
    expect(outcomeObfuscated).toEqual(outcomeGenuine);
    expect(outcomeAlreadyRegistered).toEqual(outcomeGenuine);
  });

  it("maps any other signUp error via mapAuthError, never leaking error.message", async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "weak_password", message: SENTINEL },
    });

    const outcome = await service.signUp(input);

    expect(outcome).toEqual({
      status: "error",
      formError: "No pudimos completar la operación. Intentá de nuevo.",
      fieldErrors: { password: ["La contraseña es demasiado débil."] },
    });
  });
});

describe("signIn", () => {
  it("returns success with safeNextPath(next) when credentials are valid", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "1" } }, error: null });

    const outcome = await service.signIn({ email: "ada@example.com", password: "x" }, "/dashboard");

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "x",
    });
    expect(outcome).toEqual({ status: "success", redirectTo: "/dashboard" });
  });

  it("sanitizes an unsafe next through safeNextPath before redirecting", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "1" } }, error: null });

    const outcome = await service.signIn({ email: "ada@example.com", password: "x" }, "//evil.com");

    expect(outcome).toEqual({ status: "success", redirectTo: "/" });
  });

  // ADR-4 (confirmed with the user): do NOT distinguish invalid_credentials from
  // email_not_confirmed. Separate messages form a clean account-enumeration oracle.
  it("ADR-4: collapses invalid_credentials and email_not_confirmed into the SAME generic error", async () => {
    auth.signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: "invalid_credentials", message: SENTINEL },
    });
    const outcomeInvalidCredentials = await service.signIn(
      { email: "a@b.com", password: "wrong" },
      null
    );

    auth.signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: "email_not_confirmed", message: SENTINEL },
    });
    const outcomeUnconfirmed = await service.signIn(
      { email: "a@b.com", password: "wrong" },
      null
    );

    expect(outcomeInvalidCredentials).toEqual(outcomeUnconfirmed);
    expect(outcomeInvalidCredentials).toEqual({
      status: "error",
      formError: "Email o contraseña incorrectos, o tu cuenta todavía no está confirmada.",
    });
  });
});

describe("signOut", () => {
  it("signs out with local scope and returns success", async () => {
    auth.signOut.mockResolvedValue({ error: null });

    const outcome = await service.signOut();

    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(outcome).toEqual({ status: "success", redirectTo: "/login" });
  });

  it("swallows a signOut error and still returns success (never strand the user)", async () => {
    auth.signOut.mockResolvedValue({ error: { code: "network_error", message: SENTINEL } });

    const outcome = await service.signOut();

    expect(outcome).toEqual({ status: "success", redirectTo: "/login" });
  });

  it("swallows a signOut rejection and still returns success", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.signOut.mockRejectedValue(new Error("network down"));

    const outcome = await service.signOut();

    expect(outcome).toEqual({ status: "success", redirectTo: "/login" });
    consoleError.mockRestore();
  });
});

describe("requestMagicLink", () => {
  it("calls signInWithOtp with shouldCreateUser:false and the confirm redirect", async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });

    await service.requestMagicLink({ email: "ada@example.com" });

    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "ada@example.com",
      options: { emailRedirectTo: `${APP_URL}/auth/confirm`, shouldCreateUser: false },
    });
  });

  it("returns a neutral notice when the address does not exist (anti-enumeration)", async () => {
    auth.signInWithOtp.mockResolvedValue({
      data: null,
      error: { code: "user_not_found", message: SENTINEL },
    });

    const outcome = await service.requestMagicLink({ email: "ghost@example.com" });

    expect(outcome).toEqual({ status: "notice", redirectTo: "/verify-email?sent=magic-link" });
  });

  it("returns the same neutral notice when there is no error", async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });

    const outcome = await service.requestMagicLink({ email: "ada@example.com" });

    expect(outcome).toEqual({ status: "notice", redirectTo: "/verify-email?sent=magic-link" });
  });

  it("surfaces a 429 rate-limit error to the requester (not about the target)", async () => {
    auth.signInWithOtp.mockResolvedValue({
      data: null,
      error: { status: 429, code: "over_email_send_rate_limit", message: SENTINEL },
    });

    const outcome = await service.requestMagicLink({ email: "ada@example.com" });

    expect(outcome).toEqual({
      status: "error",
      formError: "Demasiados intentos. Probá de nuevo en unos minutos.",
    });
  });
});

describe("requestPasswordReset", () => {
  it("calls resetPasswordForEmail with the confirm redirect targeting /reset-password", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await service.requestPasswordReset({ email: "ada@example.com" });

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("ada@example.com", {
      redirectTo: `${APP_URL}/auth/confirm?next=/reset-password`,
    });
  });

  it("gives the SAME neutral notice for an existing and a nonexistent email", async () => {
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const existingOutcome = await service.requestPasswordReset({ email: "real@example.com" });

    auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { code: "user_not_found", message: SENTINEL },
    });
    const nonexistentOutcome = await service.requestPasswordReset({ email: "ghost@example.com" });

    expect(existingOutcome).toEqual(nonexistentOutcome);
    expect(existingOutcome).toEqual({ status: "notice", redirectTo: "/forgot-password?sent=1" });
  });

  it("surfaces a 429 rate-limit error", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { status: 429, message: SENTINEL },
    });

    const outcome = await service.requestPasswordReset({ email: "ada@example.com" });

    expect(outcome).toEqual({
      status: "error",
      formError: "Demasiados intentos. Probá de nuevo en unos minutos.",
    });
  });
});

describe("confirmPasswordReset", () => {
  const validInput = { password: "correct-horse", confirmPassword: "correct-horse" };

  it("returns an error when there is no recovery session (getUser returns no user)", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });

    const outcome = await service.confirmPasswordReset(validInput);

    expect(outcome).toEqual({
      status: "error",
      formError: "El enlace expiró o ya fue usado. Pedí uno nuevo.",
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("maps same_password to a field error on password, without signing out", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "1" } } });
    auth.updateUser.mockResolvedValue({
      data: null,
      error: { code: "same_password", message: SENTINEL },
    });

    const outcome = await service.confirmPasswordReset(validInput);

    expect(outcome).toEqual({
      status: "error",
      formError: "No pudimos completar la operación. Intentá de nuevo.",
      fieldErrors: { password: ["Elegí una contraseña distinta a la anterior."] },
    });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("updates the password, invalidates OTHER sessions, and returns success", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "1" } } });
    auth.updateUser.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
    auth.signOut.mockResolvedValue({ error: null });

    const outcome = await service.confirmPasswordReset(validInput);

    expect(auth.updateUser).toHaveBeenCalledWith({ password: "correct-horse" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(outcome).toEqual({ status: "success", redirectTo: "/login?reset=1" });
  });

  it("still returns success even if invalidating other sessions fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.getUser.mockResolvedValue({ data: { user: { id: "1" } } });
    auth.updateUser.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
    auth.signOut.mockRejectedValue(new Error("network down"));

    const outcome = await service.confirmPasswordReset(validInput);

    expect(outcome).toEqual({ status: "success", redirectTo: "/login?reset=1" });
    consoleError.mockRestore();
  });
});

describe("startGoogleOAuth", () => {
  it("returns external-redirect with the provider URL, embedding safeNextPath(next)", async () => {
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/consent" },
      error: null,
    });

    const outcome = await service.startGoogleOAuth("/dashboard");

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${APP_URL}/auth/callback?next=${encodeURIComponent("/dashboard")}`,
      },
    });
    expect(outcome).toEqual({
      status: "external-redirect",
      url: "https://accounts.google.com/o/oauth2/consent",
    });
  });

  it("sanitizes an unsafe next before embedding it in the callback redirectTo", async () => {
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/x" },
      error: null,
    });

    await service.startGoogleOAuth("//evil.com");

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${APP_URL}/auth/callback?next=${encodeURIComponent("/")}`,
      },
    });
  });

  it("never returns success, even when the provider call fails", async () => {
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { code: "oauth_provider_not_supported", message: SENTINEL },
    });

    const outcome = await service.startGoogleOAuth(null);

    expect(outcome.status).not.toBe("success");
    expect(outcome).toEqual({
      status: "error",
      formError: "No pudimos completar la operación. Intentá de nuevo.",
    });
  });

  it("returns an error (never success) when Supabase reports no error but also no url", async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });

    const outcome = await service.startGoogleOAuth(null);

    expect(outcome.status).not.toBe("success");
    expect(outcome.status).toBe("error");
  });
});
