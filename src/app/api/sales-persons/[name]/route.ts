import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getPIRecords, getTargetRecords, getBuyerMaster,
  getCanonicalBuyers, getBuyerAliasMap,
  filterPIByFY, get8020Buyers, sumContainers,
} from "@/lib/data"
import {
  getCurrentFY, getPreviousFY, getCurrentFYWeek,
  targetDueTillWeek, getStatus,
} from "@/lib/fy-utils"
import type { AppUser, BuyerSegment, BuyerTier, PerformanceStatus } from "@/types"

function normName(s: string) { return s.toLowerCase().trim() }

export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name: rawName } = await params
  const name = decodeURIComponent(rawName)

  const currentFY   = getCurrentFY()
  const previousFY  = getPreviousFY(currentFY)
  const currentWeek = getCurrentFYWeek()

  const [allPI, targets, buyerMaster, canonicalBuyers, aliasMap, buyers8020] = await Promise.all([
    getPIRecords(),
    getTargetRecords(),
    getBuyerMaster(),
    getCanonicalBuyers(),
    getBuyerAliasMap(),
    get8020Buyers(),
  ])

  // Tier lookup from 80/20 sheet
  const tierByName = new Map<string, BuyerTier>()
  for (const b of buyers8020) {
    const t: BuyerTier =
      b.tier === "TIER1" ? "TIER1" :
      b.tier === "TIER2" ? "TIER2" :
      b.tier === "TIER3" ? "TIER3" : "OTHERS"
    tierByName.set(b.buyerName.toLowerCase().trim(), t)
  }

  // Resolve canonical identities for all PI records to correctly identify segments
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
    .filter((r) => r.salesPerson.toUpperCase() === name.toUpperCase())
  const prevPI = filterPIByFY(allPI, previousFY)
    .filter((r) => r.salesPerson.toUpperCase() === name.toUpperCase())

  // Aggregated Performance
  const actual       = sumContainers(currentPI)
  const prevActual   = sumContainers(prevPI)
  
  const target = targets
    .filter((t) => t.financialYear === currentFY && t.salesPerson.toUpperCase() === name.toUpperCase())
    .reduce((s, t) => s + t.currentYearTargetContainers, 0)

  const targetDue    = targetDueTillWeek(target, currentWeek)
  const gap          = actual - targetDue
  const achievementPct = target > 0 ? Math.round((actual / target) * 100) : 0
  const status       = getStatus(target, actual, targetDue) as PerformanceStatus

  // Buyer portfolio
  const buyerMap = new Map<string, { 
    name: string; 
    code: string; 
    actual: number; 
    target: number; 
    segment: BuyerSegment; 
    isKeyAccount: boolean 
    country: string
  }>()

  // Process PIs
  const seenPIByBuyer = new Map<string, Set<string>>()
  for (const r of currentPI) {
    const key = r.buyerCode || r.buyerCompanyName
    if (!buyerMap.has(key)) {
      const { segment, isKeyAccount, canonicalCode } = resolveSegment(r.buyerCompanyName, r.buyerCode)
      buyerMap.set(key, {
        name: r.buyerCompanyName,
        code: canonicalCode,
        actual: 0,
        target: 0,
        segment,
        isKeyAccount,
        country: r.countries
      })
    }
    // Containers are PI-level (repeated per product row) — count each PI once per buyer.
    let seen = seenPIByBuyer.get(key)
    if (!seen) { seen = new Set(); seenPIByBuyer.set(key, seen) }
    if (!seen.has(r.piNumber)) {
      seen.add(r.piNumber)
      buyerMap.get(key)!.actual += r.totalContainers
    }
  }

  // Process Targets for buyers not yet in PI history
  for (const t of targets.filter(x => x.financialYear === currentFY && x.salesPerson.toUpperCase() === name.toUpperCase())) {
    const key = buyerMaster.find(b => normName(b.buyerCompanyName) === normName(t.buyerCompanyName))?.buyerCode || t.buyerCompanyName
    if (!buyerMap.has(key)) {
       const { segment, isKeyAccount, canonicalCode } = resolveSegment(t.buyerCompanyName)
       buyerMap.set(key, { 
         name: t.buyerCompanyName, 
         code: canonicalCode, 
         actual: 0, 
         target: 0, 
         segment, 
         isKeyAccount,
         country: t.countries
       })
    }
    buyerMap.get(key)!.target += t.currentYearTargetContainers
  }

  const buyers = Array.from(buyerMap.values()).map(b => ({
    ...b,
    tier: tierByName.get(b.name.toLowerCase().trim()) ?? ("OTHERS" as BuyerTier),
    achievementPct: b.target > 0 ? Math.round((b.actual / b.target) * 100) : 0,
    status: getStatus(b.target, b.actual, targetDueTillWeek(b.target, currentWeek)) as PerformanceStatus
  })).sort((a, b) => b.target - a.target || b.actual - a.actual)

  // Portfolio Summary — tier counts from 80/20 sheet
  const summary = {
    totalBuyers:   buyers.length,
    tier1Count:    buyers.filter(b => b.tier === "TIER1").length,
    tier2Count:    buyers.filter(b => b.tier === "TIER2").length,
    tier3Count:    buyers.filter(b => b.tier === "TIER3").length,
    othersCount:   buyers.filter(b => b.tier === "OTHERS").length,
    // legacy fields kept for backward compat
    vipCount:      buyers.filter(b => b.segment === "VIP").length,
    strategicCount:buyers.filter(b => b.segment === "STRATEGIC").length,
    nbdCount:      0,
    otherCount:    buyers.filter(b => b.segment !== "VIP" && b.segment !== "STRATEGIC").length,
  }

  // Country breakdown
  const countryMap = new Map<string, { country: string; actual: number; target: number }>()
  buyers.forEach(b => {
    const c = b.country.toUpperCase()
    if (!countryMap.has(c)) countryMap.set(c, { country: c, actual: 0, target: 0 })
    countryMap.get(c)!.actual += b.actual
    countryMap.get(c)!.target += b.target
  })
  const countries = Array.from(countryMap.values())
    .sort((a, b) => b.actual - a.actual)
    .map(c => ({
      ...c,
      achievementPct: c.target > 0 ? Math.round((c.actual / c.target) * 100) : 0,
      status: getStatus(c.target, c.actual, targetDueTillWeek(c.target, currentWeek)) as PerformanceStatus
    }))

  return NextResponse.json({
    salesPerson: {
      name,
      performance: { target, actual, prevActual, targetDue, gap, achievementPct, status }
    },
    summary,
    buyers,
    countries,
    piHistory: currentPI
      .sort((a, b) => new Date(b.piDate).getTime() - new Date(a.piDate).getTime())
      .slice(0, 100),
    meta: { currentFY, currentWeek }
  })
}
