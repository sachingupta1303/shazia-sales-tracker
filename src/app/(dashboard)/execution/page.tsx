import { auth } from "@/lib/auth"
import { ExecutionClient } from "./execution-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const metadata = { title: "12-Week Execution | Shazia Rice" }
export const dynamic  = "force-dynamic"

export default async function ExecutionPage() {
  const session = await auth()
  const user    = session?.user as AppUser

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="12-Week Execution"
        subtitle="Cycle progress · Weekly scorecard · Review log"
      />
      <ExecutionClient userRole={user?.role} salesPerson={user?.salesPersonName} />
    </div>
  )
}
