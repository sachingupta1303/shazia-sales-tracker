import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import type { AppUser, UserRole } from "@/types"

// ─── Static Users (v1 — replace with DB in v2) ────────────────────────────────
// salesPersonName must exactly match the "Sales Person" column in PI_BACKEND_MASTER

const USERS: (AppUser & { password: string })[] = [
  {
    id: "1",
    name: "Mohit Gupta",
    email: "mohit@shaziarice.com",
    password: process.env.USER_MOHIT_PASSWORD ?? "changeme",
    role: "SALES_PERSON",
    salesPersonName: "MOHIT GUPTA",
  },
  {
    id: "2",
    name: "Mohit Sharma",
    email: "mohit.sharma@shaziarice.com",
    password: process.env.USER_MOHIT_SHARMA_PASSWORD ?? "changeme",
    role: "SALES_PERSON",
    salesPersonName: "MOHIT SHARMA",
  },
  {
    id: "3",
    name: "Atif",
    email: "atif@shaziarice.com",
    password: process.env.USER_ATIF_PASSWORD ?? "changeme",
    role: "SALES_PERSON",
    salesPersonName: "ATIF",
  },
  {
    id: "4",
    name: "Anief",
    email: "anief@shaziarice.com",
    password: process.env.USER_ANIEF_PASSWORD ?? "changeme",
    role: "SALES_PERSON",
    salesPersonName: "ANIEF",
  },
  {
    id: "5",
    name: "Aameer",
    email: "aameer@shaziarice.com",
    password: process.env.USER_AAMEER_PASSWORD ?? "changeme",
    role: "SALES_PERSON",
    salesPersonName: "AAMEER",
  },
  {
    id: "6",
    name: "Abid",
    email: "abid@shaziarice.com",
    password: process.env.USER_ABID_PASSWORD ?? "changeme",
    role: "SALES_PERSON",
    salesPersonName: "ABID",
  },
  {
    id: "10",
    name: "Manager",
    email: "manager@shaziarice.com",
    password: process.env.USER_MANAGER_PASSWORD ?? "changeme",
    role: "MANAGER",
    salesPersonName: undefined,
  },
  {
    id: "11",
    name: "Director",
    email: "director@shaziarice.com",
    password: process.env.USER_DIRECTOR_PASSWORD ?? "changeme",
    role: "DIRECTOR",
    salesPersonName: undefined,
  },
  {
    id: "12",
    name: "Sachin (Super Admin)",
    email: "research@shaziarice.com",
    password: process.env.USER_SUPERADMIN_PASSWORD ?? "changeme",
    role: "DIRECTOR",
    salesPersonName: undefined,
  },
]

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize(credentials) {
        const user = USERS.find(
          (u) =>
            u.email === credentials?.email &&
            u.password === credentials?.password
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
