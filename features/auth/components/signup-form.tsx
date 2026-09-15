"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupAction } from "@/features/auth/actions";
import { signupSchema, type SignupInput } from "@/features/auth/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/features/auth/components/field-error";

// No `next` field: `authService.signUp()` takes no redirect target — every outcome
// (new signup, already-registered) collapses to the SAME notice at `/verify-email`
// (anti-enumeration, ADR-5), never a same-origin redirect a `next` value could steer.
export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signupAction, {});
  const {
    register,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    mode: "onBlur",
  });

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-name">Nombre</Label>
        <Input id="signup-name" autoComplete="name" {...register("name")} />
        <FieldError message={errors.name?.message ?? state.fieldErrors?.name?.[0]} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          {...register("email")}
        />
        <FieldError message={errors.email?.message ?? state.fieldErrors?.email?.[0]} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-password">Contraseña</Label>
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          {...register("password")}
        />
        <FieldError
          message={errors.password?.message ?? state.fieldErrors?.password?.[0]}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-confirm-password">Confirmá tu contraseña</Label>
        <Input
          id="signup-confirm-password"
          type="password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        <FieldError
          message={
            errors.confirmPassword?.message ?? state.fieldErrors?.confirmPassword?.[0]
          }
        />
      </div>

      {state.formError && (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando cuenta..." : "Crear cuenta"}
      </Button>
    </form>
  );
}
