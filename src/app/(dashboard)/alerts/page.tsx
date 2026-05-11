import { auth } from "@/lib/auth"
import { AlertsClient } from "./alerts-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const metadata = { title: "Alerts & Remarks | Shazia Rice" }
export const dynamic  = "force-dynamic"

export default async function AlertsPage() {
  const session = await auth()
  const user    = session?.user as AppUser

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Alerts & Remarks"
        subtitle="Trigger-based alerts · Missed pace · Dormant buyers"
      />
      <AlertsClient userRole={user?.role} salesPerson={user?.salesPersonName} />
    </div>
  )
}
