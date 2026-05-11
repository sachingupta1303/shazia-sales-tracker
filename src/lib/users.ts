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
  role:        "SALES_PERSON" | "MANAGER" | "DIRECTOR"
}

export const USERS: UserMeta[] = [
  { salesPerson: "MOHIT GUPTA",  name: "Mohit Gupta",  email: "mohit.gupta@shaziarice.com",  role: "SALES_PERSON" },
  { salesPerson: "MOHIT SHARMA", name: "Mohit Sharma", email: "mohit.sharma@shaziarice.com", role: "SALES_PERSON" },
  { salesPerson: "ATIF",         name: "Atif",          email: "atif@shaziarice.com",         role: "SALES_PERSON" },
  { salesPerson: "ANIEF",        name: "Anief",         email: "anief@shaziarice.com",        role: "SALES_PERSON" },
  { salesPerson: "AAMEER",       name: "Aameer",        email: "aameer@shaziarice.com",       role: "SALES_PERSON" },
  { salesPerson: "ABID",         name: "Abid",          email: "abid@shaziarice.com",         role: "SALES_PERSON" },
  // Managers / Directors don't have a salesPerson key but still receive emails
  { salesPerson: "",             name: "Manager",      email: "manager@shaziarice.com",       role: "MANAGER"  },
  { salesPerson: "",             name: "Director",     email: "director@shaziarice.com",      role: "DIRECTOR" },
  { salesPerson: "",             name: "Sachin",       email: "research@shaziarice.com",      role: "DIRECTOR" },
]

export const ALL_SALES_PERSONS: string[] =
  USERS.filter((u) => u.role === "SALES_PERSON" && u.salesPerson).map((u) => u.salesPerson)

export function emailForSalesPerson(sp: string | undefined): string | null {
  if (!sp) return null
  const u = USERS.find((x) => x.salesPerson.toLowerCase() === sp.toLowerCase())
  return u?.email ?? null
}

export function managerEmails(): string[] {
  return USERS.filter((u) => u.role === "MANAGER" || u.role === "DIRECTOR").map((u) => u.email)
}
