"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { confirmPasswordResetAction } from "@/features/auth/actions";
import { newPasswordSchema, type NewPasswordInput } from "@/features/auth/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/features/auth/components/field-error";

// Requires the recovery session already set by GET /auth/confirm?type=recovery — this
// form has no email/token field, it just calls updateUser({ password }) against the
// current session. `auth-service.ts` returns a formError if that session is missing.
export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    confirmPasswordResetAction,
    {}
  );
  const {
    register,
    formState: { errors },
  } = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
    mode: "onBlur",
  });

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reset-password-password">Nueva contraseña</Label>
        <Input
          id="reset-password-password"
          type="password"
          autoComplete="new-password"
          {...register("password")}
        />
        <FieldError
          message={errors.password?.message ?? state.fieldErrors?.password?.[0]}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reset-password-confirm-password">Confirmá tu contraseña</Label>
        <Input
          id="reset-password-confirm-password"
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
        {isPending ? "Guardando..." : "Guardar nueva contraseña"}
      </Button>
    </form>
  );
}
