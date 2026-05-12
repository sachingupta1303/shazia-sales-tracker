import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { DiagnosticsClient } from "./diagnostics-client"

export const metadata = { title: "Diagnostics | Shazia Rice" }
export const dynamic  = "force-dynamic"

export default async function DiagnosticsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  return <DiagnosticsClient />
}
