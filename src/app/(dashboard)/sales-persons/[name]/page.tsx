import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { SalesPersonWorkspaceClient } from "./workspace-client"
import type { AppUser } from "@/types"

export default async function SalesPersonPage({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const user = session.user as unknown as AppUser
  const { name: rawName } = await params
  const name = decodeURIComponent(rawName)

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <SalesPersonWorkspaceClient 
        salesPersonName={name}
        userRole={user.role}
        userName={user.name}
      />
    </div>
  )
}
