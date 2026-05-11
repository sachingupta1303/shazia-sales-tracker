import { auth } from "@/lib/auth"
import { KeyAccountsClient } from "./key-accounts-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const metadata = { title: "Key Accounts | Shazia Rice" }
export const dynamic  = "force-dynamic"

export default async function KeyAccountsPage() {
  const session = await auth()
  const user    = session?.user as AppUser

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Key Accounts"
        subtitle="DASH VIP & DASH Strategic · Meeting compliance · Task allocation"
      />
      <KeyAccountsClient userRole={user?.role} salesPerson={user?.salesPersonName} />
    </div>
  )
}
