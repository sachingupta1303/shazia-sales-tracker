import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Public paths — no login required
const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/meeting-done",                      // magic-link meeting completion (no login)
  "/api/8020/meetings/complete-token",  // token-based API (no login)
  "/api/debug",                         // SMTP debug endpoint
]

export const middleware = auth(function middleware(req) {
  const { nextUrl } = req as NextRequest
  const session = req.auth

  const isPublic = PUBLIC_PATHS.some((p) => nextUrl.pathname.startsWith(p))

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
