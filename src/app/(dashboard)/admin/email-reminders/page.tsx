import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import type { AppUser } from "@/types"
import { EmailRemindersClient } from "./email-reminders-client"

export const metadata = { title: "Email Reminders | Admin | Shazia Rice" }

export default async function EmailRemindersPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const user = session.user as AppUser
  const allowed = ["MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN"]
  if (!allowed.includes(user.role)) redirect("/dashboard")
  return <EmailRemindersClient />
}
