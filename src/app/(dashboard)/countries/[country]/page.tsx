import { auth } from "@/lib/auth"
import { StrategyClient } from "./strategy-client"
import { PageHeader } from "@/components/ui/page-header"
import type { AppUser } from "@/types"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }) {
  const { country } = await params
  return { title: `${decodeURIComponent(country)} Strategy | Shazia Rice` }
}

// Static list of sales persons for travel-plan assignee dropdown
const ALL_SP = ["MOHIT GUPTA", "MOHIT SHARMA", "ATIF", "ANIEF", "AAMEER", "ABID"]

export default async function CountryStrategyPage({
  params,
}: {
  params: Promise<{ country: string }>
}) {
  const session = await auth()
  const user    = session?.user as AppUser
  const { country } = await params
  const decoded = decodeURIComponent(country)

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title={decoded}
        subtitle="Country strategy · Buyer coverage · Cycle performance · Travel plans"
      >
        <a
          href="/countries"
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← All Countries
        </a>
      </PageHeader>
      <StrategyClient
        country={decoded}
        userRole={user?.role}
        userName={user?.name}
        allSalesPersons={ALL_SP}
      />
    </div>
  )
}
