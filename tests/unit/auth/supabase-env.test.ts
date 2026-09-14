import { describe, expect, it } from "vitest";
import { MissingEnvError, readSupabaseEnv } from "@/lib/auth/supabase-env";

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://app.test.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  NEXT_PUBLIC_APP_URL: "https://app.test",
};

describe("readSupabaseEnv", () => {
  it("returns all values when every key is present", () => {
    expect(readSupabaseEnv(validEnv)).toEqual({
      url: validEnv.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: validEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      appUrl: validEnv.NEXT_PUBLIC_APP_URL,
    });
  });

  it("throws MissingEnvError listing the single missing key", () => {
    const rest = {
      NEXT_PUBLIC_SUPABASE_URL: validEnv.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: validEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    };

    expect(() => readSupabaseEnv(rest)).toThrow(MissingEnvError);

    try {
      readSupabaseEnv(rest);
      throw new Error("expected readSupabaseEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingEnvError);
      expect((error as MissingEnvError).keys).toEqual(["NEXT_PUBLIC_APP_URL"]);
    }
  });

  it("throws MissingEnvError listing all missing keys at once", () => {
    expect(() => readSupabaseEnv({})).toThrow(MissingEnvError);

    try {
      readSupabaseEnv({});
      throw new Error("expected readSupabaseEnv to throw");
    } catch (error) {
      expect((error as MissingEnvError).keys).toEqual([
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "NEXT_PUBLIC_APP_URL",
      ]);
    }
  });

  it("treats an empty string as missing", () => {
    expect(() =>
      readSupabaseEnv({ ...validEnv, NEXT_PUBLIC_APP_URL: "" })
    ).toThrow(MissingEnvError);
  });
});
