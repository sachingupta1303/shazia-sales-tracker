import { auth } from "@/lib/auth"
import { getPIRecords } from "@/lib/data"
import { PerformanceClient } from "./performance-client"
import { PageHeader } from "@/components/ui/page-header"
import { ALL_SALES_PERSONS } from "@/lib/users"
import type { AppUser } from "@/types"

export const metadata = { title: "Performance | Shazia Rice" }
export const dynamic  = "force-dynamic"

export default async function PerformancePage() {
  const session = await auth()
  const user    = session?.user as AppUser

  // Pre-fetch country list server-side so the filter dropdown is populated immediately
  const allPI = await getPIRecords()
  const allCountries = [...new Set(allPI.map((r) => r.countries).filter(Boolean))]
    .map((c) => c.toUpperCase())
    .sort()

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Performance"
        subtitle="Buyer · Country · Sales Person · Coordinator — review dashboard"
      />
      <PerformanceClient
        userRole={user?.role}
        salesPerson={user?.salesPersonName}
        allSalesPersons={ALL_SALES_PERSONS}
        allCountries={allCountries}
      />
    </div>
  )
}
