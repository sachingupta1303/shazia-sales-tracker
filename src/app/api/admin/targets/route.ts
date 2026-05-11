/**
 * Target Editor admin API.
 *
 * GET   /api/admin/targets               — list all FY targets with current actuals
 * POST  /api/admin/targets               — update a buyer's target containers
 *                                          body = { buyerName, financialYear, newTarget, reason }
 * GET   /api/admin/targets/audit?buyer=  — full edit history (added in same handler via ?audit=1)
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getTargetRecords, getPIRecords, filterPIByFY,
  updateBuyerTarget, getTargetAudit,
} from "@/lib/data"
import { getCurrentFY, getCurrentFYWeek, targetDueTillWeek } from "@/lib/fy-utils"
import type { AppUser, FinancialYear } from "@/types"

function requireManager(user: AppUser) {
  return user.role === "MANAGER" || user.role === "DIRECTOR"
}

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!requireManager(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url   = new URL(req.url)
  const audit = url.searchParams.get("audit") === "1"
  const buyer = url.searchParams.get("buyer") ?? ""

  if (audit) {
    const records = await getTargetAudit(buyer || undefined)
    return NextResponse.json({ audit: records })
  }

  const fy = (url.searchParams.get("fy") ?? getCurrentFY()) as FinancialYear
  const sp = url.searchParams.get("salesPerson") ?? ""

  const [targets, allPI] = await Promise.all([
    getTargetRecords(fy),
    getPIRecords(),
  ])
  const fyPI = filterPIByFY(allPI, fy)

  // Aggregate actuals by buyer name
  const actualByName = new Map<string, number>()
  for (const r of fyPI) {
    const k = r.buyerCompanyName.toLowerCase()
    actualByName.set(k, (actualByName.get(k) ?? 0) + r.totalContainers)
  }

  const currentWeek = getCurrentFYWeek()

  let rows = targets.map((t) => {
    const actual    = actualByName.get(t.buyerCompanyName.toLowerCase()) ?? 0
    const target    = t.currentYearTargetContainers
    const targetDue = targetDueTillWeek(target, currentWeek)
    return {
      buyerName:      t.buyerCompanyName,
      country:        t.countries,
      salesPerson:    t.salesPerson,
      financialYear:  t.financialYear,
      target,
      actual,
      targetDue,
      gap:            actual - targetDue,
      achievementPct: target > 0 ? Math.round((actual / target) * 100) : 0,
      previousYear:   t.previousYearContainers,
      targetType:     t.targetType,
      remarks:        t.remarks,
    }
  })

  if (sp) rows = rows.filter((r) => r.salesPerson.toLowerCase() === sp.toLowerCase())

  rows.sort((a, b) => b.target - a.target || b.actual - a.actual)

  const allSP = [...new Set(targets.map((t) => t.salesPerson).filter(Boolean))].sort()
  const allCountries = [...new Set(targets.map((t) => t.countries).filter(Boolean))].sort()

  return NextResponse.json({
    rows,
    summary: {
      totalBuyers:  rows.length,
      totalTarget:  rows.reduce((s, r) => s + r.target, 0),
      totalActual:  rows.reduce((s, r) => s + r.actual, 0),
    },
    filterOptions: { salesPersons: allSP, countries: allCountries },
    meta: { currentFY: fy, currentWeek },
  })
}

// ── POST ───────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!requireManager(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json() as {
    buyerName:     string
    financialYear?: FinancialYear
    newTarget:     number
    reason?:       string
  }

  if (!body.buyerName || body.newTarget === undefined) {
    return NextResponse.json({ error: "buyerName and newTarget required" }, { status: 400 })
  }
  if (body.newTarget < 0) {
    return NextResponse.json({ error: "newTarget cannot be negative" }, { status: 400 })
  }

  const result = await updateBuyerTarget({
    buyerName:     body.buyerName,
    financialYear: body.financialYear ?? getCurrentFY(),
    newTarget:     body.newTarget,
    changedBy:     user.name,
    reason:        body.reason ?? "",
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "update_failed" }, { status: 400 })
  }

  return NextResponse.json({
    ok:        true,
    oldTarget: result.oldTarget,
    newTarget: body.newTarget,
    delta:     body.newTarget - result.oldTarget,
  })
}
