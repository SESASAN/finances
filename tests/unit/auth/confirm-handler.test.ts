import { describe, expect, it, vi } from "vitest";
import { createConfirmHandler, ALLOWED_OTP_TYPES } from "@/features/auth/confirm-handler";

function createFakeClient(verifyOtp: ReturnType<typeof vi.fn>) {
  return async () => ({ auth: { verifyOtp } }) as never;
}

describe("ALLOWED_OTP_TYPES", () => {
  it("is the runtime allow-list guarding EmailOtpType's (string & {}) TS widening", () => {
    expect(ALLOWED_OTP_TYPES).toEqual(["signup", "magiclink", "recovery", "email_change", "email"]);
  });
});

describe("createConfirmHandler", () => {
  it("row 1: redirects to /auth-error?reason=missing_token when token_hash is missing", async () => {
    const verifyOtp = vi.fn();
    const handler = createConfirmHandler(createFakeClient(verifyOtp));

    const response = await handler(new Request("https://app.test/auth/confirm?type=magiclink"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/auth-error?reason=missing_token");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("row 1: redirects to /auth-error?reason=missing_token when type is missing", async () => {
    const verifyOtp = vi.fn();
    const handler = createConfirmHandler(createFakeClient(verifyOtp));

    const response = await handler(new Request("https://app.test/auth/confirm?token_hash=abc"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/auth-error?reason=missing_token");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("row 2: rejects a type not in the runtime allow-list", async () => {
    const verifyOtp = vi.fn();
    const handler = createConfirmHandler(createFakeClient(verifyOtp));

    const response = await handler(
      new Request("https://app.test/auth/confirm?token_hash=abc&type=admin")
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/auth-error?reason=invalid_type");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("row 1: treats an empty type as missing (falls under the missing_token case)", async () => {
    const verifyOtp = vi.fn();
    const handler = createConfirmHandler(createFakeClient(verifyOtp));

    const response = await handler(
      new Request("https://app.test/auth/confirm?token_hash=abc&type=")
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/auth-error?reason=missing_token");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("row 3: redirects to /auth-error?reason=link_expired when verifyOtp errors", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "otp_expired", message: "expired" },
    });
    const handler = createConfirmHandler(createFakeClient(verifyOtp));

    const response = await handler(
      new Request("https://app.test/auth/confirm?token_hash=abc&type=magiclink")
    );

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "magiclink" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/auth-error?reason=link_expired");
  });

  it("row 4: recovery success ignores next and always redirects to /reset-password", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { user: { id: "1" }, session: { access_token: "x" } },
      error: null,
    });
    const handler = createConfirmHandler(createFakeClient(verifyOtp));

    const response = await handler(
      new Request(
        "https://app.test/auth/confirm?token_hash=abc&type=recovery&next=%2Fdashboard"
      )
    );

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "recovery" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/reset-password");
  });

  it("row 5: non-recovery success redirects to safeNextPath(next)", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { user: { id: "1" }, session: { access_token: "x" } },
      error: null,
    });
    const handler = createConfirmHandler(createFakeClient(verifyOtp));

    const response = await handler(
      new Request(
        "https://app.test/auth/confirm?token_hash=abc&type=signup&next=%2Fdashboard"
      )
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/dashboard");
  });

  it("row 5: sanitizes an unsafe next on non-recovery success", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { user: { id: "1" }, session: { access_token: "x" } },
      error: null,
    });
    const handler = createConfirmHandler(createFakeClient(verifyOtp));

    const response = await handler(
      new Request(
        "https://app.test/auth/confirm?token_hash=abc&type=email&next=%2F%5Cevil.com"
      )
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/");
  });
});
