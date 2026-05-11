import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import type { AppUser, UserRole } from "@/types"

// ─── Static Users (v1 — replace with DB in v2) ────────────────────────────────
// salesPersonName must exactly match the "Sales Person" column in PI_BACKEND_MASTER


export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        
        const { getCredentials } = await import("@/lib/data")
        const users = await getCredentials()
        
        const user = users.find(
          (u) =>
            u.email.toLowerCase() === (credentials.email as string).toLowerCase() &&
            u.password === credentials.password
        )
        if (!user) return null
        const { password: _, ...safeUser } = user
        return safeUser
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
  },
  session: {
    strategy: "jwt",
  },
})
