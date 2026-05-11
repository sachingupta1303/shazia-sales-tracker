import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getPIRecords, getTargetRecords, getBuyerMaster,
  getCanonicalBuyers, getBuyerAliasMap,
  filterPIByFY, getMeetingComplianceForBuyer,
} from "@/lib/data"
import { calcHealthScore } from "@/lib/health-score"
import {
  getCurrentFY, getPreviousFY, getCurrentFYWeek,
  targetDueTillWeek, getStatus,
} from "@/lib/fy-utils"
import { SHEETS } from "@/lib/sheets"
import type {
  AppUser, BuyerSegment, BuyerTier, PerformanceStatus,
  BuyerWeeklyBar,
} from "@/types"

function normName(s: string) { return s.toLowerCase().trim() }
function makeCode(name: string) {
  return "raw_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  const { code: rawCode } = await params
  const code = decodeURIComponent(rawCode)

  const currentFY   = getCurrentFY()
  const previousFY  = getPreviousFY(currentFY)
  const currentWeek = getCurrentFYWeek()

  const [allPI, targets, buyerMaster, canonicalBuyers, aliasMap] = await Promise.all([
    getPIRecords(),
    getTargetRecords(),
    getBuyerMaster(),
    getCanonicalBuyers(),
    getBuyerAliasMap(),
  ])

  const currentPI  = filterPIByFY(allPI, currentFY)
  const previousPI = filterPIByFY(allPI, previousFY)

  // Resolve canonical buyer
  const canonical = canonicalBuyers.find((c) => c.canonicalBuyerCode === code)

  // Find all PI records belonging to this canonical code
  const resolveCode = (r: { buyerCompanyName: string; buyerCode: string }) => {
    let c = aliasMap.get(normName(r.buyerCompanyName))
    if (!c && r.buyerCode) {
      const cb = canonicalBuyers.find((x) => x.buyerCode === r.buyerCode)
      if (cb) c = cb.canonicalBuyerCode
    }
    return c ?? makeCode(r.buyerCompanyName)
  }

  const matchedCurrentPI = currentPI.filter((r) => resolveCode(r) === code)
  const matchedPreviousPI = previousPI.filter((r) => resolveCode(r) === code)

  // If raw code (no canonical map), also try matching by buyer code or name directly
  const isRaw = code.startsWith("raw_")
  const matchedAllPI = isRaw
    ? allPI.filter((r) => makeCode(r.buyerCompanyName) === code)
    : allPI.filter((r) => resolveCode(r) === code)

  // Sales person guard for SALES_PERSON role
  const sp = canonical?.primaryOwner
    || matchedCurrentPI[0]?.salesPerson
    || matchedAllPI[0]?.salesPerson
    || ""

  if (user.role === "SALES_PERSON" && sp && sp !== user.salesPersonName) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Buyer master record
  const displayName = canonical?.canonicalBuyerName ?? matchedAllPI[0]?.buyerCompanyName ?? code
  const bm = buyerMaster.find(
    (b) => b.buyerCode === (canonical?.buyerCode || matchedAllPI[0]?.buyerCode)
      || normName(b.buyerCompanyName) === normName(displayName)
  )

  // Aggregate performance
  const actual       = matchedCurrentPI.reduce((s, r) => s + r.totalContainers, 0)
  const prevActual   = matchedPreviousPI.reduce((s, r) => s + r.totalContainers, 0)
  const orderCount   = matchedCurrentPI.length

  // Target
  const tgtCurrent = targets
    .filter((t) => t.financialYear === currentFY && normName(t.buyerCompanyName) === normName(displayName))
    .reduce((s, t) => s + t.currentYearTargetContainers, 0)
  const target = canonical?.targetFY2026 || tgtCurrent

  const targetDue    = targetDueTillWeek(target, currentWeek)
  const gap          = actual - targetDue
  const achievementPct = target > 0 ? Math.round((actual / target) * 100) : 0
  const status       = getStatus(target, actual, targetDue) as PerformanceStatus

  // Weekly breakdown for health + chart
  const byWeek = new Map<number, number>()
  for (const r of matchedCurrentPI) {
    byWeek.set(r.fyWeekNo, (byWeek.get(r.fyWeekNo) ?? 0) + r.totalContainers)
  }

  const healthScore = calcHealthScore({
    target, actual, prevYearActual: prevActual,
    orderCount, containersByWeek: byWeek,
  })

  // Last order
  const sortedDates = matchedCurrentPI.map((r) => r.piDate).filter(Boolean).sort().reverse()
  const lastOrderDate = sortedDates[0] ?? ""
  const weeksSinceLast = lastOrderDate
    ? Math.floor((Date.now() - new Date(lastOrderDate).getTime()) / (86_400_000 * 7))
    : 99

  // 80/20 tier — approximate from target relative to all current FY targets
  const totalTargetAll = targets
    .filter((t) => t.financialYear === currentFY)
    .reduce((s, t) => s + t.currentYearTargetContainers, 0)
  const tier: BuyerTier =
    totalTargetAll > 0 && target / totalTargetAll >= 0.05
      ? "TIER1"
      : target / totalTargetAll >= 0.01 ? "TIER2" : "TIER3"

  // Weekly bars for chart (last 12 FY weeks or all data)
  const startWeek = Math.max(1, currentWeek - 11)
  const weeklyBars: BuyerWeeklyBar[] = Array.from({ length: currentWeek - startWeek + 1 }, (_, i) => {
    const w = startWeek + i
    return { fyWeek: w, label: `W${w}`, containers: byWeek.get(w) ?? 0 }
  })

  // PI history — most recent 30
  const piHistory = [...matchedAllPI]
    .sort((a, b) => b.piDate.localeCompare(a.piDate))
    .slice(0, 30)

  const buyer = {
    canonicalBuyerCode: code,
    canonicalBuyerName: displayName,
    buyerCode:          canonical?.buyerCode || bm?.buyerCode || matchedAllPI[0]?.buyerCode || "",
    country:            canonical?.country || bm?.countries || matchedAllPI[0]?.countries || "",
    segment:           (canonical?.segment ?? "EXISTING") as BuyerSegment,
    tier,
    strategicRank:      canonical?.strategicRank ?? 999,
    isKeyAccount:       canonical?.isKeyAccount ?? false,
    primaryOwner:       canonical?.primaryOwner || sp,
    backupOwner:        canonical?.backupOwner ?? "",
    target,
    prevYearActual:     prevActual,
    actual,
    targetDue,
    gap,
    achievementPct,
    status,
    healthScore,
    lastOrderDate,
    orderCount,
    weeksSinceLastOrder: weeksSinceLast,
  }

  // Meeting compliance for the workspace KPI
  const meetingCompliance = await getMeetingComplianceForBuyer({
    buyerCode: code,
    buyerName: displayName,
    segment:   buyer.segment,
  })

  return NextResponse.json({
    buyer,
    piHistory,
    weeklyBars,
    meetingCompliance,
    meta: { currentFY, currentWeek, canonicalMapActive: !!SHEETS.CANONICAL_MAP },
  })
}
