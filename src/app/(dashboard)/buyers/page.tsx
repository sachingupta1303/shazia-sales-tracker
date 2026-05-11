import { auth } from "@/lib/auth"
import { BuyersClient } from "./buyers-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const metadata = { title: "Buyers · 80/20 | Shazia Rice" }
export const dynamic  = "force-dynamic"

export default async function BuyersPage() {
  const session = await auth()
  const user    = session?.user as AppUser

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Buyers · 80/20 View"
        subtitle="Tier classification · Segment strategy · Health scores"
      />
      <BuyersClient userRole={user?.role} salesPerson={user?.salesPersonName} />
    </div>
  )
}
