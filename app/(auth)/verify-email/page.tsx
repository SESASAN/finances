import Link from "next/link";

type VerifyEmailPageProps = {
  searchParams: Promise<{ sent?: string }>;
};

// Landing notice for BOTH signup (`/verify-email`, no query) and magic-link requests
// (`/verify-email?sent=magic-link`) — both outcomes are intentionally identical from
// auth-service.ts (anti-enumeration), so this page never reveals which case it is,
// beyond adjusting the copy to match what the user just did.
export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { sent } = await searchParams;
  const isMagicLink = sent === "magic-link";

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Revisá tu email</h1>
      <p className="text-sm text-muted-foreground">
        {isMagicLink
          ? "Te enviamos un enlace para iniciar sesión. Puede tardar unos minutos en llegar."
          : "Te enviamos un enlace para confirmar tu cuenta. Puede tardar unos minutos en llegar."}
      </p>
      <p className="text-sm">
        <Link href="/login" className="underline underline-offset-4">
          Volver a iniciar sesión
        </Link>
      </p>
    </div>
  );
}
