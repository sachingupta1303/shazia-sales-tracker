import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Dashboard8020Client } from "./dashboard-client"
import type { AppUser } from "@/types"

export default async function Page8020() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const user = session.user as unknown as AppUser
  return <Dashboard8020Client user={user} />
}
