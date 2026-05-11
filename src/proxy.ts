import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PUBLIC_PATHS = ["/login", "/api/auth"]

export const proxy = auth(function proxy(req) {
  const { nextUrl, auth: session } = req as NextRequest & { auth: typeof req.auth }
  const isPublic = PUBLIC_PATHS.some((p) => nextUrl.pathname.startsWith(p))

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // Sales persons can only access their own data — enforced in API routes
  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
