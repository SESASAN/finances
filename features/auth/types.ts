// Lives in its own file (not auth-service.ts) because `actions.ts` is `'use server'`,
// where only async functions may be exported — type-only exports would break that file.

export type AuthFieldErrors = Record<string, string[] | undefined>;

// `external-redirect` is a DISTINCT variant on purpose (ADR-6), not a boolean flag on
// "success". The Google OAuth consent URL is absolute and off-origin: feeding it through
// safeNextPath() would reject it and silently strand the user at "/". Keeping it as its
// own variant makes the type system — not a comment a future refactor can delete —
// prevent an external URL from ever entering the same-origin redirect path, and prevent
// the reverse mistake of merging the variants and reintroducing an open redirect.
export type AuthOutcome =
  | { status: "success"; redirectTo: string } // same-origin, already through safeNextPath
  | { status: "notice"; redirectTo: string } // neutral outcome — anti-enumeration
  | { status: "external-redirect"; url: string } // Supabase-issued provider URL
  | { status: "error"; formError: string; fieldErrors?: AuthFieldErrors };

export type AuthFormState = {
  formError?: string;
  fieldErrors?: AuthFieldErrors;
};
