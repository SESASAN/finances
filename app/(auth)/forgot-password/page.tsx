import Link from "next/link";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

type ForgotPasswordPageProps = {
  searchParams: Promise<{ sent?: string }>;
};

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const { sent } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-16">
      <h1 className="text-2xl font-semibold">Recuperar contraseña</h1>

      {sent === "1" ? (
        <p className="text-sm text-muted-foreground">
          Si el email existe en nuestro sistema, te enviamos instrucciones para
          restablecer tu contraseña. Revisá tu casilla.
        </p>
      ) : (
        <ForgotPasswordForm />
      )}

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline underline-offset-4">
          Volver a iniciar sesión
        </Link>
      </p>
    </div>
  );
}
