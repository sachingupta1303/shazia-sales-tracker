import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCurrentFY, getCurrentFYWeek } from "@/lib/fy-utils"
import {
  getRiskBuyersByCoordinator, signReviewToken,
  sendPendingCoordinatorReviewReminders,
} from "@/lib/coordinator-review"
import { getCoordinatorReviews } from "@/lib/data"
import { APP_BASE_URL } from "@/lib/mailer"
import type { AppUser } from "@/types"

export const dynamic = "force-dynamic"

// GET — consolidation for the manager: per-coordinator status + links + this week's submissions
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if ((session.user as AppUser).role === "SALES_PERSON")
    return NextResponse.json({ error: "Access denied" }, { status: 403 })

  const fy   = getCurrentFY()
  const week = getCurrentFYWeek()
  const [groups, reviews] = await Promise.all([
    getRiskBuyersByCoordinator(fy),
    getCoordinatorReviews(fy, week),
  ])

  // latest submission per (coordinator + buyer) this week
  const latest = new Map<string, typeof reviews[number]>()
  for (const r of reviews) {
    const k = `${r.salesCoordinator.toLowerCase()}|${r.buyerName.toLowerCase()}`
    const cur = latest.get(k)
    if (!cur || (r.submittedAt || "") > (cur.submittedAt || "")) latest.set(k, r)
  }
  const dedupReviews = [...latest.values()]

  const submittedByCoord = new Map<string, number>()
  for (const r of dedupReviews) {
    const k = r.salesCoordinator.toLowerCase()
    submittedByCoord.set(k, (submittedByCoord.get(k) ?? 0) + 1)
  }

  const coordinators = groups.map((g) => {
    const submitted = submittedByCoord.get(g.coordinator.toLowerCase()) ?? 0
    const token = signReviewToken({ coordinator: g.coordinator, fyWeek: week, fy })
    return {
      coordinator:  g.coordinator,
      email:        g.email,
      riskCount:    g.buyers.length,
      submitted,
      pending:      g.buyers.length - submitted,
      isDone:       submitted > 0,
      link:         `${APP_BASE_URL}/coord-review/${token}`,
      buyers:       g.buyers,
    }
  })

  return NextResponse.json({ fy, week, coordinators, reviews: dedupReviews })
}

// POST — manually trigger sending review links to pending coordinators now
export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if ((session.user as AppUser).role === "SALES_PERSON")
    return NextResponse.json({ error: "Access denied" }, { status: 403 })

  const result = await sendPendingCoordinatorReviewReminders()
  return NextResponse.json({ ok: true, ...result })
}
