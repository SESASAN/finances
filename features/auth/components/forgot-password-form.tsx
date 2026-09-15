"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { requestPasswordResetAction } from "@/features/auth/actions";
import {
  passwordResetRequestSchema,
  type PasswordResetRequestInput,
} from "@/features/auth/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/features/auth/components/field-error";

// Identical generic notice regardless of whether the email exists
// (`/forgot-password?sent=1`) — anti-enumeration, see auth-service.ts.
export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    {}
  );
  const {
    register,
    formState: { errors },
  } = useForm<PasswordResetRequestInput>({
    resolver: zodResolver(passwordResetRequestSchema),
    mode: "onBlur",
  });

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="forgot-password-email">Email</Label>
        <Input
          id="forgot-password-email"
          type="email"
          autoComplete="email"
          {...register("email")}
        />
        <FieldError message={errors.email?.message ?? state.fieldErrors?.email?.[0]} />
      </div>

      {state.formError && (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Enviando..." : "Enviar instrucciones"}
      </Button>
    </form>
  );
}
