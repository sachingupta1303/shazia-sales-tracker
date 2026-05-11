import { auth } from "@/lib/auth"
import { LeadLagClient } from "./lead-lag-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const metadata = { title: "Lead / Lag | Shazia Rice" }
export const dynamic  = "force-dynamic"

export default async function LeadLagPage() {
  const session = await auth()
  const user    = session?.user as AppUser

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Lead / Lag Dashboard"
        subtitle="Lead activities (calls · emails · samples) → Lag results (containers · orders)"
      />
      <LeadLagClient userRole={user?.role} salesPerson={user?.salesPersonName} />
    </div>
  )
}
