"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { requestMagicLinkAction } from "@/features/auth/actions";
import { magicLinkSchema, type MagicLinkInput } from "@/features/auth/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/features/auth/components/field-error";

// Success and non-rate-limit failure both redirect to the SAME notice
// (`/verify-email?sent=magic-link`) — anti-enumeration, see auth-service.ts. Only a
// rate-limit (429) ever surfaces as a form error here.
export function MagicLinkForm() {
  const [state, formAction, isPending] = useActionState(requestMagicLinkAction, {});
  const {
    register,
    formState: { errors },
  } = useForm<MagicLinkInput>({
    resolver: zodResolver(magicLinkSchema),
    mode: "onBlur",
  });

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="magic-link-email">Email</Label>
        <Input
          id="magic-link-email"
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

      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? "Enviando..." : "Enviarme un enlace mágico"}
      </Button>
    </form>
  );
}
