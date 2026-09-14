import { describe, expect, it, vi } from "vitest";
import { createCallbackHandler } from "@/features/auth/callback-handler";

function createFakeClient(exchangeCodeForSession: ReturnType<typeof vi.fn>) {
  return async () =>
    ({ auth: { exchangeCodeForSession } }) as never;
}

describe("createCallbackHandler", () => {
  it("row 1: redirects to /auth-error?reason=oauth_denied when Google returns an error param", async () => {
    const exchangeCodeForSession = vi.fn();
    const handler = createCallbackHandler(createFakeClient(exchangeCodeForSession));

    const response = await handler(
      new Request("https://app.test/auth/callback?error=access_denied&error_description=<script>alert(1)</script>")
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/auth-error?reason=oauth_denied");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("row 2: redirects to /auth-error?reason=missing_code when there is no code", async () => {
    const exchangeCodeForSession = vi.fn();
    const handler = createCallbackHandler(createFakeClient(exchangeCodeForSession));

    const response = await handler(new Request("https://app.test/auth/callback"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/auth-error?reason=missing_code");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("row 3: redirects to /auth-error?reason=exchange_failed when exchangeCodeForSession errors", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "flow_state_expired", message: "expired" },
    });
    const handler = createCallbackHandler(createFakeClient(exchangeCodeForSession));

    const response = await handler(new Request("https://app.test/auth/callback?code=abc123"));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/auth-error?reason=exchange_failed");
  });

  it("row 4: redirects to safeNextPath(next) on success", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { user: { id: "1" }, session: { access_token: "x" } },
      error: null,
    });
    const handler = createCallbackHandler(createFakeClient(exchangeCodeForSession));

    const response = await handler(
      new Request("https://app.test/auth/callback?code=abc123&next=%2Fdashboard")
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/dashboard");
  });

  it("sanitizes an unsafe next (protocol-relative) to the default path on success", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { user: { id: "1" }, session: { access_token: "x" } },
      error: null,
    });
    const handler = createCallbackHandler(createFakeClient(exchangeCodeForSession));

    const response = await handler(
      new Request("https://app.test/auth/callback?code=abc123&next=%2F%2Fevil.com")
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/");
  });

  it("never reflects error_description into the Location header", async () => {
    const exchangeCodeForSession = vi.fn();
    const handler = createCallbackHandler(createFakeClient(exchangeCodeForSession));

    const response = await handler(
      new Request(
        "https://app.test/auth/callback?error=access_denied&error_description=%3Cscript%3Ealert(1)%3C%2Fscript%3E"
      )
    );

    const location = response.headers.get("location") ?? "";
    expect(location).not.toContain("script");
    expect(location).not.toContain("alert");
  });
});
