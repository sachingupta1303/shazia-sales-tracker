import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import type { AppUser } from "@/types"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const user = session.user as AppUser

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 flex flex-col h-screen overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
