import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getPIRecords, getTargetRecords, getBuyerMaster,
  getCanonicalBuyers, getBuyerAliasMap,
  filterPIByFY, getMeetingComplianceForBuyer, get8020Buyers,
  getCountryStrategies, sumContainers, sumContainersBy,
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

  const [allPI, targets, buyerMaster, canonicalBuyers, aliasMap, buyers8020, countryStrategies] = await Promise.all([
    getPIRecords(),
    getTargetRecords(),
    getBuyerMaster(),
    getCanonicalBuyers(),
    getBuyerAliasMap(),
    get8020Buyers(),
    getCountryStrategies(),
  ])

  const currentPI  = filterPIByFY(allPI, currentFY)
  const previousPI = filterPIByFY(allPI, previousFY)

  // ── Step 1: find who this buyer is ─────────────────────────────────────────
  const canonical  = canonicalBuyers.find((c) => c.canonicalBuyerCode === code)
  // Buyer master row keyed by buyerCode (e.g. HRB225)
  const bmDirect   = buyerMaster.find((b) => b.buyerCode === code)

  // Determine the display name — prefer canonical name if it's a real name (not just the code)
  const isCodeLike = (s: string) => /^[A-Z]{2,6}\d{2,6}$/i.test(s.trim())
  const canonName  = canonical?.canonicalBuyerName && !isCodeLike(canonical.canonicalBuyerName)
    ? canonical.canonicalBuyerName
    : null
  const targetName    = canonName || bmDirect?.buyerCompanyName || canonical?.canonicalBuyerName || code
  const targetCountry = (canonical?.country || bmDirect?.countries || "").toUpperCase().trim()

  // ── Step 2: PRECISE buyer matcher ───────────────────────────────────────────
  // Match ONLY this buyer — no fuzzy word-overlap (that over-matched other buyers
  // sharing common words like "For / Import / Export / General"). This keeps the
  // workspace consistent with Live Data / Target vs Actual / Buyers list.
  const bmCode = (bmDirect?.buyerCode || canonical?.buyerCode || "").toUpperCase().trim()
  const matchesThisBuyer = (r: { buyerCompanyName: string; buyerCode: string; countries?: string }): boolean => {
    // A. Alias map exact match (most trusted)
    if (aliasMap.get(normName(r.buyerCompanyName)) === code) return true
    // B. Buyer code exact match
    if (bmCode && (r.buyerCode ?? "").toUpperCase().trim() === bmCode) return true
    // C. Exact (normalized) name match
    if (normName(r.buyerCompanyName) === normName(targetName)) return true
    return false
  }

  const matchedCurrentPI  = currentPI.filter(matchesThisBuyer)
  const matchedPreviousPI = previousPI.filter(matchesThisBuyer)
  const matchedAllPI      = allPI.filter(matchesThisBuyer)

  const activeFY   = currentFY
  const activePI   = matchedCurrentPI
  const activeWeek = currentWeek

  // Sales person guard for SALES_PERSON role
  const sp = canonical?.primaryOwner
    || matchedCurrentPI[0]?.salesPerson
    || matchedPreviousPI[0]?.salesPerson
    || matchedAllPI[0]?.salesPerson
    || ""

  if (user.role === "SALES_PERSON" && sp && sp !== user.salesPersonName) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Display name: prefer real name found in PI records over canonical/code
  const displayName = matchedAllPI[0]?.buyerCompanyName || targetName

  // Buyer master — direct code match first, then exact name (no fuzzy)
  const bm = bmDirect ?? buyerMaster.find(
    (b) => b.buyerCode === (canonical?.buyerCode || matchedAllPI[0]?.buyerCode)
      || normName(b.buyerCompanyName) === normName(displayName)
  )

  // Aggregate performance — always currentFY as actual, previousFY as prevActual
  const actual     = sumContainers(matchedCurrentPI)
  const prevActual = sumContainers(matchedPreviousPI)
  const orderCount = matchedCurrentPI.length

  // Target — currentFY: exact (normalized) name match only (no fuzzy)
  const tgtActive = targets
    .filter((t) => t.financialYear === currentFY && normName(t.buyerCompanyName) === normName(displayName))
    .reduce((s, t) => s + t.currentYearTargetContainers, 0)
  const target = canonical?.targetFY2026 || tgtActive

  const targetDue      = targetDueTillWeek(target, activeWeek)
  const gap            = actual - targetDue
  const achievementPct = target > 0 ? Math.round((actual / target) * 100) : 0
  const status         = getStatus(target, actual, targetDue) as PerformanceStatus

  // Weekly breakdown for health + chart — count each PI's containers once per week
  const byWeek = sumContainersBy(activePI, (r) => r.fyWeekNo)

  const healthScore = calcHealthScore({
    target, actual, prevYearActual: prevActual,
    orderCount, containersByWeek: byWeek,
  })

  // Last order
  const sortedDates = activePI.map((r) => r.piDate).filter(Boolean).sort().reverse()
  const lastOrderDate = sortedDates[0] ?? ""
  const weeksSinceLast = lastOrderDate
    ? Math.floor((Date.now() - new Date(lastOrderDate).getTime()) / (86_400_000 * 7))
    : 99

  // Country strategy flags
  const isDreamMap = new Map(countryStrategies.map((s) => [s.country.toUpperCase(), s.isDreamMarket]))
  const countryVal = canonical?.country || bm?.countries || matchedAllPI[0]?.countries || ""

  // Sales coordinator — canonical sheet > buyer master > PI records
  const salesCoordinator =
    canonical?.salesCoordinator ||
    bm?.salesCoordinator ||
    matchedAllPI[0]?.salesCoordinator ||
    ""

  // New buyer flag: no PI before FY2026 start
  const cutOff = "2026-04-01"
  const isNewBuyer = matchedAllPI.every((r) => r.piDate >= cutOff)

  // Tier from "80/20 Buyers" sheet — exact (normalized) name match only
  const sheetBuyer = buyers8020.find(
    (b) => b.buyerName.toLowerCase().trim() === displayName.toLowerCase().trim()
  )
  const tier: BuyerTier =
    sheetBuyer?.tier === "TIER1" ? "TIER1" :
    sheetBuyer?.tier === "TIER2" ? "TIER2" :
    sheetBuyer?.tier === "TIER3" ? "TIER3" : "OTHERS"

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
    country:            countryVal,
    segment:           (canonical?.segment ?? "EXISTING") as BuyerSegment,
    tier,
    strategicRank:      canonical?.strategicRank ?? 999,
    isKeyAccount:       canonical?.isKeyAccount ?? false,
    primaryOwner:       canonical?.primaryOwner || sp,
    backupOwner:        canonical?.backupOwner ?? "",
    salesCoordinator,
    isDreamMarket:      isDreamMap.get(countryVal.toUpperCase()) ?? false,
    isNewBuyer,
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
    meta: { currentFY: activeFY, currentWeek: activeWeek, canonicalMapActive: !!SHEETS.CANONICAL_MAP },
  })
}
