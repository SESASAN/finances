import Link from "next/link";
import { SignupForm } from "@/features/auth/components/signup-form";
import { GoogleButton } from "@/features/auth/components/google-button";
import { DEFAULT_NEXT_PATH } from "@/lib/auth/redirects";

export default function SignupPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-16">
      <h1 className="text-2xl font-semibold">Crear cuenta</h1>

      <SignupForm />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        O
        <div className="h-px flex-1 bg-border" />
      </div>

      <GoogleButton next={DEFAULT_NEXT_PATH} />

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Iniciá sesión
        </Link>
      </p>
    </div>
  );
}
