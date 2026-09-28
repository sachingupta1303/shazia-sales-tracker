import { auth } from "@/lib/auth"
import { CoordinatorReviewClient } from "./coordinator-review-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const metadata = { title: "Weekly Review | Shazia Rice" }
export const dynamic  = "force-dynamic"

const ALLOWED = ["MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN", "USER"]

export default async function CoordinatorReviewPage() {
  const session = await auth()
  const user    = session?.user as AppUser

  if (!user || !ALLOWED.includes(user.role)) {
    return (
      <div className="flex-1 p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
          ⛔ You don’t have permission to view the Weekly Review workspace.
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="📝 Weekly Coordinator Review"
        subtitle="Good buyers with no / low orders — coordinators fill reasons · Friday director review"
      />
      <CoordinatorReviewClient />
    </div>
  )
}
