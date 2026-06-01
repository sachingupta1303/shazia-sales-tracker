/**
 * GET /api/key-accounts
 *   Returns VIP + STRATEGIC buyers with:
 *   - meeting compliance (target vs actual this month)
 *   - open / overdue task counts
 *   - last activity date
 *
 * Reuses the canonical/auto-segmentation logic from /api/buyers — calls it internally
 * to keep one source of truth.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getPIRecords, getTargetRecords, getBuyerMaster,
  getCanonicalBuyers, getBuyerAliasMap,
  getLeadActivities, getTasks,
  filterPIByFY, MEETING_TARGET_BY_SEGMENT,
} from "@/lib/data"
import { calcHealthScore } from "@/lib/health-score"
import {
  getCurrentFY, getPreviousFY, getCurrentFYWeek,
  targetDueTillWeek, getStatus,
} from "@/lib/fy-utils"
import type {
  AppUser, ResolvedBuyer, BuyerSegment, BuyerTier, PerformanceStatus,
} from "@/types"

function normName(s: string) { return s.toLowerCase().trim() }
function makeCode(name: string) {
  return "raw_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  const isSP = user.role === "SALES_PERSON"
  const url  = new URL(req.url)
  const filterSP = isSP
    ? (user.salesPersonName ?? "")
    : (url.searchParams.get("salesPerson") ?? "")
  const filterCountry = url.searchParams.get("country") ?? ""

  const currentFY   = getCurrentFY()
  const previousFY  = getPreviousFY(currentFY)
  const currentWeek = getCurrentFYWeek()

  const [allPI, targets, buyerMaster, canonicalBuyers, aliasMap, allActivities, allTasks, strategies] = await Promise.all([
    getPIRecords(),
    getTargetRecords(),
    getBuyerMaster(),
    getCanonicalBuyers(),
    getBuyerAliasMap(),
    getLeadActivities({ limit: 5000 }),
    getTasks({ limit: 5000 }),
    import("@/lib/data").then(m => m.getCountryStrategies()),
  ])

  const currentPI  = filterPIByFY(allPI, currentFY)
  const previousPI = filterPIByFY(allPI, previousFY)

  // dream market map: country → boolean
  const isDreamMap = new Map(strategies.map(s => [s.country.toUpperCase(), s.isDreamMarket]))

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

  // Build target/prev maps
  const targetByName: Map<string, number>  = new Map()
  const prevYearByName: Map<string, number> = new Map()
  for (const t of targets) {
    if (t.financialYear === currentFY) {
      targetByName.set(normName(t.buyerCompanyName), (targetByName.get(normName(t.buyerCompanyName)) ?? 0) + t.currentYearTargetContainers)
    }
    if (t.financialYear === previousFY) {
      prevYearByName.set(normName(t.buyerCompanyName), (prevYearByName.get(normName(t.buyerCompanyName)) ?? 0) + t.currentYearTargetContainers)
    }
  }

  const canonicalByCode = new Map(canonicalBuyers.map((c) => [c.canonicalBuyerCode, c]))
  const bmByCode = new Map(buyerMaster.map((b) => [b.buyerCode, b]))
  const bmByName = new Map(buyerMaster.map((b) => [normName(b.buyerCompanyName), b]))

  // ── Bucket aggregation (lightweight version of /api/buyers) ─────────────
  interface Bucket {
    canonicalCode: string
    rawNames: Set<string>
    rawBuyerCode: string
    currentCtrs: number
    prevCtrs: number
    orderCount: number
    lastOrderDate: string
    byWeek: Map<number, number>
    salesPerson: string
    coordinator: string
    isNew: boolean
    // PI-dedup tracking — containers are PI-level but repeated on every product
    // row, so each PI must be counted once per accumulator.
    seenCurrentPI: Set<string>          // piNumbers counted into currentCtrs
    seenPrevPI: Set<string>             // piNumbers counted into prevCtrs
    seenWeekPI: Set<string>             // `${fyWeekNo}|${piNumber}` counted into byWeek
  }

  const buckets = new Map<string, Bucket>()

  const resolveCode = (r: { buyerCompanyName: string; buyerCode: string }) => {
    let c = aliasMap.get(normName(r.buyerCompanyName))
    if (!c && r.buyerCode) {
      const cb = canonicalBuyers.find((x) => x.buyerCode === r.buyerCode)
      if (cb) c = cb.canonicalBuyerCode
    }
    return c ?? makeCode(r.buyerCompanyName)
  }

  for (const r of currentPI) {
    const code = resolveCode(r)
    if (!buckets.has(code)) {
      const nameKey = normName(r.buyerCompanyName)
      buckets.set(code, {
        canonicalCode: code, rawNames: new Set(), rawBuyerCode: r.buyerCode,
        currentCtrs: 0, prevCtrs: 0, orderCount: 0, lastOrderDate: "",
        byWeek: new Map(), salesPerson: r.salesPerson,
        coordinator: r.salesCoordinator || coordinatorMap.get(nameKey) || "",
        isNew: !existingBuyers.has(nameKey) && (!r.buyerCode || !existingBuyers.has(r.buyerCode)),
        seenCurrentPI: new Set(), seenPrevPI: new Set(), seenWeekPI: new Set(),
      })
    }
    const b = buckets.get(code)!
    b.rawNames.add(r.buyerCompanyName)
    // Containers are PI-level — count each PI once per bucket / once per week.
    if (!b.seenCurrentPI.has(r.piNumber)) {
      b.seenCurrentPI.add(r.piNumber)
      b.currentCtrs += r.totalContainers
    }
    b.orderCount  += 1
    const weekKey = `${r.fyWeekNo}|${r.piNumber}`
    if (!b.seenWeekPI.has(weekKey)) {
      b.seenWeekPI.add(weekKey)
      b.byWeek.set(r.fyWeekNo, (b.byWeek.get(r.fyWeekNo) ?? 0) + r.totalContainers)
    }
    if (!b.lastOrderDate || r.piDate > b.lastOrderDate) b.lastOrderDate = r.piDate
    if (r.salesPerson) b.salesPerson = r.salesPerson
    if (r.salesCoordinator && !b.coordinator) b.coordinator = r.salesCoordinator
  }
  for (const r of previousPI) {
    const code = resolveCode(r)
    if (!buckets.has(code)) {
      const nameKey = normName(r.buyerCompanyName)
      buckets.set(code, {
        canonicalCode: code, rawNames: new Set([r.buyerCompanyName]), rawBuyerCode: r.buyerCode,
        currentCtrs: 0, prevCtrs: 0, orderCount: 0, lastOrderDate: "",
        byWeek: new Map(), salesPerson: r.salesPerson,
        coordinator: r.salesCoordinator || coordinatorMap.get(nameKey) || "",
        isNew: !existingBuyers.has(nameKey) && (!r.buyerCode || !existingBuyers.has(r.buyerCode)),
        seenCurrentPI: new Set(), seenPrevPI: new Set(), seenWeekPI: new Set(),
      })
    }
    const pb = buckets.get(code)!
    // Containers are PI-level — count each PI once per bucket.
    if (!pb.seenPrevPI.has(r.piNumber)) {
      pb.seenPrevPI.add(r.piNumber)
      pb.prevCtrs += r.totalContainers
    }
  }
  for (const c of canonicalBuyers) {
    if (!buckets.has(c.canonicalBuyerCode)) {
      const nameKey = normName(c.canonicalBuyerName)
      buckets.set(c.canonicalBuyerCode, {
        canonicalCode: c.canonicalBuyerCode, rawNames: new Set([c.canonicalBuyerName]),
        rawBuyerCode: c.buyerCode, currentCtrs: 0, prevCtrs: 0, orderCount: 0,
        lastOrderDate: "", byWeek: new Map(), salesPerson: c.primaryOwner,
        coordinator: coordinatorMap.get(nameKey) || "",
        isNew: !existingBuyers.has(nameKey) && (!c.buyerCode || !existingBuyers.has(c.buyerCode)),
        seenCurrentPI: new Set(), seenPrevPI: new Set(), seenWeekPI: new Set(),
      })
    }
  }

  // ── Build pre-tier list ─────────────────────────────────────────────────
  interface PreItem extends Omit<ResolvedBuyer, "tier"> {
    target: number
    _hasCanonical: boolean
  }
  const preList: PreItem[] = []

  for (const [code, bucket] of buckets) {
    const canonical = canonicalByCode.get(code)
    const displayName = canonical?.canonicalBuyerName ?? [...bucket.rawNames][0] ?? code
    const bm = bmByCode.get(bucket.rawBuyerCode) ?? bmByName.get(normName(displayName))
    const buyerCode = canonical?.buyerCode || bm?.buyerCode || bucket.rawBuyerCode

    const tgtFromCanon  = canonical?.targetFY2026 ?? 0
    const tgtFromMaster = targetByName.get(normName(displayName)) ?? 0
    const target        = tgtFromCanon || tgtFromMaster

    const prevYearActual = bucket.prevCtrs || (prevYearByName.get(normName(displayName)) ?? 0)
    const actual    = bucket.currentCtrs
    const targetDue = targetDueTillWeek(target, currentWeek)
    const gap       = actual - targetDue
    const achPct    = target > 0 ? Math.round((actual / target) * 100) : 0
    const status    = getStatus(target, actual, targetDue) as PerformanceStatus

    const sp = canonical?.primaryOwner || bucket.salesPerson || ""
    // SP filter
    if (filterSP    && sp.toLowerCase() !== filterSP.toLowerCase()) continue

    const country = canonical?.country || bm?.countries || ""
    if (filterCountry && country.toLowerCase() !== filterCountry.toLowerCase()) continue

    let weeksSinceLast = 99
    if (bucket.lastOrderDate) {
      const lastDate = new Date(bucket.lastOrderDate)
      const diffDays = Math.floor((Date.now() - lastDate.getTime()) / 86_400_000)
      weeksSinceLast = Math.floor(diffDays / 7)
    }

    const healthScore = calcHealthScore({
      target, actual, prevYearActual,
      orderCount: bucket.orderCount, containersByWeek: bucket.byWeek,
    })

    preList.push({
      canonicalBuyerCode: code, canonicalBuyerName: displayName, buyerCode, country,
      segment: (canonical?.segment ?? "EXISTING") as BuyerSegment,
      strategicRank: canonical?.strategicRank ?? 999,
      isKeyAccount:  canonical?.isKeyAccount ?? false,
      primaryOwner:  sp,
      backupOwner:   canonical?.backupOwner ?? "",
      target, prevYearActual, actual, targetDue, gap,
      achievementPct: achPct, status, healthScore,
      lastOrderDate: bucket.lastOrderDate, orderCount: bucket.orderCount,
      weeksSinceLastOrder: weeksSinceLast,
      _hasCanonical: !!canonical,
      isNewBuyer:    bucket.isNew,
      isDreamMarket: isDreamMap.get(country.toUpperCase()) ?? false,
      salesCoordinator: bucket.coordinator || coordinatorMap.get(normName(displayName)) || "",
    })
  }

  // ── Sort + tier + auto-segment (matches /api/buyers logic) ──────────────
  const sorted = [...preList].sort((a, b) => b.target - a.target || b.actual - a.actual)
  const totalTarget = sorted.reduce((s, b) => s + b.target, 0)
  let cumulative = 0

  const withTier: ResolvedBuyer[] = sorted.map((b, rankIdx) => {
    cumulative += b.target
    const pct  = totalTarget > 0 ? cumulative / totalTarget : 1
    const tier: BuyerTier = pct <= 0.80 ? "TIER1" : pct <= 0.95 ? "TIER2" : "TIER3"
    let segment = b.segment
    if (!b._hasCanonical && b.target > 0) {
      if (rankIdx < 20)      segment = "VIP"
      else if (rankIdx < 50) segment = "STRATEGIC"
    }
    const { _hasCanonical, ...rest } = b
    return { ...rest, tier, segment }
  })

  // ── Filter to key accounts ──────────────────────────────────────────────
  const keyAccounts = withTier.filter(
    (b) => b.segment === "VIP" || b.segment === "STRATEGIC"
  )

  // ── Enrich with meeting compliance + task counts + last activity ─────────
  const now      = new Date()
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const today    = now.toISOString().split("T")[0]

  const meetingsByCode = new Map<string, number>()
  const lastActivityByCode = new Map<string, string>()
  for (const a of allActivities) {
    if (a.activityType === "MEETING" && a.date.startsWith(monthStr) && a.buyerCode) {
      meetingsByCode.set(a.buyerCode, (meetingsByCode.get(a.buyerCode) ?? 0) + 1)
    }
    if (a.buyerCode) {
      const cur = lastActivityByCode.get(a.buyerCode)
      if (!cur || a.date > cur) lastActivityByCode.set(a.buyerCode, a.date)
    }
  }

  const tasksByCode = new Map<string, { open: number; inProgress: number; overdue: number; done: number }>()
  for (const t of allTasks) {
    if (!t.buyerCode) continue
    const e = tasksByCode.get(t.buyerCode) ?? { open: 0, inProgress: 0, overdue: 0, done: 0 }
    // Resolve OVERDUE dynamically
    const isOverdue = t.dueDate && t.dueDate < today && (t.status === "OPEN" || t.status === "IN_PROGRESS")
    if (isOverdue) e.overdue++
    else if (t.status === "OPEN")        e.open++
    else if (t.status === "IN_PROGRESS") e.inProgress++
    else if (t.status === "DONE")        e.done++
    tasksByCode.set(t.buyerCode, e)
  }

  const enriched = keyAccounts.map((b) => {
    const monthlyTarget = MEETING_TARGET_BY_SEGMENT[b.segment] ?? 0
    const monthActual   = meetingsByCode.get(b.canonicalBuyerCode) ?? 0
    const tasks         = tasksByCode.get(b.canonicalBuyerCode) ?? { open: 0, inProgress: 0, overdue: 0, done: 0 }
    return {
      ...b,
      meetingTarget:    monthlyTarget,
      meetingActual:    monthActual,
      meetingCompliant: monthActual >= monthlyTarget,
      meetingsRemaining: Math.max(0, monthlyTarget - monthActual),
      openTasks:        tasks.open,
      inProgressTasks:  tasks.inProgress,
      overdueTasks:     tasks.overdue,
      doneTasks:        tasks.done,
      lastActivityDate: lastActivityByCode.get(b.canonicalBuyerCode) ?? "",
    }
  })

  // ── Summary ─────────────────────────────────────────────────────────────
  const vipCount     = enriched.filter((b) => b.segment === "VIP").length
  const strategicCount = enriched.filter((b) => b.segment === "STRATEGIC").length
  const totalOpenTasks    = enriched.reduce((s, b) => s + b.openTasks    + b.inProgressTasks, 0)
  const totalOverdueTasks = enriched.reduce((s, b) => s + b.overdueTasks, 0)
  const meetingShortfall  = enriched.reduce((s, b) => s + b.meetingsRemaining, 0)
  const compliantBuyers   = enriched.filter((b) => b.meetingCompliant).length

  // Filter options
  const allSP        = [...new Set(allPI.map((r) => r.salesPerson).filter(Boolean))].sort()
  const allCountries = [...new Set(enriched.map((b) => b.country).filter(Boolean))].sort()

  return NextResponse.json({
    buyers: enriched,
    summary: {
      vipCount, strategicCount,
      totalKeyAccounts: enriched.length,
      compliantBuyers, meetingShortfall,
      totalOpenTasks, totalOverdueTasks,
      monthLabel: now.toLocaleString("en-GB", { month: "long", year: "numeric" }),
    },
    filterOptions: { salesPersons: allSP, countries: allCountries },
    meta: { currentFY, currentWeek },
  })
}
