import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getPIRecords, getTargetRecords, getCountryTargets,
  filterPIByFY, getBuyerMaster,
  getCanonicalBuyers, getCountryStrategies, getTravelPlans,
  getBuyerAliasMap, sumContainers, sumContainersBy,
} from "@/lib/data"
import {
  getCurrentFY, getPreviousFY, getCurrentFYWeek,
  targetDueTillWeek, getStatus, FY_CYCLES,
} from "@/lib/fy-utils"
import { DREAM_MARKET_TOP_N } from "@/types"
import type { AppUser, PerformanceStatus, BuyerSegment } from "@/types"

function normName(s: string) { return s.toLowerCase().trim() }

export async function GET(
  req: Request,
  { params }: { params: Promise<{ country: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  const { country: rawCountry } = await params
  const country = decodeURIComponent(rawCountry).toUpperCase()

  const currentFY   = getCurrentFY()
  const previousFY  = getPreviousFY(currentFY)
  const currentWeek = getCurrentFYWeek()

  const [allPI, targets, countryTargets, buyerMaster, canonicalBuyers, strategies, travelPlans, aliasMap] = await Promise.all([
    getPIRecords(),
    getTargetRecords(currentFY),
    getCountryTargets(),
    getBuyerMaster(),
    getCanonicalBuyers(),
    getCountryStrategies(),
    getTravelPlans({ country, limit: 100 }),
    getBuyerAliasMap(),
  ])

  const canonicalByCode = new Map(canonicalBuyers.map((c) => [c.canonicalBuyerCode, c]))

  const resolveSegment = (buyerName: string, buyerCode?: string) => {
    let code = aliasMap.get(normName(buyerName))
    if (!code && buyerCode) {
      const cb = canonicalBuyers.find((c) => c.buyerCode === buyerCode)
      if (cb) code = cb.canonicalBuyerCode
    }
    const canon = code ? canonicalByCode.get(code) : null
    return {
      segment: (canon?.segment ?? "EXISTING") as BuyerSegment,
      isKeyAccount: canon?.isKeyAccount ?? false,
      canonicalCode: code || buyerCode || "raw_" + normName(buyerName)
    }
  }

  const currentPI = filterPIByFY(allPI, currentFY)
    .filter((r) => r.countries.toUpperCase() === country)
  const prevPI = filterPIByFY(allPI, previousFY)
    .filter((r) => r.countries.toUpperCase() === country)
  const countryTargetRec = countryTargets.find((c) => c.country.toUpperCase() === country)

  // Country-level target from TARGET_MASTER
  const countryTargetContainers = targets
    .filter((t) => t.countries.toUpperCase() === country)
    .reduce((s, t) => s + t.currentYearTargetContainers, 0)

  const target     = countryTargetContainers || countryTargetRec?.planned2026 || 0
  const actual     = sumContainers(currentPI)
  const prevActual = sumContainers(prevPI)
  const targetDue  = targetDueTillWeek(target, currentWeek)
  const gap        = actual - targetDue
  const achPct     = target > 0 ? Math.round((actual / target) * 100) : 0
  const status     = getStatus(target, actual, targetDue) as PerformanceStatus

  // Buyer breakdown for this country
  const buyerMap = new Map<string, { name: string; code: string; actual: number; target: number; sp: string }>()
  // Containers are PI-level → count each PI once per buyer key.
  const buyerSeenPIs = new Map<string, Set<string>>()
  for (const r of currentPI) {
    const key = r.buyerCode || r.buyerCompanyName
    let seen = buyerSeenPIs.get(key)
    if (!seen) { seen = new Set(); buyerSeenPIs.set(key, seen) }
    const isNewPI = !seen.has(r.piNumber)
    if (isNewPI) seen.add(r.piNumber)
    const existing = buyerMap.get(key)
    if (existing) {
      if (isNewPI) existing.actual += r.totalContainers
    } else {
      buyerMap.set(key, {
        name:   r.buyerCompanyName,
        code:   r.buyerCode,
        actual: isNewPI ? r.totalContainers : 0,
        target: 0,
        sp:     r.salesPerson,
      })
    }
  }
  // Add targets
  for (const t of targets.filter((x) => x.countries.toUpperCase() === country)) {
    const key = buyerMaster.find(
      (b) => b.buyerCompanyName.toLowerCase() === t.buyerCompanyName.toLowerCase()
    )?.buyerCode || t.buyerCompanyName
    if (buyerMap.has(key)) {
      buyerMap.get(key)!.target += t.currentYearTargetContainers
    } else {
      buyerMap.set(key, { name: t.buyerCompanyName, code: key, actual: 0, target: t.currentYearTargetContainers, sp: t.salesPerson })
    }
  }

  const buyerRows = Array.from(buyerMap.values())
    .sort((a, b) => b.target - a.target || b.actual - a.actual)
    .map((b) => {
      const { segment, isKeyAccount, canonicalCode } = resolveSegment(b.name, b.code)
      return {
        ...b,
        achievementPct: b.target > 0 ? Math.round((b.actual / b.target) * 100) : 0,
        status:         getStatus(b.target, b.actual, targetDueTillWeek(b.target, currentWeek)) as PerformanceStatus,
        segment,
        canonicalCode,
        isKeyAccount,
      }
    })

  // VIP / Strategic / Other groupings
  const vipBuyers       = buyerRows.filter((b) => b.segment === "VIP")
  const strategicBuyers = buyerRows.filter((b) => b.segment === "STRATEGIC")
  const otherBuyers     = buyerRows.filter((b) => b.segment !== "VIP" && b.segment !== "STRATEGIC")

  // Cycle actuals for this country
  const actualByWeek = sumContainersBy(currentPI, (r) => r.fyWeekNo)

  const weeklySlice = target / 52
  const cycleBreakdown = FY_CYCLES.map((c) => {
    const cycleTarget = weeklySlice * 12
    let   cycleActual = 0
    for (let w = c.startWeek; w <= Math.min(c.endWeek, currentWeek); w++) {
      cycleActual += actualByWeek.get(w) ?? 0
    }
    return {
      cycle:     c.cycle,
      name:      c.name,
      target:    parseFloat(cycleTarget.toFixed(2)),
      actual:    cycleActual,
      achPct:    cycleTarget > 0 ? Math.round((cycleActual / cycleTarget) * 100) : 0,
    }
  })

  // Sales person breakdown
  const spMap = sumContainersBy(currentPI, (r) => r.salesPerson)
  const spBreakdown = Array.from(spMap.entries())
    .map(([sp, containers]) => ({ salesPerson: sp, containers }))
    .sort((a, b) => b.containers - a.containers)

  // ── Dream Market classification ─────────────────────────────────────────
  const strat = strategies.find((s) => s.country.toUpperCase() === country)
  let isDreamMarket = false
  let dreamRank = 0
  if (strat) {
    isDreamMarket = strat.isDreamMarket
  } else if (target > 0) {
    const allCountries: { country: string; target: number }[] = []
    const seen = new Set<string>()
    for (const t of targets) {
      const c = t.countries.toUpperCase()
      if (seen.has(c)) continue
      seen.add(c)
      const ct = targets.filter((x) => x.countries.toUpperCase() === c)
        .reduce((s, x) => s + x.currentYearTargetContainers, 0)
      allCountries.push({ country: c, target: ct })
    }
    allCountries.sort((a, b) => b.target - a.target)
    const idx = allCountries.findIndex((c) => c.country === country)
    if (idx >= 0 && idx < DREAM_MARKET_TOP_N) {
      isDreamMarket = true
      dreamRank = idx + 1
    }
  }

  return NextResponse.json({
    country,
    performance: { target, actual, prevActual, targetDue, gap, achievementPct: achPct, status },
    countryPlan: countryTargetRec ?? null,
    strategy:    strat ?? null,
    isDreamMarket,
    dreamRank,
    hasManualStrategy: !!strat,
    buyerRows,
    buyerSegmentBreakdown: {
      vip:        { count: vipBuyers.length,       totalTarget: vipBuyers.reduce((s, b) => s + b.target, 0),       totalActual: vipBuyers.reduce((s, b) => s + b.actual, 0) },
      strategic:  { count: strategicBuyers.length, totalTarget: strategicBuyers.reduce((s, b) => s + b.target, 0), totalActual: strategicBuyers.reduce((s, b) => s + b.actual, 0) },
      other:      { count: otherBuyers.length,     totalTarget: otherBuyers.reduce((s, b) => s + b.target, 0),     totalActual: otherBuyers.reduce((s, b) => s + b.actual, 0) },
    },
    vipBuyers, strategicBuyers, otherBuyers,
    travelPlans,
    cycleBreakdown,
    spBreakdown,
    piHistory: currentPI
      .sort((a, b) => new Date(b.piDate).getTime() - new Date(a.piDate).getTime())
      .slice(0, 200),
    meta: { currentFY, currentWeek },
  })
}
