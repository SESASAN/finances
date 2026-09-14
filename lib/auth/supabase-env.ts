export type SupabaseEnv = {
  url: string;
  anonKey: string;
  appUrl: string;
};

export class MissingEnvError extends Error {
  constructor(public readonly keys: string[]) {
    super(`Missing env: ${keys.join(", ")}`);
    this.name = "MissingEnvError";
  }
}

// Exact names from ARCHITECTURE.md §12 — do not invent new ones.
const ENV_KEYS = {
  url: "NEXT_PUBLIC_SUPABASE_URL",
  anonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  appUrl: "NEXT_PUBLIC_APP_URL",
} as const;

/** Reads from an injected record (default process.env) so tests are deterministic. */
export function readSupabaseEnv(
  source: Record<string, string | undefined> = process.env
): SupabaseEnv {
  const missing: string[] = [];

  for (const key of Object.values(ENV_KEYS)) {
    if (!source[key]) missing.push(key);
  }

  if (missing.length > 0) {
    throw new MissingEnvError(missing);
  }

  return {
    url: source[ENV_KEYS.url] as string,
    anonKey: source[ENV_KEYS.anonKey] as string,
    appUrl: source[ENV_KEYS.appUrl] as string,
  };
}
