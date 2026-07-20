import { auth } from "@/lib/auth"
import { MergeBuyersClient } from "./merge-buyers-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const metadata = { title: "Merge Buyers · Admin | Shazia Rice" }
export const dynamic  = "force-dynamic"

const ALLOWED = ["MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN"]

export default async function MergeBuyersPage() {
  const session = await auth()
  const user    = session?.user as AppUser

  if (!user || !ALLOWED.includes(user.role)) {
    return (
      <div className="flex-1 p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
          ⛔ You don’t have permission to merge buyers.
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="🔗 Merge Buyers"
        subtitle="Ek hi buyer ke do naam? Dono ko ek me jodo — target + actual ek jagah aayega"
      >
        <a href="/admin" className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
          ← Admin home
        </a>
      </PageHeader>
      <MergeBuyersClient />
    </div>
  )
}
