import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import {
  getPIRecords, getTargetRecords,
  filterPIByFY, sumContainers, groupByCountry,
} from "@/lib/data"
import {
  getCurrentFY, getPreviousFY, getCurrentFYWeek,
  targetDueTillWeek, getStatus, getAchievementPercent,
} from "@/lib/fy-utils"
import type { AppUser, FinancialYear, CountryPerformance, PIRecord } from "@/types"

export const dynamic = "force-dynamic"

interface TopBuyer { name: string; code: string; containers: number; pct: number }

interface CountryPerformanceRow extends CountryPerformance {
  growthPct:  number | null   // current vs previous year
  topBuyers:  TopBuyer[]      // top 5 by containers (current FY)
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as AppUser
  const url  = new URL(req.url)
  const fy   = (url.searchParams.get("fy") || getCurrentFY()) as FinancialYear
  const prevFY = getPreviousFY(fy)
  const week   = getCurrentFYWeek()

  const fyWeek    = Number(url.searchParams.get("fyWeek")    || "0")
  const fyMonth   = Number(url.searchParams.get("fyMonth")   || "0")
  const fyQuarter = Number(url.searchParams.get("fyQuarter") || "0")

  // Role: sales person sees only their countries
  const salesPersonFilter =
    user.role === "SALES_PERSON" && user.salesPersonName
      ? user.salesPersonName
      : url.searchParams.get("salesPerson") || undefined

  const [allPI, targets, strategies] = await Promise.all([
    getPIRecords(),
    getTargetRecords(fy),
    import("@/lib/data").then(m => m.getCountryStrategies()),
  ])
  const dreamMarkets = new Set(strategies.filter(s => s.isDreamMarket).map(s => s.country.toUpperCase()))

  const matchPeriod = (r: PIRecord) => {
    if (fyMonth   && r.fyMonthNo  !== fyMonth)   return false
    if (fyWeek    && r.fyWeekNo   !== fyWeek)    return false
    if (fyQuarter && r.fyQuarter  !== fyQuarter) return false
    return true
  }

  const filterRecords = (records: PIRecord[]) =>
    records.filter((r) => {
      if (salesPersonFilter && r.salesPerson.toUpperCase() !== salesPersonFilter.toUpperCase()) return false
      if (!matchPeriod(r)) return false
      return true
    })

  const currentPI  = filterRecords(filterPIByFY(allPI, fy))
  const previousPI = filterRecords(filterPIByFY(allPI, prevFY))

  const currentByCountry  = groupByCountry(currentPI)
  const previousByCountry = groupByCountry(previousPI)

  // Build country-level target map
  const targetByCountry: Record<string, number> = {}
  targets.forEach((t) => {
    if (salesPersonFilter && t.salesPerson.toUpperCase() !== salesPersonFilter.toUpperCase()) return
    const c = t.countries.toUpperCase()
    targetByCountry[c] = (targetByCountry[c] || 0) + t.currentYearTargetContainers
  })

  const allCountries = new Set([
    ...Object.keys(currentByCountry),
    ...Object.keys(previousByCountry),
    ...Object.keys(targetByCountry),
  ])

  const rows: CountryPerformanceRow[] = []

  for (const country of allCountries) {
    const piList   = currentByCountry[country]  || []
    const piPrev   = previousByCountry[country] || []
    const actual   = sumContainers(piList)
    const prevYear = sumContainers(piPrev)
    const target   = targetByCountry[country] || 0
    const due      = targetDueTillWeek(target, week)
    const gap      = parseFloat((actual - due).toFixed(2))
    const status   = getStatus(target, actual, due)
    const pct      = getAchievementPercent(actual, due)

    const active = new Set(piList.map((r) => r.buyerCode || r.buyerCompanyName)).size
    const total  = new Set([
      ...piList.map((r) => r.buyerCode || r.buyerCompanyName),
      ...piPrev.map((r) => r.buyerCode || r.buyerCompanyName),
    ]).size

    // Top buyers in this country (current FY)
    const buyerTotals = new Map<string, { name: string; code: string; ctrs: number }>()
    for (const r of piList) {
      const key = r.buyerCode || r.buyerCompanyName
      const e = buyerTotals.get(key) ?? { name: r.buyerCompanyName, code: r.buyerCode, ctrs: 0 }
      e.ctrs += r.totalContainers
      buyerTotals.set(key, e)
    }
    const topBuyers: TopBuyer[] = [...buyerTotals.values()]
      .sort((a, b) => b.ctrs - a.ctrs)
      .slice(0, 5)
      .map((b) => ({
        name: b.name, code: b.code,
        containers: parseFloat(b.ctrs.toFixed(1)),
        pct: actual > 0 ? Math.round((b.ctrs / actual) * 100) : 0,
      }))

    const growthPct = prevYear > 0
      ? Math.round(((actual - prevYear) / prevYear) * 100)
      : null

    rows.push({
      country,
      previousYear:       parseFloat(prevYear.toFixed(1)),
      target,
      targetDue:          due,
      actual:             parseFloat(actual.toFixed(1)),
      gap,
      status,
      achievementPercent: pct,
      activeBuyers:       active,
      totalBuyers:        total,
      isDreamMarket:      dreamMarkets.has(country.toUpperCase()),
      // Sprint 9 additions
      growthPct,
      topBuyers,
    })
  }

  rows.sort((a, b) => b.target - a.target || b.actual - a.actual)

  const summary = {
    totalTarget: rows.reduce((s, r) => s + r.target, 0),
    totalActual: parseFloat(rows.reduce((s, r) => s + r.actual, 0).toFixed(1)),
    totalPrev:   parseFloat(rows.reduce((s, r) => s + r.previousYear, 0).toFixed(1)),
    totalGap:    parseFloat(rows.reduce((s, r) => s + r.gap, 0).toFixed(1)),
    activeCount: rows.filter((r) => r.actual > 0).length,
    growingCount: rows.filter((r) => (r.growthPct ?? 0) > 0).length,
    decliningCount: rows.filter((r) => (r.growthPct ?? 0) < 0).length,
  }

  return NextResponse.json({
    rows,
    summary,
    meta: { fy, prevFY, week, total: rows.length, generatedAt: new Date().toISOString() },
  })
}
