import { auth } from "@/lib/auth"
import { CountriesClient } from "./countries-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const metadata = { title: "Country Strategy | Shazia Rice" }
export const dynamic  = "force-dynamic"

export default async function CountriesPage() {
  const session = await auth()
  const user    = session?.user as AppUser

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Country Strategy"
        subtitle="Market performance · Buyer coverage · Growth tracking"
      />
      <CountriesClient userRole={user?.role} salesPerson={user?.salesPersonName} />
    </div>
  )
}
