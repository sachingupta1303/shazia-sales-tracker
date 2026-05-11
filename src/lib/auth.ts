import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import type { AppUser, UserRole } from "@/types"

// ─── Static Users (v1 — replace with DB in v2) ────────────────────────────────
// salesPersonName must exactly match the "Sales Person" column in PI_BACKEND_MASTER


export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) return null
          
          console.log("Auth: Attempting login for", credentials.email)
          const { getCredentials } = await import("@/lib/data")
          const users = await getCredentials()
          
          if (!users || users.length === 0) {
            console.error("Auth: No users fetched from source")
            return null
          }

          console.log("Auth: Fetched users count:", users.length)
          const user = users.find(
            (u) =>
              u.email.toLowerCase() === (credentials.email as string).toLowerCase() &&
              u.password === credentials.password
          )
          
          if (!user) {
            console.log("Auth: No user found with these credentials")
            return null
          }

          console.log("Auth: Login successful for", user.name)
          const { password: _, ...safeUser } = user
          return safeUser
        } catch (error) {
          console.error("Auth: Authorize error:", error)
          return null // Return null instead of throwing to avoid crashing NextAuth
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as AppUser).role
        token.salesPersonName = (user as AppUser).salesPersonName
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as unknown as AppUser).role = token.role as UserRole
        ;(session.user as unknown as AppUser).salesPersonName = token.salesPersonName as string | undefined
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login", // Redirect errors back to login page
  },
  session: {
    strategy: "jwt",
  },
})
