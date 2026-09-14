export type AuthErrorContext =
  | "signup"
  | "login"
  | "magic-link"
  | "password-reset-request"
  | "password-reset-confirm"
  | "oauth"
  | "callback"
  | "confirm";

export type MappedAuthError = {
  formError: string;
  fieldErrors?: Record<string, string[]>;
};

export type AuthErrorInput =
  | { code?: string; status?: number; message?: string }
  | null
  | undefined;

// Never interpolate `error.message` into the UI — it is English, unstable across
// Supabase versions, and leaks internals. Branch on `error.code` (and `status`) only.
const GENERIC_ERROR: MappedAuthError = {
  formError: "No pudimos completar la operación. Intentá de nuevo.",
};

const RATE_LIMIT_ERROR: MappedAuthError = {
  formError: "Demasiados intentos. Probá de nuevo en unos minutos.",
};

const EXPIRED_LINK_ERROR: MappedAuthError = {
  formError: "El enlace expiró o ya fue usado. Pedí uno nuevo.",
};

// ADR-4: deliberately collapses invalid_credentials + email_not_confirmed into one
// generic message to avoid an account-enumeration oracle on login. Required UX
// mitigation lives on the login page (always-visible "resend confirmation" link).
const LOGIN_GENERIC_ERROR: MappedAuthError = {
  formError:
    "Email o contraseña incorrectos, o tu cuenta todavía no está confirmada.",
};

const WEAK_PASSWORD_ERROR: MappedAuthError = {
  ...GENERIC_ERROR,
  fieldErrors: { password: ["La contraseña es demasiado débil."] },
};

const SAME_PASSWORD_ERROR: MappedAuthError = {
  ...GENERIC_ERROR,
  fieldErrors: { password: ["Elegí una contraseña distinta a la anterior."] },
};

const RATE_LIMIT_CODES = new Set([
  "over_email_send_rate_limit",
  "over_request_rate_limit",
]);

const EXPIRED_LINK_CODES = new Set([
  "otp_expired",
  "token_expired",
  "invalid_token",
  "flow_state_expired",
  "flow_state_not_found",
]);

const EXPIRED_LINK_CONTEXTS = new Set<AuthErrorContext>([
  "confirm",
  "callback",
  "password-reset-confirm",
]);

export function mapAuthError(
  error: AuthErrorInput,
  context: AuthErrorContext
): MappedAuthError {
  if (!error) return GENERIC_ERROR;

  const { code, status } = error;

  if (
    context === "login" &&
    (code === "invalid_credentials" || code === "email_not_confirmed")
  ) {
    return LOGIN_GENERIC_ERROR;
  }

  if (
    code === "weak_password" &&
    (context === "signup" || context === "password-reset-confirm")
  ) {
    return WEAK_PASSWORD_ERROR;
  }

  if (code === "same_password" && context === "password-reset-confirm") {
    return SAME_PASSWORD_ERROR;
  }

  if ((code !== undefined && RATE_LIMIT_CODES.has(code)) || status === 429) {
    return RATE_LIMIT_ERROR;
  }

  if (
    code !== undefined &&
    EXPIRED_LINK_CODES.has(code) &&
    EXPIRED_LINK_CONTEXTS.has(context)
  ) {
    return EXPIRED_LINK_ERROR;
  }

  return GENERIC_ERROR;
}
