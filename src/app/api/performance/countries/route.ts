import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import {
  getPIRecords, getTargetRecords,
  filterPIByFY, sumContainers, groupByCountry,
} from "@/lib/data"
import {
  getCurrentFY, getPreviousFY, getCurrentFYWeek,
  scopedTarget, getStatus, getAchievementPercent,
} from "@/lib/fy-utils"
import type { AppUser, FinancialYear, CountryPerformance, PIRecord } from "@/types"

export const dynamic = "force-dynamic"

interface TopBuyer { name: string; code: string; containers: number; pct: number }

interface CountryPerformanceRow extends CountryPerformance {
  growthPct:  number | null   // current vs previous year
  topBuyers:  TopBuyer[]      // top 5 by containers (current FY)
}

export async function GET(req: Request) {
  try {
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

    // ── Prior-history countries: any country shipped to in ANY financial year
    //    BEFORE the current one. A country is "New Business" only if it has no
    //    such prior history (first-ever shipment this FY). Full history, not just
    //    last year. ──
    const curStartYear = Number(fy.split("-")[0])
    const piFYStart = (r: PIRecord): number => {
      if (r.financialYear && r.financialYear.trim()) return Number(r.financialYear.trim().split("-")[0])
      const d = new Date(r.piDate)
      if (isNaN(d.getTime())) return curStartYear   // unknown → don't falsely flag as prior
      return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
    }
    const priorCountries = new Set<string>()
    for (const r of allPI) {
      if (piFYStart(r) >= curStartYear) continue
      if (r.countries) priorCountries.add(r.countries.toUpperCase())
    }

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
      const { target, due } = scopedTarget(targetByCountry[country] || 0, { fyMonth, fyQuarter, fyWeek }, week)
      const gap      = parseFloat((actual - due).toFixed(2))
      const status   = getStatus(target, actual, due)
      const pct      = getAchievementPercent(actual, due)

      const active = new Set(piList.map((r) => r.buyerCode || r.buyerCompanyName)).size
      const total  = new Set([
        ...piList.map((r) => r.buyerCode || r.buyerCompanyName),
        ...piPrev.map((r) => r.buyerCode || r.buyerCompanyName),
      ]).size

      // Top buyers in this country (current FY).
      // Containers are PI-level (repeated on every product row) — count each PI once per buyer.
      const buyerTotals = new Map<string, { name: string; code: string; ctrs: number }>()
      const buyerSeenPIs = new Map<string, Set<string>>()
      for (const r of piList) {
        const key = r.buyerCode || r.buyerCompanyName
        const e = buyerTotals.get(key) ?? { name: r.buyerCompanyName, code: r.buyerCode, ctrs: 0 }
        let seen = buyerSeenPIs.get(key)
        if (!seen) { seen = new Set(); buyerSeenPIs.set(key, seen) }
        if (!seen.has(r.piNumber)) {
          seen.add(r.piNumber)
          e.ctrs += r.totalContainers
        }
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
        growthPct,
        topBuyers,
        hadPriorHistory:    priorCountries.has(country.toUpperCase()),
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

    // Filter-dropdown options from the FULL data (so the Sales Person / Country
    // dropdowns are populated even when the Country tab loads first).
    const filterOptions = {
      salesPersons: [...new Set([
        ...targets.map((t) => t.salesPerson),
        ...allPI.map((r) => r.salesPerson),
      ].filter(Boolean))].sort(),
      countries: [...new Set([
        ...targets.map((t) => t.countries),
        ...allPI.map((r) => r.countries),
      ].filter(Boolean))].sort(),
      salesCoordinators: [...new Set(allPI.map((r) => r.salesCoordinator).filter(Boolean))].sort(),
    }

    return NextResponse.json({
      rows,
      summary,
      filterOptions,
      meta: { fy, prevFY, week, total: rows.length, generatedAt: new Date().toISOString() },
    })
  } catch (error) {
    console.error("Country Performance API Error:", error)
    return NextResponse.json({ error: "Failed to fetch country performance data" }, { status: 500 })
  }
}
