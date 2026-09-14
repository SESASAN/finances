import { z } from "zod";

// `.trim().toLowerCase()` MUST run before `.pipe(z.email(...))`: Zod transforms run in
// the order they're chained, so normalizing after validation would let
// "  ADA@Example.com  " fail even though it is a valid address once normalized.
// Getting this order backwards is a classic Zod 4 bug.
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Ingresá un email válido." }));

// 72 is not arbitrary: bcrypt truncates silently past 72 BYTES, and Supabase applies
// bcrypt server-side. `.max(72)` alone counts UTF-16 *characters*, so a password with
// multi-byte characters (accents, emoji) can pass `.max(72)` while still exceeding the
// 72-byte limit bcrypt actually enforces — the user's real password then differs from
// what they typed. The `.refine` below is what actually enforces the byte limit.
const passwordField = z
  .string()
  .min(8, { error: "Mínimo 8 caracteres." })
  .max(72, { error: "Máximo 72 caracteres." })
  .refine((value) => new TextEncoder().encode(value).length <= 72, {
    error: "La contraseña es demasiado larga.",
  });

function passwordsMatch(data: { password: string; confirmPassword: string }): boolean {
  return data.password === data.confirmPassword;
}

const CONFIRM_PASSWORD_MISMATCH: { path: string[]; error: string } = {
  path: ["confirmPassword"],
  error: "Las contraseñas no coinciden.",
};

export const signupSchema = z
  .object({
    name: z.string().trim().min(2, { error: "Ingresá tu nombre." }).max(80),
    email: emailField,
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, CONFIRM_PASSWORD_MISMATCH);

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailField,
  // Deliberately `min(1)`, NOT the signup password policy: applying the signup policy
  // to login would both leak the current password policy and reject pre-existing
  // accounts whose passwords predate it.
  password: z.string().min(1, { error: "Ingresá tu contraseña." }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const magicLinkSchema = z.object({ email: emailField });
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

export const passwordResetRequestSchema = z.object({ email: emailField });
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

export const newPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, CONFIRM_PASSWORD_MISMATCH);

export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
