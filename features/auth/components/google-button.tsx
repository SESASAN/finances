"use client";

import { startGoogleOAuthAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

type GoogleButtonProps = {
  next: string;
};

// `startGoogleOAuthAction` is a plain `(formData: FormData) => Promise<void>` action —
// it never renders a field/form error back onto this form; a failure redirects to
// `/auth-error?reason=oauth_start_failed` instead (see features/auth/actions.ts). Kept
// as its own <form>, never nested inside another form (invalid HTML) — pages render it
// as a sibling of the password/magic-link forms.
export function GoogleButton({ next }: GoogleButtonProps) {
  return (
    <form action={startGoogleOAuthAction}>
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant="outline" className="w-full">
        Continuar con Google
      </Button>
    </form>
  );
}
