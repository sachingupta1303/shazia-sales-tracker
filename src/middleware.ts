import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Public paths — no auth required
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/meeting-done",                       // magic-link meeting completion (coordinators, no login)
  "/api/8020/meetings/complete-token",   // token-based API (no login)
  "/api/8020/cron-batch",               // cron endpoint — auth handled inside route (Bearer token)
  "/api/8020/send-test-to-owner",       // temp test endpoint — auth handled inside route
  "/api/debug",                          // SMTP debug
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public routes through immediately
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Check for NextAuth session cookie (any of the known names)
  const hasSession =
    req.cookies.has("next-auth.session-token") ||
    req.cookies.has("__Secure-next-auth.session-token") ||
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token")

  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
