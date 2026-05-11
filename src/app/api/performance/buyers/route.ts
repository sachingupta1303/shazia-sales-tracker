import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import {
  getPIRecords, getTargetRecords, getBuyerMaster, getCanonicalBuyers,
  filterPIByFY, getBuyerAliasMap,
} from "@/lib/data"
import {
  getCurrentFY, getPreviousFY, getCurrentFYWeek,
  targetDueTillWeek, getStatus, getAchievementPercent,
} from "@/lib/fy-utils"
import type {
  AppUser, FinancialYear, BuyerPerformance, BuyerTier, BuyerSegment, PIRecord,
} from "@/types"

export const dynamic = "force-dynamic"

interface BrandShare { brand: string; containers: number; pct: number }

interface BuyerPerformanceRow extends BuyerPerformance {
  segment:                BuyerSegment
  isKeyAccount:           boolean
  currentYearContainers:  number
  previousYearContainers: number
  growthPct:              number | null
  topBrands:              BrandShare[]
  basmatiContainers:      number
  nonBasmatiContainers:   number
}

function normName(s: string) { return s.toLowerCase().trim() }

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const user = session.user as AppUser
    const url  = new URL(req.url)
    const fy   = (url.searchParams.get("fy") || getCurrentFY()) as FinancialYear

    const countryFilter = url.searchParams.get("country")     || undefined
    const spFilter      = url.searchParams.get("salesPerson") || undefined
    const tierFilter    = url.searchParams.get("tier")        || undefined
    const segmentFilter = url.searchParams.get("segment")     || undefined
    const buyerFilter   = url.searchParams.get("buyer")       || undefined
    const fyWeek        = Number(url.searchParams.get("fyWeek")    || "0")
    const fyMonth       = Number(url.searchParams.get("fyMonth")   || "0")
    const fyQuarter     = Number(url.searchParams.get("fyQuarter") || "0")

    const week   = getCurrentFYWeek()
    const prevFY = getPreviousFY(fy)

    const effectiveSP =
      user.role === "SALES_PERSON" && user.salesPersonName
        ? user.salesPersonName
        : spFilter

    const [allPI, targets, buyerMaster, canonical, aliasMap] = await Promise.all([
      getPIRecords(),
      getTargetRecords(fy),
      getBuyerMaster(),
      getCanonicalBuyers(),
      getBuyerAliasMap(),
    ])

    const canonByCode = new Map(canonical.map((c) => [c.canonicalBuyerCode, c]))

    const resolveSegment = (name: string, code?: string) => {
      let cCode = aliasMap.get(normName(name))
      if (!cCode && code) {
        const cb = canonical.find(c => c.buyerCode === code)
        if (cb) cCode = cb.canonicalBuyerCode
      }
      const canon = cCode ? canonByCode.get(cCode) : null
      return {
        segment: (canon?.segment ?? "EXISTING") as BuyerSegment,
        isKeyAccount: canon?.isKeyAccount ?? false,
      }
    }

    const matchPeriod = (r: PIRecord) => {
      if (fyMonth   && r.fyMonthNo  !== fyMonth)   return false
      if (fyWeek    && r.fyWeekNo   !== fyWeek)    return false
      if (fyQuarter && r.fyQuarter  !== fyQuarter) return false
      return true
    }

    const filterPI = (records: PIRecord[]) =>
      records.filter((r) => {
        if (countryFilter && r.countries.toUpperCase() !== countryFilter.toUpperCase()) return false
        if (effectiveSP   && r.salesPerson.toUpperCase() !== effectiveSP.toUpperCase()) return false
        if (!matchPeriod(r)) return false
        return true
      })

    const currentPI  = filterPI(filterPIByFY(allPI, fy))
    const previousPI = filterPI(filterPIByFY(allPI, prevFY))

    const groupKey = (r: PIRecord) => (r.buyerCode || r.buyerCompanyName)
    const byBuyerCurrent: Record<string, PIRecord[]>  = {}
    const byBuyerPrevious: Record<string, PIRecord[]> = {}
    for (const r of currentPI)  (byBuyerCurrent[groupKey(r)]  ||= []).push(r)
    for (const r of previousPI) (byBuyerPrevious[groupKey(r)] ||= []).push(r)

    const filteredTargets = targets.filter((t) => {
      if (countryFilter && t.countries.toUpperCase() !== countryFilter.toUpperCase()) return false
      if (effectiveSP   && t.salesPerson.toUpperCase() !== effectiveSP.toUpperCase()) return false
      return true
    })

    const sorted = [...filteredTargets].sort((a, b) =>
      b.currentYearTargetContainers - a.currentYearTargetContainers
    )
    const totalT = sorted.reduce((s, t) => s + t.currentYearTargetContainers, 0)
    let cumulative = 0
    const tierMap = new Map<string, BuyerTier>()
    sorted.forEach((t) => {
      cumulative += t.currentYearTargetContainers
      const pct = totalT > 0 ? cumulative / totalT : 1
      const tier: BuyerTier = pct <= 0.8 ? "TIER1" : pct <= 0.95 ? "TIER2" : "TIER3"
      tierMap.set(t.buyerCompanyName.toUpperCase(), tier)
    })

    const rows: BuyerPerformanceRow[] = filteredTargets.map((t) => {
      const key      = t.buyerCompanyName.toUpperCase()
      const buyerRec = buyerMaster.find((b) => b.buyerCompanyName.toUpperCase() === key)
      const code     = buyerRec?.buyerCode || key

      const piCurrent  = byBuyerCurrent[code]  || byBuyerCurrent[key]  || []
      const piPrevious = byBuyerPrevious[code] || byBuyerPrevious[key] || []

      const actual   = piCurrent.reduce((s, r) => s + r.totalContainers, 0)
      const prevYear = piPrevious.reduce((s, r) => s + r.totalContainers, 0)
      const target   = t.currentYearTargetContainers
      const due      = targetDueTillWeek(target, week)
      const gap      = parseFloat((actual - due).toFixed(2))

      const brandMap = new Map<string, number>()
      let basmati = 0
      let nonBasmati = 0
      for (const r of piCurrent) {
        if (r.brand) brandMap.set(r.brand, (brandMap.get(r.brand) ?? 0) + r.totalContainers)
        if (r.varieties === "BASMATI")     basmati    += r.totalContainers
        if (r.varieties === "NON BASMATI") nonBasmati += r.totalContainers
      }
      const topBrands: BrandShare[] = [...brandMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([brand, ctrs]) => ({
          brand, containers: ctrs, pct: actual > 0 ? Math.round((ctrs / actual) * 100) : 0,
        }))

      const sortedDates = [...piCurrent].sort((a, b) => b.piDate.localeCompare(a.piDate))
      const lastOrderDate = sortedDates[0]?.piDate

      const { segment, isKeyAccount } = resolveSegment(t.buyerCompanyName, buyerRec?.buyerCode)

      const growthPct = prevYear > 0
        ? Math.round(((actual - prevYear) / prevYear) * 100)
        : actual > 0 ? null : null

      return {
        buyerCode:               code,
        buyerName:               t.buyerCompanyName,
        country:                 t.countries,
        salesPerson:             t.salesPerson,
        tier:                    (buyerRec?.tier as BuyerTier) || tierMap.get(key) || "TIER3",
        previousYear:            parseFloat(prevYear.toFixed(1)),
        target,
        targetDue:               due,
        actual:                  parseFloat(actual.toFixed(1)),
        gap,
        status:                  getStatus(target, actual, due),
        achievementPercent:      getAchievementPercent(actual, due),
        lastOrderDate,
        segment,
        isKeyAccount,
        currentYearContainers:   parseFloat(actual.toFixed(1)),
        previousYearContainers:  parseFloat(prevYear.toFixed(1)),
        growthPct,
        topBrands,
        basmatiContainers:       parseFloat(basmati.toFixed(1)),
        nonBasmatiContainers:    parseFloat(nonBasmati.toFixed(1)),
      }
    })

    let finalRows: BuyerPerformanceRow[] = []
    if (tierFilter)    finalRows = rows.filter((r) => r.tier === tierFilter)
    else finalRows = rows

    if (segmentFilter) finalRows = finalRows.filter((r) => r.segment === segmentFilter)
    if (buyerFilter) {
      const q = buyerFilter.toLowerCase()
      finalRows = finalRows.filter((r) => r.buyerName.toLowerCase().includes(q))
    }

    finalRows.sort((a, b) => b.target - a.target || b.actual - a.actual)

    const totalBasmati    = finalRows.reduce((s, r) => s + r.basmatiContainers,    0)
    const totalNonBasmati = finalRows.reduce((s, r) => s + r.nonBasmatiContainers, 0)
    const summary = {
      totalTarget:  finalRows.reduce((s, r) => s + r.target, 0),
      totalActual:  parseFloat(finalRows.reduce((s, r) => s + r.actual, 0).toFixed(1)),
      totalPrev:    parseFloat(finalRows.reduce((s, r) => s + r.previousYear, 0).toFixed(1)),
      totalGap:     parseFloat(finalRows.reduce((s, r) => s + r.gap, 0).toFixed(1)),
      achieved:     finalRows.filter((r) => r.status === "ACHIEVED").length,
      missed:       finalRows.filter((r) => r.status === "MISSED").length,
      noTarget:     finalRows.filter((r) => r.status === "NO_TARGET").length,
      tier1Count:   finalRows.filter((r) => r.tier === "TIER1").length,
      tier2Count:   finalRows.filter((r) => r.tier === "TIER2").length,
      tier3Count:   finalRows.filter((r) => r.tier === "TIER3").length,
      basmatiContainers:    parseFloat(totalBasmati.toFixed(1)),
      nonBasmatiContainers: parseFloat(totalNonBasmati.toFixed(1)),
      bySegment: finalRows.reduce((acc, r) => {
        acc[r.segment] = (acc[r.segment] ?? 0) + 1
        return acc
      }, {} as Record<string, number>),
    }

    return NextResponse.json({
      rows: finalRows,
      summary,
      meta: { fy, prevFY, week, total: finalRows.length, generatedAt: new Date().toISOString() },
    })
  } catch (error) {
    console.error("Buyer Performance API Error:", error)
    return NextResponse.json({ error: "Failed to fetch performance data" }, { status: 500 })
  }
}
