import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { ReportClient } from "./ReportClient"
import type { AppUser } from "@/types"

export const metadata = { title: "Monthly MIS Report | Shazia Rice" }
export const dynamic  = "force-dynamic"

export default async function MonthlyReportPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const user = session.user as AppUser

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <ReportClient userRole={user.role} />
    </div>
  )
}
