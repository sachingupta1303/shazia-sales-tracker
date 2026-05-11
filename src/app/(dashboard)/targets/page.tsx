import { auth } from "@/lib/auth"
import { TargetsClient } from "./targets-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const metadata = { title: "Target vs Actual | Shazia Rice" }
export const dynamic  = "force-dynamic"

export default async function TargetsPage() {
  const session = await auth()
  const user    = session?.user as AppUser

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Target vs Actual"
        subtitle="Country · Buyer · Sales Person performance tracking"
      />
      <TargetsClient userRole={user?.role} salesPerson={user?.salesPersonName} />
    </div>
  )
}
