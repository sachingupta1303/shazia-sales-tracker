import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import {
  getPIRecords, getTargetRecords, getBuyerMaster, getCanonicalBuyers,
  filterPIByFY, getBuyerAliasMap, get8020Buyers, sumContainers,
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

    const [allPI, targets, buyerMaster, canonical, aliasMap, buyers8020] = await Promise.all([
      getPIRecords(),
      getTargetRecords(fy),
      getBuyerMaster(),
      getCanonicalBuyers(),
      getBuyerAliasMap(),
      get8020Buyers(),
    ])

    // Tier map from "80/20 Buyers" sheet — name → tier
    const tierByName = new Map<string, BuyerTier>()
    for (const b of buyers8020) {
      const t: BuyerTier =
        b.tier === "TIER1" ? "TIER1" :
        b.tier === "TIER2" ? "TIER2" :
        b.tier === "TIER3" ? "TIER3" : "OTHERS"
      tierByName.set(b.buyerName.toLowerCase().trim(), t)
    }

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

    // Always normalize keys to UPPERCASE so buyer-name matching is case-insensitive
    const groupKey = (r: PIRecord) => (r.buyerCode || r.buyerCompanyName).toUpperCase()
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

    // Track which PI groups have been counted so each PI's containers are counted
    // exactly once (duplicate / name-variant target rows must not double-count).
    const usedKeys     = new Set<string>()
    const usedPrevKeys = new Set<string>()

    const rows: BuyerPerformanceRow[] = filteredTargets.map((t) => {
      const key      = t.buyerCompanyName.toUpperCase()
      const buyerRec = buyerMaster.find((b) => b.buyerCompanyName.toUpperCase() === key)
      const code     = buyerRec?.buyerCode || key

      // Resolve the single PI group this target owns; skip if already counted
      const gkCur = byBuyerCurrent[code]  ? code : (byBuyerCurrent[key]  ? key : null)
      const gkPrv = byBuyerPrevious[code] ? code : (byBuyerPrevious[key] ? key : null)
      let piCurrent:  PIRecord[] = []
      let piPrevious: PIRecord[] = []
      if (gkCur && !usedKeys.has(gkCur))     { usedKeys.add(gkCur);     piCurrent  = byBuyerCurrent[gkCur] }
      if (gkPrv && !usedPrevKeys.has(gkPrv)) { usedPrevKeys.add(gkPrv); piPrevious = byBuyerPrevious[gkPrv] }

      const actual   = sumContainers(piCurrent)
      const prevYear = sumContainers(piPrevious)
      const target   = t.currentYearTargetContainers
      const due      = targetDueTillWeek(target, week)
      const gap      = parseFloat((actual - due).toFixed(2))

      // Containers are a PI-level value repeated on every product row of a PI.
      // Count each PI once per brand and once per variety to avoid over-counting
      // multi-product PIs.
      const brandMap = new Map<string, number>()
      const brandSeen = new Map<string, Set<string>>()
      const basmatiSeen = new Set<string>()
      const nonBasmatiSeen = new Set<string>()
      let basmati = 0
      let nonBasmati = 0
      for (const r of piCurrent) {
        if (r.brand) {
          let seen = brandSeen.get(r.brand)
          if (!seen) { seen = new Set(); brandSeen.set(r.brand, seen) }
          if (!seen.has(r.piNumber)) {
            seen.add(r.piNumber)
            brandMap.set(r.brand, (brandMap.get(r.brand) ?? 0) + r.totalContainers)
          }
        }
        if (r.varieties === "BASMATI" && !basmatiSeen.has(r.piNumber)) {
          basmatiSeen.add(r.piNumber)
          basmati += r.totalContainers
        }
        if (r.varieties === "NON BASMATI" && !nonBasmatiSeen.has(r.piNumber)) {
          nonBasmatiSeen.add(r.piNumber)
          nonBasmati += r.totalContainers
        }
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
        tier:                    tierByName.get(t.buyerCompanyName.toLowerCase().trim()) ?? "OTHERS",
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

    // ── Include order-buyers that have NO target row, so the actual total matches
    //    Live Data (which counts every PI). They show as target=0 ("No Target") rows.
    //    usedKeys was populated above, so each PI group is counted exactly once. ──
    const extraRows: BuyerPerformanceRow[] = []
    for (const [k, piList] of Object.entries(byBuyerCurrent)) {
      if (usedKeys.has(k)) continue
      const actual = sumContainers(piList)
      if (actual <= 0) continue
      const sample   = piList[0]
      const prevYear = sumContainers(byBuyerPrevious[k] || [])
      const { segment, isKeyAccount } = resolveSegment(sample.buyerCompanyName, sample.buyerCode)
      const lastOrderDate = [...piList].sort((a, b) => b.piDate.localeCompare(a.piDate))[0]?.piDate

      // basmati / non-basmati (PI-level, once per PI)
      let bas = 0, non = 0
      const bSeen = new Set<string>(), nSeen = new Set<string>()
      for (const r of piList) {
        if (r.varieties === "BASMATI" && !bSeen.has(r.piNumber))     { bSeen.add(r.piNumber); bas += r.totalContainers }
        if (r.varieties === "NON BASMATI" && !nSeen.has(r.piNumber)) { nSeen.add(r.piNumber); non += r.totalContainers }
      }

      extraRows.push({
        buyerCode:               k,
        buyerName:               sample.buyerCompanyName,
        country:                 sample.countries,
        salesPerson:             sample.salesPerson,
        tier:                    tierByName.get(sample.buyerCompanyName.toLowerCase().trim()) ?? "OTHERS",
        previousYear:            parseFloat(prevYear.toFixed(1)),
        target:                  0,
        targetDue:               0,
        actual:                  parseFloat(actual.toFixed(1)),
        gap:                     parseFloat(actual.toFixed(1)),
        status:                  getStatus(0, actual, 0),
        achievementPercent:      getAchievementPercent(actual, 0),
        lastOrderDate,
        segment,
        isKeyAccount,
        currentYearContainers:   parseFloat(actual.toFixed(1)),
        previousYearContainers:  parseFloat(prevYear.toFixed(1)),
        growthPct:               prevYear > 0 ? Math.round(((actual - prevYear) / prevYear) * 100) : null,
        topBrands:               [],
        basmatiContainers:       parseFloat(bas.toFixed(1)),
        nonBasmatiContainers:    parseFloat(non.toFixed(1)),
      })
    }
    const allRows = [...rows, ...extraRows]

    let finalRows: BuyerPerformanceRow[] = []
    if (tierFilter)    finalRows = allRows.filter((r) => r.tier === tierFilter)
    else finalRows = allRows

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
      othersCount:  finalRows.filter((r) => r.tier === "OTHERS").length,
      basmatiContainers:    parseFloat(totalBasmati.toFixed(1)),
      nonBasmatiContainers: parseFloat(totalNonBasmati.toFixed(1)),
      bySegment: finalRows.reduce((acc, r) => {
        acc[r.segment] = (acc[r.segment] ?? 0) + 1
        return acc
      }, {} as Record<string, number>),
    }

    console.log(`[performance/buyers] fy=${fy} rows=${finalRows.length} (targets=${targets.length} filtered=${filteredTargets.length})`)
    return NextResponse.json({
      rows: finalRows,
      summary,
      meta: {
        fy, prevFY, week,
        total:        finalRows.length,
        sourceTargets: targets.length,
        generatedAt:  new Date().toISOString(),
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    console.error("[performance/buyers] ERROR:", msg)
    if (error instanceof Error && error.stack) console.error(error.stack)
    return NextResponse.json({ error: `Failed to fetch performance data: ${msg}` }, { status: 500 })
  }
}
