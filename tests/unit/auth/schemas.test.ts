import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  loginSchema,
  magicLinkSchema,
  newPasswordSchema,
  passwordResetRequestSchema,
  signupSchema,
} from "@/features/auth/schemas";

const validSignup = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "correct-horse",
  confirmPassword: "correct-horse",
};

describe("signupSchema", () => {
  it("accepts a valid payload", () => {
    const result = signupSchema.safeParse(validSignup);
    expect(result.success).toBe(true);
  });

  it("trims and lowercases the email before validating it", () => {
    const result = signupSchema.safeParse({
      ...validSignup,
      email: "  ADA@Example.com  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("ada@example.com");
    }
  });

  it("rejects an invalid email", () => {
    const result = signupSchema.safeParse({ ...validSignup, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    const result = signupSchema.safeParse({
      ...validSignup,
      password: "short1",
      confirmPassword: "short1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a password of exactly 8 characters", () => {
    const result = signupSchema.safeParse({
      ...validSignup,
      password: "eightch1",
      confirmPassword: "eightch1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a password that is <=72 chars but >72 UTF-8 bytes (bcrypt truncation)", () => {
    // 40 accented chars = 40 chars (passes .max(72) on character count) but 80 bytes
    // (fails bcrypt's 72-byte limit, which Supabase applies silently).
    const overweightPassword = "á".repeat(40);
    const result = signupSchema.safeParse({
      ...validSignup,
      password: overweightPassword,
      confirmPassword: overweightPassword,
    });
    expect(result.success).toBe(false);
  });

  it("reports a password/confirmPassword mismatch on the confirmPassword path", () => {
    const result = signupSchema.safeParse({
      ...validSignup,
      confirmPassword: "does-not-match",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const { fieldErrors } = z.flattenError(result.error);
      expect(fieldErrors.confirmPassword).toBeDefined();
      expect(fieldErrors.confirmPassword?.length).toBeGreaterThan(0);
      expect(fieldErrors.password).toBeUndefined();
    }
  });
});

describe("loginSchema", () => {
  it("accepts a 1-character password (min(1), not the signup policy)", () => {
    const result = loginSchema.safeParse({ email: "ada@example.com", password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "ada@example.com", password: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({ email: "nope", password: "x" });
    expect(result.success).toBe(false);
  });
});

describe("magicLinkSchema", () => {
  it("accepts a valid email", () => {
    expect(magicLinkSchema.safeParse({ email: "ada@example.com" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(magicLinkSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("passwordResetRequestSchema", () => {
  it("accepts a valid email", () => {
    expect(
      passwordResetRequestSchema.safeParse({ email: "ada@example.com" }).success
    ).toBe(true);
  });
});

describe("newPasswordSchema", () => {
  it("accepts matching passwords", () => {
    const result = newPasswordSchema.safeParse({
      password: "correct-horse",
      confirmPassword: "correct-horse",
    });
    expect(result.success).toBe(true);
  });

  it("reports a mismatch on the confirmPassword path", () => {
    const result = newPasswordSchema.safeParse({
      password: "correct-horse",
      confirmPassword: "different",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const { fieldErrors } = z.flattenError(result.error);
      expect(fieldErrors.confirmPassword).toBeDefined();
    }
  });

  it("rejects the same 72-byte-overweight password as signup", () => {
    const overweightPassword = "á".repeat(40);
    const result = newPasswordSchema.safeParse({
      password: overweightPassword,
      confirmPassword: overweightPassword,
    });
    expect(result.success).toBe(false);
  });
});
