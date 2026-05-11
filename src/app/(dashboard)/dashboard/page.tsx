import { auth } from "@/lib/auth"
import { DashboardClient } from "./dashboard-client"
import type { AppUser } from "@/types"

export const metadata = { title: "Dashboard | Shazia Rice" }
export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const session = await auth()
  const user = session?.user as AppUser

  return (
    <div className="flex-1 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-800">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Basmati &amp; Non-Basmati Export · FY 2026-27
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Logged in as</p>
          <p className="text-sm font-semibold text-gray-800">{user?.name}</p>
        </div>
      </div>

      <DashboardClient userRole={user?.role} salesPerson={user?.salesPersonName} />
    </div>
  )
}
