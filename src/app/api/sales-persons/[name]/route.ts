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

/** Split a combined owner name ("ATIF/MOHIT GUPTA", "A & B") into people. */
function splitOwners(name: string): string[] {
  return (name || "").split(/\s*(?:\/|&|,|\+)\s*/).map((s) => s.toUpperCase().trim()).filter(Boolean)
}

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

  // NBD = buyer whose first-ever PI (any FY) is in the current FY; else CRR.
  const buyerKeyOf = (code: string | undefined, nm: string) =>
    (code || "").toUpperCase().trim() || nm.toUpperCase().trim()
  const firstFY = new Map<string, string>()
  for (const r of allPI) {
    const k = buyerKeyOf(r.buyerCode, r.buyerCompanyName)
    if (!k || !r.financialYear) continue
    const f = firstFY.get(k)
    if (!f || r.financialYear < f) firstFY.set(k, r.financialYear)
  }
  const isNewPI = (r: { buyerCode?: string; buyerCompanyName: string }) =>
    firstFY.get(buyerKeyOf(r.buyerCode, r.buyerCompanyName)) === currentFY

  // This person's share of a target row (a target owned by "A/B" is split equally).
  const NAME = name.toUpperCase().trim()
  const shareOf = (owner: string) => {
    const people = splitOwners(owner)
    return people.includes(NAME) ? 1 / people.length : 0
  }

  const currentPI = filterPIByFY(allPI, currentFY)
    .filter((r) => r.salesPerson.toUpperCase() === name.toUpperCase())
  const prevPI = filterPIByFY(allPI, previousFY)
    .filter((r) => r.salesPerson.toUpperCase() === name.toUpperCase())

  // Aggregated Performance
  const actual       = sumContainers(currentPI)
  const prevActual   = sumContainers(prevPI)

  const target = Math.round(targets
    .filter((t) => t.financialYear === currentFY)
    .reduce((s, t) => s + t.currentYearTargetContainers * shareOf(t.salesPerson), 0))

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
    pis: number
    isNew: boolean
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
        country: r.countries,
        pis: 0,
        isNew: isNewPI(r),
      })
    }
    // Containers are PI-level (repeated per product row) — count each PI once per buyer.
    let seen = seenPIByBuyer.get(key)
    if (!seen) { seen = new Set(); seenPIByBuyer.set(key, seen) }
    if (!seen.has(r.piNumber)) {
      seen.add(r.piNumber)
      buyerMap.get(key)!.actual += r.totalContainers
      buyerMap.get(key)!.pis += 1
    }
  }

  // Process Targets for buyers not yet in PI history
  for (const t of targets.filter(x => x.financialYear === currentFY && shareOf(x.salesPerson) > 0)) {
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
         country: t.countries,
         pis: 0,
         isNew: false,
       })
    }
    buyerMap.get(key)!.target += t.currentYearTargetContainers * shareOf(t.salesPerson)
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
    nbdCount:      buyers.filter(b => b.isNew && b.actual > 0).length,
    otherCount:    buyers.filter(b => b.segment !== "VIP" && b.segment !== "STRATEGIC").length,
  }

  // Country breakdown
  const countryMap = new Map<string, {
    country: string; actual: number; target: number
    nbd: number; crr: number; pis: number; buyers: number
  }>()
  buyers.forEach(b => {
    const c = b.country.toUpperCase()
    if (!countryMap.has(c)) countryMap.set(c, { country: c, actual: 0, target: 0, nbd: 0, crr: 0, pis: 0, buyers: 0 })
    const e = countryMap.get(c)!
    e.actual += b.actual
    e.target += b.target
    if (b.actual > 0) {
      if (b.isNew) e.nbd += b.actual; else e.crr += b.actual
      e.buyers += 1
    }
    e.pis += b.pis
  })
  const countries = Array.from(countryMap.values())
    .sort((a, b) => b.actual - a.actual)
    .map(c => ({
      ...c,
      achievementPct: c.target > 0 ? Math.round((c.actual / c.target) * 100) : 0,
      status: getStatus(c.target, c.actual, targetDueTillWeek(c.target, currentWeek)) as PerformanceStatus
    }))

  // NBD vs CRR split of this person's orders
  const nbdPI = currentPI.filter(isNewPI)
  const crrPI = currentPI.filter((r) => !isNewPI(r))
  const uniq = (rs: typeof currentPI, f: (r: (typeof currentPI)[number]) => string) =>
    new Set(rs.map(f).filter(Boolean)).size
  const mix = {
    pis:       uniq(currentPI, (r) => r.piNumber),
    mts:       parseFloat(currentPI.reduce((s, r) => s + (r.qtyMTs || 0), 0).toFixed(1)),
    countries: uniq(currentPI, (r) => r.countries.toUpperCase().trim()),
    nbdCtrs:   sumContainers(nbdPI),
    nbdPIs:    uniq(nbdPI, (r) => r.piNumber),
    nbdBuyers: uniq(nbdPI, (r) => buyerKeyOf(r.buyerCode, r.buyerCompanyName)),
    crrCtrs:   sumContainers(crrPI),
    crrPIs:    uniq(crrPI, (r) => r.piNumber),
    crrBuyers: uniq(crrPI, (r) => buyerKeyOf(r.buyerCode, r.buyerCompanyName)),
  }

  return NextResponse.json({
    salesPerson: {
      name,
      performance: { target, actual, prevActual, targetDue, gap, achievementPct, status }
    },
    mix,
    summary,
    buyers,
    countries,
    piHistory: currentPI
      .sort((a, b) => new Date(b.piDate).getTime() - new Date(a.piDate).getTime())
      .slice(0, 1000),
    meta: { currentFY, currentWeek }
  })
}
