// Repo root, sibling of app/. THREE lines. Never grows.
//
// Next.js 16: `middleware.ts` is DEPRECATED and renamed to `proxy.ts`; the export is
// named `proxy`, not `middleware`. Do NOT add `export const runtime` here — Proxy
// defaults to the Node.js runtime (not Edge) in Next 16, and setting `runtime` in a
// Proxy file throws.
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/auth/session-proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Without a matcher, Proxy runs on EVERY request including _next/static and
    // public/ assets — auth redirects would block CSS, JS and images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
