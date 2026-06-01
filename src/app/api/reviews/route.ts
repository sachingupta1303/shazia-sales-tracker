import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getWeeklyReviews, addWeeklyReview,
  getPIRecords, getTargetRecords, filterPIByFY, sumContainers,
} from "@/lib/data"
import { getCurrentFY, getCurrentFYWeek, targetDueTillWeek } from "@/lib/fy-utils"
import type { AppUser } from "@/types"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user  = session.user as unknown as AppUser
  const isSP  = user.role === "SALES_PERSON"
  const url   = new URL(req.url)
  const sp    = isSP ? (user.salesPersonName ?? "") : (url.searchParams.get("salesPerson") ?? "")
  const fy    = url.searchParams.get("fy") ?? getCurrentFY()

  const reviews = await getWeeklyReviews(fy as any, sp || undefined)
  return NextResponse.json({ reviews })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  const body = await req.json()

  const currentFY   = getCurrentFY()
  const currentWeek = getCurrentFYWeek()

  // Auto-compute actual containers for the week from PI data if not supplied
  let actualContainers = body.actualContainers ?? 0
  if (!actualContainers) {
    const allPI   = await getPIRecords()
    const fyPI    = filterPIByFY(allPI, currentFY)
    const weekPI  = fyPI.filter(
      (r) => r.fyWeekNo === (body.fyWeek ?? currentWeek) &&
             (!body.salesPerson || r.salesPerson.toLowerCase() === body.salesPerson.toLowerCase())
    )
    actualContainers = sumContainers(weekPI)
  }

  // Auto-compute target if not supplied
  let targetContainers = body.targetContainers ?? 0
  if (!targetContainers) {
    const targets = await getTargetRecords(currentFY)
    const spTargets = body.salesPerson
      ? targets.filter((t) => t.salesPerson.toLowerCase() === body.salesPerson.toLowerCase())
      : targets
    const annual = spTargets.reduce((s, t) => s + t.currentYearTargetContainers, 0)
    targetContainers = parseFloat((annual / 52).toFixed(2))
  }

  const review = {
    fyWeek:           body.fyWeek ?? currentWeek,
    financialYear:    currentFY,
    reviewDate:       new Date().toISOString().split("T")[0],
    salesPerson:      body.salesPerson ?? (user.salesPersonName ?? user.name),
    targetContainers,
    actualContainers,
    openPIs:          body.openPIs ?? 0,
    blockers:         body.blockers ?? "",
    wins:             body.wins ?? "",
    nextWeekFocus:    body.nextWeekFocus ?? "",
    recordedBy:       user.name ?? user.email ?? "unknown",
    recordedAt:       new Date().toISOString(),
  }

  await addWeeklyReview(review)
  return NextResponse.json({ ok: true, review })
}
