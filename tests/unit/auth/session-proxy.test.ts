// SPIKE (design §5 / tasks 2.5): best-effort, NOT strict-TDD-blocking. All branching
// this file exercises is already covered by `resolveAuthRedirect` (lib/auth/redirects.ts,
// fully TDD'd in Unit 1). This suite only needs to confirm the plumbing — that Supabase's
// setAll callback actually writes cookies onto the SAME NextResponse instance that gets
// returned, per the correctness comment in lib/auth/session-proxy.ts.
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        setAll: (
          cookies: { name: string; value: string; options: Record<string, unknown> }[],
          headers: Record<string, string>
        ) => void;
      };
    }
  ) => {
    // Simulate a token refresh: Supabase calls setAll with a fresh access token and the
    // cache-control headers documented in @supabase/ssr's SetAllCookies type.
    options.cookies.setAll(
      [{ name: "sb-access-token", value: "refreshed", options: { path: "/" } }],
      { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0" }
    );
    return { auth: { getUser: mockGetUser } };
  },
}));

vi.mock("@/lib/auth/supabase-env", () => ({
  readSupabaseEnv: () => ({
    url: "https://app.test.supabase.co",
    anonKey: "anon-key",
    appUrl: "https://app.test",
  }),
}));

import { updateSession } from "@/lib/auth/session-proxy";

describe("updateSession (spike)", () => {
  it("returns a response carrying the refreshed cookie when the route is public", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const request = new NextRequest("https://app.test/login");

    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(response.cookies.get("sb-access-token")?.value).toBe("refreshed");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("redirects to /login and still carries the refreshed cookie for a protected path with no user", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const request = new NextRequest("https://app.test/acme/dashboard");

    const response = await updateSession(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/login?next=%2Facme%2Fdashboard");
    expect(response.cookies.get("sb-access-token")?.value).toBe("refreshed");
  });

  it("continues (no redirect) for an authenticated request to a protected path", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } } });
    const request = new NextRequest("https://app.test/acme/dashboard");

    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });
});
