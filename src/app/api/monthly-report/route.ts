/**
 * GET /api/monthly-report?fy=2025-26&months=1,2,3
 *
 * Monthly / Multi-month / Quarterly MIS aggregation.
 * FY month: 1=April … 9=December, 10=January, 11=February, 12=March
 * Accepts:  months=1       (single month, backward-compat)
 *           months=1,2,3   (multi-month merge)
 *           month=1        (legacy single-month param)
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getPIRecords, get8020Buyers, getMeetingSchedules, filterPIByFY, sumContainers,
  getTargetRecords, getCountryTargets,
} from "@/lib/data"
import { getCurrentFY, parsePIDate, getFYWeek, getFYBoundaries } from "@/lib/fy-utils"
import type { FinancialYear } from "@/types"

// ── Helpers ───────────────────────────────────────────────────────────────────

function fyMonthToCalendar(fyMonthNo: number, fy: string) {
  const fyStartYear = parseInt(fy.split("-")[0], 10)
  const calMonth    = (3 + fyMonthNo - 1) % 12   // 0-indexed, Apr=3
  const calYear     = fyMonthNo <= 9 ? fyStartYear : fyStartYear + 1
  return { month: calMonth, year: calYear }
}

function normalizeVariety(raw: string): string {
  const s = (raw ?? "").trim().toLowerCase().replace(/[^a-z\s]/g, "")
  if (s.includes("non") && s.includes("basmati")) return "NON BASMATI"
  if (s.includes("basmati"))                       return "BASMATI"
  if (s === "")                                    return "UNSPECIFIED"
  return raw.trim().toUpperCase()
}

function normalizeDescription(raw: string): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, " ") || "NOT SPECIFIED"
}

const FY_MONTH_NAMES = [
  "", "April","May","June","July","August","September",
  "October","November","December","January","February","March",
]
const FY_MONTH_SHORT = [
  "", "Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar",
]

/** Build a human-readable period label for the selected months */
function buildPeriodLabel(months: number[], fy: string): { label: string; shortLabel: string } {
  if (months.length === 0) return { label: "No Period", shortLabel: "—" }

  const fyStartYear = parseInt(fy.split("-")[0], 10)
  const calYear = (m: number) => m <= 9 ? fyStartYear : fyStartYear + 1

  // Check if it matches a quarter
  const QUARTERS: Record<string, number[]> = {
    "Q1": [1,2,3], "Q2": [4,5,6], "Q3": [7,8,9], "Q4": [10,11,12],
  }
  for (const [q, qm] of Object.entries(QUARTERS)) {
    if (months.length === 3 && qm.every((m,i) => months[i] === m)) {
      const yr1 = calYear(qm[0]), yr2 = calYear(qm[2])
      const yrStr = yr1 === yr2 ? String(yr1) : `${yr1}–${yr2}`
      return { label: `${q} FY ${fy} (${FY_MONTH_SHORT[qm[0]]}–${FY_MONTH_SHORT[qm[2]]} ${yrStr})`, shortLabel: `${q} ${yrStr}` }
    }
  }

  if (months.length === 1) {
    const yr = calYear(months[0])
    return { label: `${FY_MONTH_NAMES[months[0]]} ${yr}`, shortLabel: `${FY_MONTH_NAMES[months[0]]} ${yr}` }
  }

  // Generic multi-month
  const names = months.map(m => `${FY_MONTH_SHORT[m]} ${calYear(m)}`)
  const label = names.join(", ")
  return { label, shortLabel: `${FY_MONTH_SHORT[months[0]]}–${FY_MONTH_SHORT[months[months.length-1]]}` }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const fy  = (url.searchParams.get("fy") || getCurrentFY()) as FinancialYear

  // Support both ?months=1,2,3 and legacy ?month=1
  const rawMonths = url.searchParams.get("months") || url.searchParams.get("month") || "1"
  const selectedMonths = [...new Set(
    rawMonths.split(",")
      .map(m => parseInt(m.trim(), 10))
      .filter(m => !isNaN(m) && m >= 1 && m <= 12)
  )].sort((a, b) => a - b)

  if (selectedMonths.length === 0) selectedMonths.push(1)

  // Optional WEEK filter — ?weeks=10,11 (FY week numbers). When present it takes
  // precedence over months: the report is scoped to those specific FY weeks.
  const rawWeeks = url.searchParams.get("weeks") || url.searchParams.get("week") || ""
  const selectedWeeks = [...new Set(
    rawWeeks.split(",")
      .map(w => parseInt(w.trim(), 10))
      .filter(w => !isNaN(w) && w >= 1 && w <= 53)
  )].sort((a, b) => a - b)
  const weekMode = selectedWeeks.length > 0

  const [allPI, buyers8020, meetingSchedules, targetRecords, countryTargets] = await Promise.all([
    getPIRecords(), get8020Buyers(), getMeetingSchedules(),
    getTargetRecords(fy), getCountryTargets(),
  ])

  const fyPI = filterPIByFY(allPI, fy)

  // Collect all calendar month+year combos for the selected FY months
  const calendarMonths = selectedMonths.map(m => fyMonthToCalendar(m, fy))

  // Week of a PI record (prefer the stored fyWeekNo, else derive from the date)
  const piWeek = (r: { fyWeekNo: number; piDate: string }) =>
    r.fyWeekNo > 0 ? r.fyWeekNo : getFYWeek(parsePIDate(r.piDate), fy)

  // Filter PI records: by selected weeks (week mode) OR selected months
  const monthPI = weekMode
    ? fyPI.filter((r) => selectedWeeks.includes(piWeek(r)))
    : fyPI.filter((r) => {
        if (r.fyMonthNo > 0) return selectedMonths.includes(r.fyMonthNo)
        const d = parsePIDate(r.piDate)
        if (isNaN(d.getTime())) return false
        return calendarMonths.some(({ month, year }) =>
          d.getMonth() === month && d.getFullYear() === year
        )
      })

  const norm = (s: string) => s.toLowerCase().trim()

  // Fraction of the year covered by the selected period (weeks ÷ 52 or months ÷ 12).
  // All targets are the annual target × this fraction.
  const periodFraction = weekMode ? selectedWeeks.length / 52 : selectedMonths.length / 12

  // ── 80/20 buyer lookup ─────────────────────────────────────────────────────
  const buyerMap            = new Map(buyers8020.map((b) => [norm(b.buyerName), b]))
  const annualTargetByBuyer = new Map(buyers8020.map((b) => [norm(b.buyerName), b.annualTarget]))

  const monitored          = buyers8020.filter((b) => b.tier !== "OTHERS")
  const annualMonitored    = monitored.reduce((s, b) => s + b.annualTarget, 0)
  const totalMonthlyTarget = parseFloat((annualMonitored * periodFraction).toFixed(2))

  // ── Country target map ─────────────────────────────────────────────────────
  // Authoritative source = TARGET_MASTER (buyer-level annual targets summed per
  // country), same as the Country Strategy page. Scaled to the selected months
  // (annual / 12 × N months). Falls back to the country business plan (planned2026)
  // for countries that have no buyer-level target rows.
  const countryTargetMap = new Map<string, number>()
  for (const t of targetRecords) {
    const cKey = (t.countries ?? "").toUpperCase().trim()
    if (!cKey) continue
    countryTargetMap.set(cKey, (countryTargetMap.get(cKey) ?? 0) + t.currentYearTargetContainers * periodFraction)
  }
  for (const cp of countryTargets) {
    const cKey = (cp.country ?? "").toUpperCase().trim()
    if (!cKey) continue
    if (!countryTargetMap.has(cKey) && cp.planned2026 > 0) {
      countryTargetMap.set(cKey, cp.planned2026 * periodFraction)
    }
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalContainers = sumContainers(monthPI)
  const totalMTs        = monthPI.reduce((s, r) => s + r.qtyMTs, 0)
  const totalAmount     = monthPI.reduce((s, r) => s + r.totalAmount, 0)
  const uniqueBuyers    = new Set(monthPI.map((r) => norm(r.buyerCompanyName))).size
  const activeCountries = new Set(monthPI.map((r) => r.countries.toUpperCase())).size
  const activeSP        = new Set(monthPI.map((r) => r.salesPerson.toUpperCase()).filter(Boolean)).size
  const achievementPct  = totalMonthlyTarget > 0
    ? parseFloat(((totalContainers / totalMonthlyTarget) * 100).toFixed(1)) : 0

  // ── Variety with description sub-breakdown ─────────────────────────────────
  const varietyDescMap = new Map<string, Map<string, { containers: number; mts: number; amount: number; seenPIs: Set<string> }>>()
  for (const r of monthPI) {
    const variety = normalizeVariety(r.varieties)
    const desc    = normalizeDescription(r.description)
    if (!varietyDescMap.has(variety)) varietyDescMap.set(variety, new Map())
    const dMap = varietyDescMap.get(variety)!
    if (!dMap.has(desc)) dMap.set(desc, { containers: 0, mts: 0, amount: 0, seenPIs: new Set() })
    const e = dMap.get(desc)!
    // Containers are PI-level: count each PI once per (variety, description) group.
    if (!e.seenPIs.has(r.piNumber)) {
      e.seenPIs.add(r.piNumber)
      e.containers += r.totalContainers
    }
    e.mts        += r.qtyMTs
    e.amount     += r.totalAmount
  }
  const varietyBreakdown = [...varietyDescMap.entries()]
    .map(([variety, dMap]) => {
      const containers = [...dMap.values()].reduce((s, e) => s + e.containers, 0)
      const mts        = [...dMap.values()].reduce((s, e) => s + e.mts, 0)
      const amount     = [...dMap.values()].reduce((s, e) => s + e.amount, 0)
      return {
        variety,
        containers: parseFloat(containers.toFixed(2)),
        mts:        parseFloat(mts.toFixed(2)),
        amount:     parseFloat(amount.toFixed(2)),
        containersPct: totalContainers > 0
          ? parseFloat(((containers / totalContainers) * 100).toFixed(1)) : 0,
        descriptions: [...dMap.entries()]
          .map(([description, d]) => ({
            description,
            containers: parseFloat(d.containers.toFixed(2)),
            mts:        parseFloat(d.mts.toFixed(2)),
            amount:     parseFloat(d.amount.toFixed(2)),
          }))
          .sort((a, b) => b.containers - a.containers),
      }
    })
    .sort((a, b) => b.containers - a.containers)

  // ── Country breakdown ──────────────────────────────────────────────────────
  const countryMap = new Map<string, { containers: number; mts: number; amount: number; buyers: Set<string>; seenPIs: Set<string> }>()
  for (const r of monthPI) {
    const c = r.countries?.toUpperCase().trim() || "UNKNOWN"
    if (!countryMap.has(c)) countryMap.set(c, { containers: 0, mts: 0, amount: 0, buyers: new Set(), seenPIs: new Set() })
    const e = countryMap.get(c)!
    // Containers are PI-level: count each PI once per country.
    if (!e.seenPIs.has(r.piNumber)) {
      e.seenPIs.add(r.piNumber)
      e.containers += r.totalContainers
    }
    e.mts        += r.qtyMTs
    e.amount     += r.totalAmount
    e.buyers.add(norm(r.buyerCompanyName))
  }
  const countryBreakdown = [...countryMap.entries()]
    .map(([country, data]) => {
      const target = countryTargetMap.get(country) ?? 0
      return {
        country,
        containers:     parseFloat(data.containers.toFixed(2)),
        mts:            parseFloat(data.mts.toFixed(2)),
        amount:         parseFloat(data.amount.toFixed(2)),
        buyerCount:     data.buyers.size,
        pct:            totalContainers > 0
          ? parseFloat(((data.containers / totalContainers) * 100).toFixed(1)) : 0,
        monthlyTarget:  parseFloat(target.toFixed(2)),
        achievementPct: target > 0
          ? parseFloat(((data.containers / target) * 100).toFixed(1)) : 0,
      }
    })
    .sort((a, b) => b.containers - a.containers)

  // ── Sales person breakdown ─────────────────────────────────────────────────
  const spMap = new Map<string, { containers: number; mts: number; amount: number; buyers: Set<string>; seenPIs: Set<string> }>()
  for (const r of monthPI) {
    const sp = r.salesPerson?.toUpperCase().trim() || "—"
    if (!spMap.has(sp)) spMap.set(sp, { containers: 0, mts: 0, amount: 0, buyers: new Set(), seenPIs: new Set() })
    const e = spMap.get(sp)!
    // Containers are PI-level: count each PI once per sales person.
    if (!e.seenPIs.has(r.piNumber)) {
      e.seenPIs.add(r.piNumber)
      e.containers += r.totalContainers
    }
    e.mts        += r.qtyMTs
    e.amount     += r.totalAmount
    e.buyers.add(norm(r.buyerCompanyName))
  }
  const salesPersonBreakdown = [...spMap.entries()]
    .map(([salesPerson, data]) => ({
      salesPerson,
      containers: parseFloat(data.containers.toFixed(2)),
      mts:        parseFloat(data.mts.toFixed(2)),
      amount:     parseFloat(data.amount.toFixed(2)),
      share:      totalContainers > 0
        ? parseFloat(((data.containers / totalContainers) * 100).toFixed(1)) : 0,
      buyerCount: data.buyers.size,
    }))
    .sort((a, b) => b.mts - a.mts)

  // ── Buyer breakdown ────────────────────────────────────────────────────────
  const buyerSalesMap = new Map<string, { containers: number; mts: number; amount: number; country: string; sp: string; seenPIs: Set<string> }>()
  for (const r of monthPI) {
    const key = norm(r.buyerCompanyName)
    if (!buyerSalesMap.has(key))
      buyerSalesMap.set(key, { containers: 0, mts: 0, amount: 0, country: r.countries, sp: r.salesPerson, seenPIs: new Set() })
    const e = buyerSalesMap.get(key)!
    // Containers are PI-level: count each PI once per buyer.
    if (!e.seenPIs.has(r.piNumber)) {
      e.seenPIs.add(r.piNumber)
      e.containers += r.totalContainers
    }
    e.mts        += r.qtyMTs
    e.amount     += r.totalAmount
  }
  const buyerBreakdown = [...buyerSalesMap.entries()]
    .map(([key, data]) => {
      const b80    = buyerMap.get(key)
      const target = (annualTargetByBuyer.get(key) ?? 0) * periodFraction
      return {
        buyerName:         key.replace(/\b\w/g, (c) => c.toUpperCase()),
        country:           data.country,
        tier:              b80?.tier ?? "—",
        responsiblePerson: b80?.responsiblePerson ?? data.sp,
        containers:        parseFloat(data.containers.toFixed(2)),
        mts:               parseFloat(data.mts.toFixed(2)),
        amount:            parseFloat(data.amount.toFixed(2)),
        monthlyTarget:     parseFloat(target.toFixed(2)),
        achievementPct:    target > 0
          ? parseFloat(((data.containers / target) * 100).toFixed(1)) : 0,
        isIn8020:          !!b80 && b80.tier !== "OTHERS",
      }
    })
    .sort((a, b) => b.containers - a.containers)

  // ── Meetings across all selected months ────────────────────────────────────
  const byTierDone: Record<string, number> = { TIER1: 0, TIER2: 0, TIER3: 0 }
  const tierBuyerCount = { TIER1: 0, TIER2: 0, TIER3: 0 }
  for (const b of monitored) {
    const t = b.tier as keyof typeof tierBuyerCount
    if (t in tierBuyerCount) tierBuyerCount[t]++
  }

  // Build a Set of "calYear-calMonth" strings for fast lookup
  const calMonthSet = new Set(calendarMonths.map(({ month, year }) => `${year}-${month}`))

  // DONE = every completed meeting in the period (counts repeats), per tier
  for (const sched of meetingSchedules) {
    for (const h of sched.history) {
      const d = new Date(h.meetingDate)
      if (isNaN(d.getTime())) continue
      // Week mode → match by FY week; month mode → match by calendar month
      const inPeriod = weekMode
        ? selectedWeeks.includes(getFYWeek(d, fy))
        : calMonthSet.has(`${d.getFullYear()}-${d.getMonth()}`)
      if (inPeriod) {
        const tk = sched.tier as string
        if (tk in byTierDone) byTierDone[tk]++
      }
    }
  }

  // SCHEDULED = meetings DUE in the period from each tier's cadence
  // (T1 every 15 days, T2 every 20, T3 every 30), generated across the FY.
  const CADENCE: Record<string, number> = { TIER1: 15, TIER2: 20, TIER3: 30 }
  const { start: fyStart, end: fyEnd } = getFYBoundaries(fy)
  const fyMonthOf = (d: Date) => ((d.getMonth() - 3 + 12) % 12) + 1
  const DAY = 86_400_000
  const scheduledByTier: Record<string, number> = { TIER1: 0, TIER2: 0, TIER3: 0 }
  for (const b of monitored) {
    const D = CADENCE[b.tier as string]
    if (!D) continue
    for (let k = 1; ; k++) {
      const due = new Date(fyStart.getTime() + k * D * DAY)
      if (due > fyEnd) break
      const inPeriod = weekMode
        ? selectedWeeks.includes(getFYWeek(due, fy))
        : selectedMonths.includes(fyMonthOf(due))
      if (inPeriod) scheduledByTier[b.tier as string]++
    }
  }

  // Scheduled = due meetings (cadence); Done = meetings completed (count); Pending = Scheduled − Done
  const tierStat = (t: "TIER1" | "TIER2" | "TIER3") => {
    const scheduled = scheduledByTier[t]
    const done      = byTierDone[t]
    return { scheduled, done, pending: Math.max(0, scheduled - done), total: tierBuyerCount[t] }
  }
  const t1 = tierStat("TIER1"), t2 = tierStat("TIER2"), t3 = tierStat("TIER3")
  const scheduledTotal = t1.scheduled + t2.scheduled + t3.scheduled
  const doneTotal      = t1.done + t2.done + t3.done
  const meetingsHeld   = doneTotal

  // Period label — week mode shows "Week N" / "Weeks N–M", else month/quarter label
  let calendarMonthYear: string
  let monthName: string
  if (weekMode) {
    const wLabel = selectedWeeks.length === 1
      ? `Week ${selectedWeeks[0]}`
      : `Weeks ${selectedWeeks[0]}–${selectedWeeks[selectedWeeks.length - 1]}`
    calendarMonthYear = `${wLabel} · FY ${fy}`
    monthName = wLabel
  } else {
    const { label, shortLabel } = buildPeriodLabel(selectedMonths, fy)
    calendarMonthYear = label
    monthName = selectedMonths.length === 1
      ? (FY_MONTH_NAMES[selectedMonths[0]] || `Month ${selectedMonths[0]}`)
      : shortLabel
  }

  return NextResponse.json({
    fy,
    selectedMonths,
    selectedWeeks,
    weekMode,
    fyMonthNo:         selectedMonths[0],   // backward-compat
    monthName,
    calendarMonthYear,
    generatedAt: new Date().toISOString(),

    summary: {
      totalContainers:    parseFloat(totalContainers.toFixed(2)),
      totalMTs:           parseFloat(totalMTs.toFixed(2)),
      totalAmount:        parseFloat(totalAmount.toFixed(2)),
      totalMonthlyTarget,
      achievementPct,
      uniqueBuyers,
      piCount:            monthPI.length,
      activeCountries,
      activeSalesPersons: activeSP,
    },

    varietyBreakdown,
    countryBreakdown,
    salesPersonBreakdown,
    buyerBreakdown,

    meetingsSummary: {
      scheduled:    scheduledTotal,
      done:         doneTotal,
      pending:      Math.max(0, scheduledTotal - doneTotal),
      meetingsHeld,                 // raw count of completed meetings (incl. repeats)
      totalDone:    doneTotal,      // backward-compat
      totalBuyers:  monitored.length,
      byTier: {
        TIER1: t1,
        TIER2: t2,
        TIER3: t3,
      },
    },
  })
}
