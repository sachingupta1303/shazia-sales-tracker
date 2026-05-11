import { auth } from "@/lib/auth"
import { OwnershipAdminClient } from "./ownership-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const metadata = { title: "Buyer Ownership · Admin | Shazia Rice" }
export const dynamic  = "force-dynamic"

// Static list of all sales persons (matches auth.ts)
const ALL_SP = ["MOHIT GUPTA", "MOHIT SHARMA", "ATIF", "ANIEF", "AAMEER", "ABID"]

export default async function AdminOwnershipPage() {
  const session = await auth()
  const user    = session?.user as AppUser

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Buyer Ownership"
        subtitle="Reassign primary or backup owners · view full reassignment history"
      >
        <a
          href="/admin"
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← Admin home
        </a>
      </PageHeader>
      <OwnershipAdminClient userRole={user?.role} allSalesPersons={ALL_SP} />
    </div>
  )
}
