import { auth } from "@/lib/auth"
import { SalesClient } from "./sales-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const metadata = { title: "Sales Tracker | Shazia Rice" }
export const dynamic  = "force-dynamic"

export default async function SalesPage() {
  const session = await auth()
  const user    = session?.user as AppUser

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4 min-h-0">
      <PageHeader
        title="Sales Tracker"
        subtitle="PI-level transaction data · current financial year"
      />
      <SalesClient userRole={user?.role} salesPerson={user?.salesPersonName} />
    </div>
  )
}
