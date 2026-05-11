import { auth } from "@/lib/auth"
import { TargetsAdminClient } from "./targets-admin-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const metadata = { title: "Target Editor · Admin | Shazia Rice" }
export const dynamic  = "force-dynamic"

export default async function AdminTargetsPage() {
  const session = await auth()
  const user    = session?.user as AppUser

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Target Editor"
        subtitle="Edit buyer-level FY targets · all changes logged with audit trail"
      >
        <a href="/admin" className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
          ← Admin home
        </a>
      </PageHeader>
      <TargetsAdminClient userRole={user?.role} />
    </div>
  )
}
