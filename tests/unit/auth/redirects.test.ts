import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEXT_PATH,
  resolveAuthRedirect,
  safeNextPath,
} from "@/lib/auth/redirects";

describe("safeNextPath", () => {
  it("returns a valid relative path unchanged", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
  });

  it("preserves query string and hash on a valid relative path", () => {
    expect(safeNextPath("/a/b?x=1#y")).toBe("/a/b?x=1#y");
  });

  it.each([null, undefined, ""])(
    "returns the default fallback for %s",
    (raw) => {
      expect(safeNextPath(raw)).toBe(DEFAULT_NEXT_PATH);
    }
  );

  it("rejects protocol-relative hosts", () => {
    expect(safeNextPath("//evil.com")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects backslash hosts (browsers normalize \\ to /)", () => {
    expect(safeNextPath("/\\evil.com")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects double-encoded protocol-relative hosts (%2f%2f)", () => {
    expect(safeNextPath("/%2f%2fevil.com")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects encoded backslash hosts (%5c)", () => {
    expect(safeNextPath("/%5cevil.com")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects absolute https URLs", () => {
    expect(safeNextPath("https://evil.com/phish")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects absolute http URLs", () => {
    expect(safeNextPath("http://evil.com")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects javascript: scheme URLs", () => {
    expect(safeNextPath("javascript:alert(1)")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects data: scheme URLs", () => {
    expect(safeNextPath("data:text/html,<script>alert(1)</script>")).toBe(
      DEFAULT_NEXT_PATH
    );
  });

  it("rejects a bare hostname with no leading slash", () => {
    expect(safeNextPath("evil.com")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects raw newline control chars (header injection)", () => {
    expect(safeNextPath("/foo\nSet-Cookie: x")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects raw CRLF control chars (header injection)", () => {
    expect(safeNextPath("/foo\r\nLocation: https://evil.com")).toBe(
      DEFAULT_NEXT_PATH
    );
  });

  it("rejects a raw space control char", () => {
    expect(safeNextPath("/ foo")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects destinations under /auth/ (loop guard)", () => {
    expect(safeNextPath("/auth/confirm?token_hash=x")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects destinations under /api/", () => {
    expect(safeNextPath("/api/whatever")).toBe(DEFAULT_NEXT_PATH);
  });

  it("returns the fallback when decodeURIComponent throws on a malformed sequence", () => {
    expect(safeNextPath("/%")).toBe(DEFAULT_NEXT_PATH);
  });

  it("respects a custom fallback", () => {
    expect(safeNextPath("//evil.com", "/safe-landing")).toBe("/safe-landing");
  });

  it("respects a custom fallback for empty input", () => {
    expect(safeNextPath("", "/safe-landing")).toBe("/safe-landing");
  });
});

describe("resolveAuthRedirect", () => {
  it("redirects an unauthenticated user away from a protected path, preserving next", () => {
    expect(
      resolveAuthRedirect({
        hasUser: false,
        pathname: "/acme/dashboard",
        search: "?tab=overview",
      })
    ).toEqual({
      kind: "redirect",
      to: `/login?next=${encodeURIComponent("/acme/dashboard?tab=overview")}`,
    });
  });

  it("lets an unauthenticated user reach a public exact path", () => {
    expect(
      resolveAuthRedirect({ hasUser: false, pathname: "/login", search: "" })
    ).toEqual({ kind: "continue" });
  });

  it("redirects a signed-in user away from /login to /", () => {
    expect(
      resolveAuthRedirect({ hasUser: true, pathname: "/login", search: "" })
    ).toEqual({ kind: "redirect", to: "/" });
  });

  it("lets a signed-in user stay on /reset-password (recovery session exception)", () => {
    expect(
      resolveAuthRedirect({
        hasUser: true,
        pathname: "/reset-password",
        search: "",
      })
    ).toEqual({ kind: "continue" });
  });

  it("lets a signed-in user continue on any other path", () => {
    expect(
      resolveAuthRedirect({
        hasUser: true,
        pathname: "/acme/dashboard",
        search: "",
      })
    ).toEqual({ kind: "continue" });
  });

  it("lets an unauthenticated user reach the /auth/* callback handlers", () => {
    expect(
      resolveAuthRedirect({
        hasUser: false,
        pathname: "/auth/confirm",
        search: "?token_hash=x&type=magiclink",
      })
    ).toEqual({ kind: "continue" });
  });

  it("round-trips a legitimate next value through safeNextPath unchanged", () => {
    const decision = resolveAuthRedirect({
      hasUser: false,
      pathname: "/acme/dashboard",
      search: "",
    });

    expect(decision.kind).toBe("redirect");
    if (decision.kind !== "redirect") throw new Error("unreachable");

    const params = new URLSearchParams(decision.to.split("?")[1]);
    const next = params.get("next");

    expect(safeNextPath(next)).toBe("/acme/dashboard");
  });
});
