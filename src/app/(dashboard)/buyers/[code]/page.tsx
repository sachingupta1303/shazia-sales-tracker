import { auth } from "@/lib/auth"
import { WorkspaceClient } from "./workspace-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const dynamic = "force-dynamic"

interface Props { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props) {
  return { title: `Buyer Workspace | Shazia Rice` }
}

// Static list of sales persons for reassignment dropdown (matches auth.ts)
const ALL_SP = ["MOHIT GUPTA", "MOHIT SHARMA", "ATIF", "ANIEF", "AAMEER", "ABID"]

export default async function BuyerWorkspacePage({ params }: Props) {
  const session = await auth()
  const user    = session?.user as AppUser
  const { code: rawCode } = await params
  const code = decodeURIComponent(rawCode)

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Buyer Workspace"
        subtitle="Performance · Activity · Alerts · Order history"
      >
        <a
          href="/buyers"
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← All Buyers
        </a>
      </PageHeader>
      <WorkspaceClient
        code={code}
        userRole={user?.role}
        userName={user?.name}
        salesPerson={user?.salesPersonName}
        allSalesPersons={ALL_SP}
      />
    </div>
  )
}
