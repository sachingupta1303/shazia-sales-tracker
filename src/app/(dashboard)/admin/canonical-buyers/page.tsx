import { auth } from "@/lib/auth"
import { CanonicalAdminClient } from "./canonical-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const metadata = { title: "Canonical Buyers · Admin | Shazia Rice" }
export const dynamic  = "force-dynamic"

export default async function AdminCanonicalPage() {
  const session = await auth()
  const user    = session?.user as AppUser

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Canonical Buyer Map"
        subtitle="Map alias variants → canonical buyer · create new canonical records"
      >
        <a href="/admin" className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
          ← Admin home
        </a>
      </PageHeader>
      <CanonicalAdminClient userRole={user?.role} />
    </div>
  )
}
