import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";

type AuthErrorPageProps = {
  searchParams: Promise<{ reason?: string }>;
};

const GENERIC_MESSAGE = "No pudimos completar la operación. Intentá de nuevo.";

// Fixed `reason` → copy lookup. NEVER render the raw query param — `reason` is the only
// thing that crosses the redirect boundary from callback-handler.ts / confirm-handler.ts
// / actions.ts; anything not in this table (including an attacker-supplied value) falls
// through to GENERIC_MESSAGE, never throws.
//
// Enumerated from the actual handlers, not guessed — see the two route handlers plus
// `startGoogleOAuthAction`:
//   callback-handler.ts:  oauth_denied, missing_code, exchange_failed
//   confirm-handler.ts:   missing_token, invalid_type, link_expired
//   actions.ts:           oauth_start_failed (startGoogleOAuthAction, OAuth initiation
//                          failing before any redirect to Google happens)
const REASON_MESSAGES: Record<string, string> = {
  oauth_denied: "Cancelaste el inicio de sesión con Google.",
  missing_code: "No pudimos completar el inicio de sesión con Google. Intentá de nuevo.",
  exchange_failed:
    "No pudimos completar el inicio de sesión con Google. Intentá de nuevo.",
  missing_token: "El enlace no es válido.",
  invalid_type: "El enlace no es válido.",
  link_expired: "El enlace expiró o ya fue usado. Pedí uno nuevo.",
  oauth_start_failed:
    "No pudimos iniciar el inicio de sesión con Google. Intentá de nuevo.",
};

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const { reason } = await searchParams;
  const message = (reason && REASON_MESSAGES[reason]) || GENERIC_MESSAGE;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-16">
      <h1 className="text-2xl font-semibold">Algo salió mal</h1>

      <Alert variant="destructive">
        <AlertDescription>{message}</AlertDescription>
      </Alert>

      <p className="text-center text-sm">
        <Link href="/login" className="underline underline-offset-4">
          Volver a iniciar sesión
        </Link>
      </p>
    </div>
  );
}
