import { NextResponse } from "next/server"
import { getCurrentFY, getCurrentFYWeek } from "@/lib/fy-utils"
import {
  verifyReviewToken, getRiskForCoordinator,
} from "@/lib/coordinator-review"
import { getCoordinatorReviews, addCoordinatorReviews } from "@/lib/data"
import type { CoordinatorReviewRow } from "@/types"

export const dynamic = "force-dynamic"

// GET — load the review form data for the coordinator behind this token (no login)
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const t = verifyReviewToken(token)
  if (!t) return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 })

  const fy   = getCurrentFY()
  const week = getCurrentFYWeek()
  const [group, weekReviews] = await Promise.all([
    getRiskForCoordinator(fy, t.coordinator),
    getCoordinatorReviews(fy, week),
  ])
  const mine = weekReviews.filter((r) => r.salesCoordinator.toLowerCase() === t.coordinator.toLowerCase())

  return NextResponse.json({
    coordinator:     t.coordinator,
    fy, week,
    buyers:          group?.buyers ?? [],
    alreadySubmitted: mine.length > 0,
    submittedCount:   mine.length,
  })
}

// POST — save the coordinator's filled reasons (no login; token authorizes identity)
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const t = verifyReviewToken(token)
  if (!t) return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 })

  let body: { reviews?: Array<{ buyerName: string; reason?: string; remark?: string; actionPlan?: string; expectedOrder?: string }> }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }) }
  const input = body.reviews ?? []
  if (!input.length) return NextResponse.json({ error: "Nothing to submit" }, { status: 400 })

  const fy   = getCurrentFY()
  const week = getCurrentFYWeek()
  const group = await getRiskForCoordinator(fy, t.coordinator)
  const byName = new Map((group?.buyers ?? []).map((b) => [b.buyerName.toLowerCase(), b]))

  const now = new Date().toISOString()
  const reviewDate = now.split("T")[0]
  const rows: CoordinatorReviewRow[] = input
    .filter((r) => r.buyerName && (r.reason || r.remark || r.actionPlan || r.expectedOrder))
    .map((r) => {
      const b = byName.get(r.buyerName.toLowerCase())
      return {
        fyWeek:           week,
        financialYear:    fy,
        reviewDate,
        salesCoordinator: t.coordinator,
        buyerName:        r.buyerName,
        country:          b?.country ?? "",
        tier:             b?.tier ?? "",
        target:           b?.target ?? 0,
        actual:           b?.actual ?? 0,
        lastYear:         b?.lastYear ?? 0,
        lastOrderDate:    b?.lastOrderDate ?? "",
        status:           b?.status ?? "",
        reason:           (r.reason ?? "").slice(0, 200),
        remark:           (r.remark ?? "").slice(0, 500),
        actionPlan:       (r.actionPlan ?? "").slice(0, 500),
        expectedOrder:    (r.expectedOrder ?? "").slice(0, 60),
        submittedAt:      now,
      }
    })

  if (!rows.length) return NextResponse.json({ error: "Nothing to submit" }, { status: 400 })
  await addCoordinatorReviews(rows)
  return NextResponse.json({ ok: true, count: rows.length })
}
