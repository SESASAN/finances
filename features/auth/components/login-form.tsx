"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { loginAction } from "@/features/auth/actions";
import { loginSchema, type LoginInput } from "@/features/auth/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/features/auth/components/field-error";

type LoginFormProps = {
  next: string;
  justReset: boolean;
};

// `useActionState` (React 19), not the deprecated `useFormState`. No `onSubmit`, no
// `preventDefault`: submitting through the native `action` prop keeps the form working
// without JS (progressive enhancement) and keeps the server's Zod re-parse authoritative.
// RHF only adds blur-time inline errors on top.
export function LoginForm({ next, justReset }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(loginAction, {});
  const {
    register,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
  });

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      {justReset && (
        <Alert>
          <AlertDescription>
            Tu contraseña se actualizó. Iniciá sesión de nuevo.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          {...register("email")}
        />
        <FieldError message={errors.email?.message ?? state.fieldErrors?.email?.[0]} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-password">Contraseña</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
        <FieldError
          message={errors.password?.message ?? state.fieldErrors?.password?.[0]}
        />
      </div>

      {state.formError && (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1 text-sm">
        <Link href="/forgot-password" className="underline underline-offset-4">
          ¿Olvidaste tu contraseña?
        </Link>
        {/* ADR-4: shown UNCONDITIONALLY (not only on error) so its presence never reveals
            whether a given account exists or is confirmed. */}
        <Link href="/signup" className="underline underline-offset-4">
          ¿No recibiste el email de confirmación?
        </Link>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Ingresando..." : "Entrar"}
      </Button>
    </form>
  );
}
