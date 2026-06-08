import { auth } from "@/lib/auth"
import { ControlPanelClient } from "./control-panel-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const metadata = { title: "Control Panel · Settings | Shazia Rice" }
export const dynamic  = "force-dynamic"

const ALLOWED = ["MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN"]

export default async function ControlPanelPage() {
  const session = await auth()
  const user    = session?.user as AppUser

  if (!user || !ALLOWED.includes(user.role)) {
    return (
      <div className="flex-1 p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
          ⛔ You don’t have permission to access the Control Panel.
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="🎛️ Control Panel"
        subtitle="Edit targets, buyers, tiers & meetings — changes save to the sheet and reflect everywhere"
      >
        <a href="/admin" className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
          ← Admin home
        </a>
      </PageHeader>
      <ControlPanelClient userRole={user.role} />
    </div>
  )
}
