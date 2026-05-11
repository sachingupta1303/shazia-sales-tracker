/**
 * Static map of sales person → email and role metadata.
 * Mirrors the user records in src/lib/auth.ts.
 *
 * Used for email notifications (Resend) and the admin reassignment flow.
 * Update emails here once real addresses are confirmed.
 */

export interface UserMeta {
  salesPerson: string  // matches PI_BACKEND_MASTER "Sales Person" column
  name:        string  // display name (matches auth.ts user.name)
  email:       string
  role:        string
}

export const USERS: UserMeta[] = [
  { salesPerson: "MOHIT GUPTA",  name: "Mohit Gupta",  email: "mohit.gupta@shaziarice.com",  role: "ADMIN" },
  { salesPerson: "MOHIT SHARMA", name: "Mohit Sharma", email: "sales2@shaziarice.com",       role: "USER" },
  { salesPerson: "ATIF",         name: "Atif",          email: "marketing@shaziarice.com",    role: "ADMIN" },
  { salesPerson: "ANAS",         name: "Anas",          email: "marketing2@shaziarice.com",   role: "USER" },
  { salesPerson: "AAMEER",       name: "Aameer",        email: "sales4@shaziarice.com",       role: "USER" },
  { salesPerson: "ABID",         name: "Abid",          email: "translator@shaziarice.com",    role: "USER" },
  { salesPerson: "VINAY SHARMA", name: "Vinay sharma",  email: "gm@shaziarice.com",           role: "ADMIN" },
  { salesPerson: "SHAHZAD",      name: "shahzad",       email: "translator2@shaziarice.com",  role: "USER" },
  { salesPerson: "",             name: "Sachin (Super Admin)", email: "research@shaziarice.com", role: "SUPER_ADMIN" },
]

export const ALL_SALES_PERSONS: string[] =
  USERS.filter((u) => (u.role === "USER" || u.role === "SALES_PERSON") && u.salesPerson).map((u) => u.salesPerson)

export function emailForSalesPerson(sp: string | undefined): string | null {
  if (!sp) return null
  const u = USERS.find((x) => x.salesPerson.toLowerCase() === sp.toLowerCase())
  return u?.email ?? null
}

export function managerEmails(): string[] {
  return USERS.filter((u) => 
    u.role === "MANAGER" || 
    u.role === "DIRECTOR" || 
    u.role === "ADMIN" || 
    u.role === "SUPER_ADMIN"
  ).map((u) => u.email)
}
