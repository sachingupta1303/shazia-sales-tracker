import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getPendingReviews } from "@/lib/data"
import { getCurrentFY, getCurrentFYWeek } from "@/lib/fy-utils"
import { ALL_SALES_PERSONS } from "@/lib/users"
import type { AppUser } from "@/types"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  const url  = new URL(req.url)
  const lookback = Number(url.searchParams.get("lookback") ?? "4")

  // SALES_PERSON only sees their own pending reviews
  const sps = user.role === "SALES_PERSON"
    ? (user.salesPersonName ? [user.salesPersonName] : [])
    : ALL_SALES_PERSONS

  if (sps.length === 0) {
    return NextResponse.json({ pending: [], summary: { totalPending: 0, peopleAffected: 0 }, currentWeek: getCurrentFYWeek() })
  }

  const pending = await getPendingReviews({
    currentFY:     getCurrentFY(),
    currentWeek:   getCurrentFYWeek(),
    salesPersons:  sps,
    lookbackWeeks: lookback,
  })

  // Summary by SP
  const bySalesPerson: Record<string, number> = {}
  for (const p of pending) {
    bySalesPerson[p.salesPerson] = (bySalesPerson[p.salesPerson] ?? 0) + 1
  }

  return NextResponse.json({
    pending,
    summary: {
      totalPending:    pending.length,
      peopleAffected:  Object.keys(bySalesPerson).length,
      bySalesPerson,
    },
    currentWeek: getCurrentFYWeek(),
    currentFY:   getCurrentFY(),
  })
}
