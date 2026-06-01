import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getPIRecords, getTargetRecords, getCountryTargets, filterPIByFY,
  getCountryStrategies, sumContainersBy,
} from "@/lib/data"
import { getCurrentFY, getPreviousFY, getCurrentFYWeek, targetDueTillWeek, getStatus } from "@/lib/fy-utils"
import { DREAM_MARKET_TOP_N } from "@/types"
import type { AppUser, PerformanceStatus } from "@/types"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user  = session.user as unknown as AppUser
  const isSP  = user.role === "SALES_PERSON"
  const url   = new URL(req.url)
  const spFilter = isSP ? (user.salesPersonName ?? "") : (url.searchParams.get("salesPerson") ?? "")

  const currentFY   = getCurrentFY()
  const previousFY  = getPreviousFY(currentFY)
  const currentWeek = getCurrentFYWeek()

  const [allPI, targets, countryTargets, strategies] = await Promise.all([
    getPIRecords(),
    getTargetRecords(currentFY),
    getCountryTargets(),
    getCountryStrategies(),
  ])

  const strategyByCountry = new Map(strategies.map((s) => [s.country.toUpperCase(), s]))

  let currentPI = filterPIByFY(allPI, currentFY)
  let prevPI    = filterPIByFY(allPI, previousFY)

  if (spFilter) {
    currentPI = currentPI.filter((r) => r.salesPerson.toLowerCase() === spFilter.toLowerCase())
    prevPI    = prevPI.filter((r) => r.salesPerson.toLowerCase() === spFilter.toLowerCase())
  }

  // Build actuals by country (current + prev FY)
  // Containers are PI-level (repeated across product rows) → count once per PI
  // per country via sumContainersBy. MTs/amount stay product-level (not used here).
  const actualByCountry = sumContainersBy(currentPI, (r) => r.countries.toUpperCase())
  const prevByCountry   = sumContainersBy(prevPI,    (r) => r.countries.toUpperCase())
  const spByCountry     = new Map<string, Set<string>>()
  const buyersByCountry = new Map<string, Set<string>>()

  for (const r of currentPI) {
    const c = r.countries.toUpperCase()
    if (!spByCountry.has(c)) spByCountry.set(c, new Set())
    spByCountry.get(c)!.add(r.salesPerson)
    if (!buyersByCountry.has(c)) buyersByCountry.set(c, new Set())
    buyersByCountry.get(c)!.add(r.buyerCompanyName)
  }

  // Build target by country from TARGET_MASTER (buyer-level targets summed per country)
  const targetByCountry = new Map<string, number>()
  for (const t of targets) {
    if (spFilter && t.salesPerson.toLowerCase() !== spFilter.toLowerCase()) continue
    const c = t.countries.toUpperCase()
    targetByCountry.set(c, (targetByCountry.get(c) ?? 0) + t.currentYearTargetContainers)
  }

  // Merge with countryTargets (business plan) for planned2026 as fallback
  const countryPlanMap = new Map(countryTargets.map((c) => [c.country.toUpperCase(), c]))

  // Collect all country keys
  const allCountries = new Set([
    ...actualByCountry.keys(),
    ...targetByCountry.keys(),
    ...countryPlanMap.keys(),
  ])

  const rowsRaw = Array.from(allCountries).map((country) => {
    const target     = targetByCountry.get(country) ?? countryPlanMap.get(country)?.planned2026 ?? 0
    const actual     = actualByCountry.get(country) ?? 0
    const prevActual = prevByCountry.get(country)   ?? countryPlanMap.get(country)?.actual2025 ?? 0
    const targetDue  = targetDueTillWeek(target, currentWeek)
    const gap        = actual - targetDue
    const achPct     = target > 0 ? Math.round((actual / target) * 100) : 0
    const status     = getStatus(target, actual, targetDue) as PerformanceStatus
    const growthPct  = prevActual > 0 ? Math.round(((actual - prevActual) / prevActual) * 100) : null
    const cp         = countryPlanMap.get(country)

    return {
      country,
      target,
      actual,
      prevActual,
      targetDue,
      gap,
      achievementPct: achPct,
      status,
      growthPct,
      activeSalesPersons: spByCountry.get(country)?.size ?? 0,
      activeBuyers:        buyersByCountry.get(country)?.size ?? 0,
      // Business plan data
      planned2025:  cp?.planned2025  ?? 0,
      actual2025:   cp?.actual2025   ?? 0,
      planned2026:  cp?.planned2026  ?? 0,
      marketGrowth: cp?.marketGrowth ?? 0,
      totalClients: cp?.totalClients2025 ?? 0,
      // Hydrated below with isDreamMarket
      _hasStrategy: strategyByCountry.has(country),
    }
  }).sort((a, b) => b.target - a.target || b.actual - a.actual)

  // Apply Dream Market classification:
  //  - manual override (COUNTRY_STRATEGIES sheet) always wins
  //  - else: top N by target are auto Dream Markets
  const rows = rowsRaw.map((r, i) => {
    const strat = strategyByCountry.get(r.country)
    const isDreamMarket = strat
      ? strat.isDreamMarket
      : (i < DREAM_MARKET_TOP_N && r.target > 0)
    const { _hasStrategy, ...rest } = r
    return { ...rest, isDreamMarket, hasManualStrategy: _hasStrategy, dreamRank: isDreamMarket ? i + 1 : 0 }
  })

  const filterCountries = rows.map((r) => r.country).sort()

  return NextResponse.json({
    countries: rows,
    summary: {
      totalCountries:    rows.length,
      activeCountries:   rows.filter((r) => r.actual > 0).length,
      totalTarget:       rows.reduce((s, r) => s + r.target, 0),
      totalActual:       rows.reduce((s, r) => s + r.actual, 0),
      dreamMarketCount:  rows.filter((r) => r.isDreamMarket).length,
      dreamMarketTarget: rows.filter((r) => r.isDreamMarket).reduce((s, r) => s + r.target, 0),
      dreamMarketActual: rows.filter((r) => r.isDreamMarket).reduce((s, r) => s + r.actual, 0),
    },
    meta: { currentFY, currentWeek },
  })
}
