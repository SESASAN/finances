import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

// Reached only via GET /auth/confirm?type=recovery, which always lands here and
// ignores `next` (design §2.10, row 4) — the recovery session's only legitimate use is
// setting a new password. `resolveAuthRedirect` treats this path as public AND lets an
// already-signed-in (recovery) user stay, see lib/auth/redirects.ts.
export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-16">
      <h1 className="text-2xl font-semibold">Elegí una nueva contraseña</h1>
      <ResetPasswordForm />
    </div>
  );
}
