import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getPIRecords, getTargetRecords, getBuyerMaster,
  getCanonicalBuyers, getBuyerAliasMap,
  filterPIByFY,
} from "@/lib/data"
import { calcHealthScore } from "@/lib/health-score"
import {
  getCurrentFY, getPreviousFY, getCurrentFYWeek,
  targetDueTillWeek, getStatus,
} from "@/lib/fy-utils"
import { SHEETS } from "@/lib/sheets"
import type {
  AppUser, ResolvedBuyer, BuyerSegment, BuyerTier,
  PerformanceStatus,
} from "@/types"

// ── helpers ──────────────────────────────────────────────────────────────────

function normName(s: string) { return s.toLowerCase().trim() }

function makeCode(name: string) {
  return "raw_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)
}

// ── GET /api/buyers ───────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user   = session.user as unknown as AppUser
  const isSP   = user.role === "SALES_PERSON"
  const url    = new URL(req.url)
  const p      = url.searchParams

  const filterCountry    = p.get("country")    ?? ""
  const filterSP         = isSP ? (user.salesPersonName ?? "") : (p.get("salesPerson") ?? "")
  const filterSegment    = p.get("segment")    ?? ""
  const filterTier       = p.get("tier")       ?? ""
  const filterSearch     = p.get("search")     ?? ""
  const page             = Math.max(1, Number(p.get("page") ?? "1"))
  const limit            = Math.min(100, Math.max(10, Number(p.get("limit") ?? "25")))

  const currentFY  = getCurrentFY()
  const previousFY = getPreviousFY(currentFY)
  const currentWeek = getCurrentFYWeek()

  // ── 1. Fetch all data in parallel ────────────────────────────────────────
  const [allPI, targets, buyerMaster, canonicalBuyers, aliasMap, strategies] = await Promise.all([
    getPIRecords(),
    getTargetRecords(),
    getBuyerMaster(),
    getCanonicalBuyers(),
    getBuyerAliasMap(),
    import("@/lib/data").then(m => m.getCountryStrategies()),
  ])

  const currentPI  = filterPIByFY(allPI, currentFY)
  const previousPI = filterPIByFY(allPI, previousFY)

  // ── 2. Build quick-lookup indexes ────────────────────────────────────────

  // dream market map: country → boolean
  const isDreamMap = new Map(strategies.map(s => [s.country.toUpperCase(), s.isDreamMarket]))

  // canonical map: code → canonical record
  const canonicalByCode = new Map(canonicalBuyers.map((c) => [c.canonicalBuyerCode, c]))

  // buyer master: normalised name → record
  const bmByName = new Map(buyerMaster.map((b) => [normName(b.buyerCompanyName), b]))
  const bmByCode = new Map(buyerMaster.map((b) => [b.buyerCode, b]))

  // sales coordinator map: normalised buyer name → coordinator name
  const coordinatorMap = new Map<string, string>()
  const sortedPI = [...allPI].sort((a, b) => b.piDate.localeCompare(a.piDate))
  for (const r of sortedPI) {
    const key = normName(r.buyerCompanyName)
    if (!coordinatorMap.has(key)) coordinatorMap.set(key, r.salesCoordinator)
  }

  // Identify new buyers: check if any PI exists before April 1, 2026
  const cutOffDate = "2026-04-01"
  const existingBuyers = new Set<string>()
  for (const r of allPI) {
    if (r.piDate < cutOffDate) {
      existingBuyers.add(normName(r.buyerCompanyName))
      if (r.buyerCode) existingBuyers.add(r.buyerCode)
    }
  }

  // target: normalised buyer name → target containers (current FY)
  const targetByName = new Map<string, number>()
  const prevYearByName = new Map<string, number>()
  for (const t of targets) {
    if (t.financialYear === currentFY) {
      const key = normName(t.buyerCompanyName)
      targetByName.set(key, (targetByName.get(key) ?? 0) + t.currentYearTargetContainers)
    }
    if (t.financialYear === previousFY) {
      const key = normName(t.buyerCompanyName)
      prevYearByName.set(key, (prevYearByName.get(key) ?? 0) + t.currentYearTargetContainers)
    }
  }

  // ── 3. Resolve all PI records to canonical identities ─────────────────────

  // canonicalCode → aggregated PI data
  interface Bucket {
    canonicalCode:  string
    rawNames:       Set<string>
    rawBuyerCode:   string
    currentCtrs:    number
    prevCtrs:       number
    orderCount:     number
    lastOrderDate:  string
    byWeek:         Map<number, number>
    salesPerson:    string
    coordinator:    string
    isNew:          boolean
  }

  const buckets = new Map<string, Bucket>()

  const resolveToBucket = (r: { buyerCompanyName: string; buyerCode: string }) => {
    // Try alias map first
    let code = aliasMap.get(normName(r.buyerCompanyName))
    // Fallback: buyer master code match
    if (!code && r.buyerCode) {
      const cb = canonicalBuyers.find((c) => c.buyerCode === r.buyerCode)
      if (cb) code = cb.canonicalBuyerCode
    }
    // Fallback: synthetic code from raw name
    if (!code) code = makeCode(r.buyerCompanyName)
    return code
  }

  // Process current FY PI records
  for (const r of currentPI) {
    const code = resolveToBucket(r)
    if (!buckets.has(code)) {
      const nameKey = normName(r.buyerCompanyName)
      buckets.set(code, {
        canonicalCode: code,
        rawNames:      new Set(),
        rawBuyerCode:  r.buyerCode,
        currentCtrs:   0,
        prevCtrs:      0,
        orderCount:    0,
        lastOrderDate: "",
        byWeek:        new Map(),
        salesPerson:   r.salesPerson,
        coordinator:   r.salesCoordinator || coordinatorMap.get(nameKey) || "",
        isNew:         !existingBuyers.has(nameKey) && (!r.buyerCode || !existingBuyers.has(r.buyerCode)),
      })
    }
    const b = buckets.get(code)!
    b.rawNames.add(r.buyerCompanyName)
    b.currentCtrs += r.totalContainers
    b.orderCount  += 1
    b.byWeek.set(r.fyWeekNo, (b.byWeek.get(r.fyWeekNo) ?? 0) + r.totalContainers)
    if (!b.lastOrderDate || r.piDate > b.lastOrderDate) b.lastOrderDate = r.piDate
    if (r.salesPerson) b.salesPerson = r.salesPerson
    if (r.salesCoordinator && !b.coordinator) b.coordinator = r.salesCoordinator
  }

  // Process previous FY
  for (const r of previousPI) {
    const code = resolveToBucket(r)
    if (!buckets.has(code)) {
      const nameKey = normName(r.buyerCompanyName)
      buckets.set(code, {
        canonicalCode: code,
        rawNames:      new Set([r.buyerCompanyName]),
        rawBuyerCode:  r.buyerCode,
        currentCtrs:   0,
        prevCtrs:      0,
        orderCount:    0,
        lastOrderDate: "",
        byWeek:        new Map(),
        salesPerson:   r.salesPerson,
        coordinator:   r.salesCoordinator || coordinatorMap.get(nameKey) || "",
        isNew:         !existingBuyers.has(nameKey) && (!r.buyerCode || !existingBuyers.has(r.buyerCode)),
      })
    }
    buckets.get(code)!.prevCtrs += r.totalContainers
  }

  // Ensure all canonical buyers with a target also have a bucket
  for (const c of canonicalBuyers) {
    if (!buckets.has(c.canonicalBuyerCode)) {
      const nameKey = normName(c.canonicalBuyerName)
      buckets.set(c.canonicalBuyerCode, {
        canonicalCode: c.canonicalBuyerCode,
        rawNames:      new Set([c.canonicalBuyerName]),
        rawBuyerCode:  c.buyerCode,
        currentCtrs:   0,
        prevCtrs:      0,
        orderCount:    0,
        lastOrderDate: "",
        byWeek:        new Map(),
        salesPerson:   c.primaryOwner,
        coordinator:   coordinatorMap.get(nameKey) || "",
        isNew:         !existingBuyers.has(nameKey) && (!c.buyerCode || !existingBuyers.has(c.buyerCode)),
      })
    }
  }

  // ── 4. Assemble ResolvedBuyer objects (pre-tier) ──────────────────────────

  interface PreTier extends Omit<ResolvedBuyer, "tier"> {
    target:           number
    _hasCanonical:    boolean   // internal flag — drives auto-segmentation
  }

  const preTierList: PreTier[] = []

  for (const [code, bucket] of buckets) {
    const canonical = canonicalByCode.get(code)

    // Prefer canonical name; fall back to most common raw name
    const displayName = canonical?.canonicalBuyerName
      ?? [...bucket.rawNames][0]
      ?? code

    // Get buyer code — prefer HRB code from buyer master
    const bm = bmByCode.get(bucket.rawBuyerCode) ?? bmByName.get(normName(displayName))
    const buyerCode = canonical?.buyerCode || bm?.buyerCode || bucket.rawBuyerCode

    // Target — try canonical target first, then target master
    const tgtFromCanon  = canonical?.targetFY2026 ?? 0
    const tgtFromMaster = targetByName.get(normName(displayName)) ?? 0
    const target        = tgtFromCanon || tgtFromMaster

    // Previous year
    const prevFromMaster = prevYearByName.get(normName(displayName)) ?? 0
    const prevYearActual = bucket.prevCtrs || prevFromMaster

    const actual     = bucket.currentCtrs
    const targetDue  = targetDueTillWeek(target, currentWeek)
    const gap        = actual - targetDue
    const achPct     = target > 0 ? Math.round((actual / target) * 100) : 0
    const status     = getStatus(target, actual, targetDue) as PerformanceStatus

    // Sales person
    const sp = canonical?.primaryOwner || bucket.salesPerson || bm?.salesPerson || ""

    // Weeks since last order
    let weeksSinceLast = 99
    if (bucket.lastOrderDate) {
      const fy26Start  = new Date(currentFY.split("-")[0].length === 4
        ? `${currentFY.split("-")[0]}-04-01`
        : "2026-04-01")
      const lastDate   = new Date(bucket.lastOrderDate)
      const diffDays   = Math.floor((Date.now() - lastDate.getTime()) / 86_400_000)
      weeksSinceLast   = Math.floor(diffDays / 7)
    }

    const healthScore = calcHealthScore({
      target,
      actual,
      prevYearActual,
      orderCount: bucket.orderCount,
      containersByWeek: bucket.byWeek,
    })

    // Country
    const country = canonical?.country || bm?.countries || ""

    // SP filter
    if (filterSP && sp.toLowerCase() !== filterSP.toLowerCase()) continue

    preTierList.push({
      canonicalBuyerCode: code,
      canonicalBuyerName: displayName,
      buyerCode,
      country,
      segment:           (canonical?.segment ?? "EXISTING") as BuyerSegment,
      strategicRank:      canonical?.strategicRank ?? 999,
      isKeyAccount:       canonical?.isKeyAccount ?? false,
      primaryOwner:       sp,
      backupOwner:        canonical?.backupOwner ?? "",
      target,
      prevYearActual,
      actual,
      targetDue,
      gap,
      achievementPct:     achPct,
      status,
      healthScore,
      lastOrderDate:      bucket.lastOrderDate,
      orderCount:         bucket.orderCount,
      weeksSinceLastOrder: weeksSinceLast,
      _hasCanonical:      !!canonical,   // manual override flag
      isNewBuyer:         bucket.isNew,
      isDreamMarket:      isDreamMap.get(country.toUpperCase()) ?? false,
      salesCoordinator:   bucket.coordinator || coordinatorMap.get(normName(displayName)) || "",
    })
  }

  // ── 5. 80/20 Tier classification + segment auto-classification ───────
  // Sort all buyers by target (descending) to compute rank.
  const sorted = [...preTierList].sort((a, b) => b.target - a.target || b.actual - a.actual)
  const totalTarget = sorted.reduce((s, b) => s + b.target, 0)
  let cumulative = 0

  const withTier: ResolvedBuyer[] = sorted.map((b, rankIdx) => {
    cumulative += b.target
    const pct  = totalTarget > 0 ? cumulative / totalTarget : 1
    const tier: BuyerTier = pct <= 0.80 ? "TIER1" : pct <= 0.95 ? "TIER2" : "TIER3"

    // Auto-segment: if no canonical record exists, classify by target rank.
    // Manager-set segments (canonical record present) always take precedence.
    let segment = b.segment
    if (!b._hasCanonical && b.target > 0) {
      if (rankIdx < 20)      segment = "VIP"
      else if (rankIdx < 50) segment = "STRATEGIC"
    }

    // Strip the internal flag before returning
    const { _hasCanonical, ...rest } = b
    return { ...rest, tier, segment }
  })

  // ── 6. Apply remaining filters ────────────────────────────────────────────
  let filtered = withTier

  if (filterCountry) {
    filtered = filtered.filter((b) => b.country.toLowerCase() === filterCountry.toLowerCase())
  }
  if (filterSegment) {
    filtered = filtered.filter((b) => b.segment === filterSegment)
  }
  if (filterTier) {
    filtered = filtered.filter((b) => b.tier === filterTier)
  }
  if (filterSearch) {
    const q = filterSearch.toLowerCase()
    filtered = filtered.filter(
      (b) =>
        b.canonicalBuyerName.toLowerCase().includes(q) ||
        b.buyerCode.toLowerCase().includes(q) ||
        b.country.toLowerCase().includes(q)
    )
  }

  // ── 7. Summary stats (from all withTier, not just filtered) ──────────────
  const t1 = withTier.filter((b) => b.tier === "TIER1")
  const t2 = withTier.filter((b) => b.tier === "TIER2")
  const t3 = withTier.filter((b) => b.tier === "TIER3")

  const sumTier = (arr: ResolvedBuyer[]) => ({
    count:        arr.length,
    totalTarget:  arr.reduce((s, b) => s + b.target,  0),
    totalActual:  arr.reduce((s, b) => s + b.actual,  0),
  })

  const segmentCounts: Record<string, number> = {}
  for (const b of withTier) {
    segmentCounts[b.segment] = (segmentCounts[b.segment] ?? 0) + 1
  }

  // ── 8. Filter options ─────────────────────────────────────────────────────
  const countries   = [...new Set(withTier.map((b) => b.country).filter(Boolean))].sort()
  const salesPersons = [...new Set(withTier.map((b) => b.primaryOwner).filter(Boolean))].sort()
  const segments    = [...new Set(withTier.map((b) => b.segment))].sort()

  // ── 9. Paginate ───────────────────────────────────────────────────────────
  const total      = filtered.length
  const totalPages = Math.ceil(total / limit)
  const paginated  = filtered.slice((page - 1) * limit, page * limit)

  return NextResponse.json({
    buyers: paginated,
    pagination: {
      page, limit, total, totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
    summary: {
      totalBuyers:    withTier.length,
      tier1:          sumTier(t1),
      tier2:          sumTier(t2),
      tier3:          sumTier(t3),
      bySegment:      segmentCounts,
      totalTarget,
      totalActual:    withTier.reduce((s, b) => s + b.actual, 0),
    },
    filterOptions: { countries, salesPersons, segments },
    meta: { currentFY, currentWeek, canonicalMapActive: !!SHEETS.CANONICAL_MAP },
  })
}
