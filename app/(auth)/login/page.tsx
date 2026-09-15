import Link from "next/link";
import { safeNextPath } from "@/lib/auth/redirects";
import { LoginForm } from "@/features/auth/components/login-form";
import { MagicLinkForm } from "@/features/auth/components/magic-link-form";
import { GoogleButton } from "@/features/auth/components/google-button";

type LoginPageProps = {
  searchParams: Promise<{ next?: string; reset?: string }>;
};

// Server Component: `searchParams` is a Promise in Next.js 16, must be awaited.
// `safeNextPath` runs here too (defence in depth) so the value embedded in the form's
// hidden input is already sanitised — then sanitised again, authoritatively, inside the
// Server Action.
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, reset } = await searchParams;
  const safeNext = safeNextPath(next);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-16">
      <h1 className="text-2xl font-semibold">Iniciar sesión</h1>

      <LoginForm next={safeNext} justReset={reset === "1"} />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        O
        <div className="h-px flex-1 bg-border" />
      </div>

      <MagicLinkForm />
      <GoogleButton next={safeNext} />

      <p className="text-center text-sm text-muted-foreground">
        ¿No tenés cuenta?{" "}
        <Link href="/signup" className="underline underline-offset-4">
          Creá una
        </Link>
      </p>
    </div>
  );
}
