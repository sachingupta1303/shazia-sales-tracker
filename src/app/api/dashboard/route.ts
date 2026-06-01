import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { getPIRecords, getTargetRecords, filterPIByFY, sumContainers } from "@/lib/data"
import {
  getCurrentFY,
  getPreviousFY,
  getCurrentFYWeek,
  targetDueTillWeek,
  getStatus,
  getAchievementPercent,
} from "@/lib/fy-utils"
import type { AppUser, DashboardFilters } from "@/types"

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const user = session.user as AppUser
    const url = new URL(req.url)

    const filters: DashboardFilters = {
      country:      url.searchParams.get("country")      || undefined,
      buyerCode:    url.searchParams.get("buyerCode")    || undefined,
      salesPerson:  url.searchParams.get("salesPerson")  || undefined,
      variety:      url.searchParams.get("variety")      as DashboardFilters["variety"] || undefined,
      fyWeek:       url.searchParams.get("fyWeek")       ? Number(url.searchParams.get("fyWeek"))      : undefined,
      fyMonth:      url.searchParams.get("fyMonth")      ? Number(url.searchParams.get("fyMonth"))     : undefined,
      fyQuarter:    url.searchParams.get("fyQuarter")    ? Number(url.searchParams.get("fyQuarter")) as 1|2|3|4 : undefined,
    }

    // Sales persons can only see their own data
    if (user.role === "SALES_PERSON" && user.salesPersonName) {
      filters.salesPerson = user.salesPersonName
    }

    const currentFY  = getCurrentFY()
    const previousFY = getPreviousFY(currentFY)
    const currentWeek = getCurrentFYWeek()

    const [allPI, targets] = await Promise.all([
      getPIRecords(),
      getTargetRecords(currentFY),
    ])

    // ── Apply filters ──────────────────────────────────────────────────────────
    function applyFilters(records: typeof allPI) {
      return records.filter((r) => {
        if (filters.country      && r.countries.toUpperCase()   !== filters.country.toUpperCase())   return false
        if (filters.buyerCode    && r.buyerCode                 !== filters.buyerCode)               return false
        if (filters.salesPerson  && r.salesPerson.toUpperCase() !== filters.salesPerson!.toUpperCase()) return false
        if (filters.variety      && r.varieties                 !== filters.variety)                 return false
        if (filters.fyWeek       && r.fyWeekNo                  !== filters.fyWeek)                  return false
        if (filters.fyMonth      && r.fyMonthNo                 !== filters.fyMonth)                  return false
        if (filters.fyQuarter    && r.fyQuarter                 !== filters.fyQuarter)                return false
        return true
      })
    }

    const currentYearPI  = applyFilters(filterPIByFY(allPI, currentFY))
    const previousYearPI = applyFilters(filterPIByFY(allPI, previousFY))

    // ── Aggregate targets based on filters ────────────────────────────────────
    const filteredTargets = targets.filter((t) => {
      if (filters.country    && t.countries.toUpperCase()   !== filters.country.toUpperCase())   return false
      if (filters.salesPerson && t.salesPerson.toUpperCase() !== filters.salesPerson!.toUpperCase()) return false
      if (filters.buyerCode  && !t.buyerCompanyName)                                             return false
      return true
    })

    const totalTarget     = filteredTargets.reduce((s, t) => s + t.currentYearTargetContainers, 0)
    const previousYear    = sumContainers(previousYearPI)
    const actualTillWeek  = sumContainers(currentYearPI)
    const targetDue       = targetDueTillWeek(totalTarget, currentWeek)
    const gaping          = actualTillWeek - targetDue
    const status          = getStatus(totalTarget, actualTillWeek, targetDue)
    const achievement     = getAchievementPercent(actualTillWeek, targetDue)

    // ── Country breakdown ─────────────────────────────────────────────────────
    const countryMap: Record<string, { actual: number; target: number; prevYear: number }> = {}

    // Containers are PI-level (repeated on each product row), so count each PI
    // once per country+accumulator. MTs/amounts/buyers stay per-row.
    const seenActualByCountry: Record<string, Set<string>> = {}
    const seenPrevByCountry: Record<string, Set<string>> = {}

    currentYearPI.forEach((r) => {
      const c = r.countries.toUpperCase()
      if (!countryMap[c]) countryMap[c] = { actual: 0, target: 0, prevYear: 0 }
      if (!seenActualByCountry[c]) seenActualByCountry[c] = new Set()
      if (!seenActualByCountry[c].has(r.piNumber)) {
        seenActualByCountry[c].add(r.piNumber)
        countryMap[c].actual += r.totalContainers
      }
    })
    previousYearPI.forEach((r) => {
      const c = r.countries.toUpperCase()
      if (!countryMap[c]) countryMap[c] = { actual: 0, target: 0, prevYear: 0 }
      if (!seenPrevByCountry[c]) seenPrevByCountry[c] = new Set()
      if (!seenPrevByCountry[c].has(r.piNumber)) {
        seenPrevByCountry[c].add(r.piNumber)
        countryMap[c].prevYear += r.totalContainers
      }
    })
    targets.forEach((t) => {
      const c = t.countries.toUpperCase()
      if (!countryMap[c]) countryMap[c] = { actual: 0, target: 0, prevYear: 0 }
      countryMap[c].target += t.currentYearTargetContainers
    })

    const countryBreakdown = Object.entries(countryMap)
      .map(([country, v]) => {
        const td  = targetDueTillWeek(v.target, currentWeek)
        return {
          country,
          target:    v.target,
          targetDue: td,
          actual:    v.actual,
          prevYear:  v.prevYear,
          gap:       parseFloat((v.actual - td).toFixed(2)),
          status:    getStatus(v.target, v.actual, td),
        }
      })
      .sort((a, b) => b.actual - a.actual)

    // ── Filter options (for frontend dropdowns) ───────────────────────────────
    const countries   = [...new Set(allPI.map((r) => r.countries.toUpperCase()))].sort()
    const salesPersons = [...new Set(allPI.map((r) => r.salesPerson.toUpperCase()))].sort()

    return NextResponse.json({
      kpis: {
        previousYearContainers: parseFloat(previousYear.toFixed(1)),
        targetContainers:       totalTarget,
        targetDueTillWeek:      targetDue,
        actualTillWeek:         parseFloat(actualTillWeek.toFixed(1)),
        gaping:                 parseFloat(gaping.toFixed(2)),
        currentFYWeek:          currentWeek,
        status,
        achievementPercent:     achievement,
      },
      countryBreakdown,
      filterOptions: { countries, salesPersons },
      meta: { currentFY, previousFY, currentWeek, generatedAt: new Date().toISOString() },
    })
  } catch (error) {
    console.error("Dashboard API Error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
