/**
 * GET /api/monthly-report?fy=2025-26&month=2
 *
 * Returns aggregated Monthly MIS data for the given FY + FY-month number.
 * FY month: 1=April, 2=May, ..., 9=December, 10=January, 11=February, 12=March
 *
 * Data sources:
 *   • PI_BACKEND_MASTER  — actual sales (containers, MTs, amount)
 *   • 80/20 Buyers sheet — annual targets (monthly = annual / 12)
 *   • MEETING_SCHEDULE_8020 + history — meetings done in the month
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getPIRecords,
  get8020Buyers,
  getMeetingSchedules,
  filterPIByFY,
} from "@/lib/data"
import { getCurrentFY, parsePIDate } from "@/lib/fy-utils"
import type { FinancialYear } from "@/types"

// ── Constants ────────────────────────────────────────────────────────────────
const FY_MONTH_NAMES = [
  "", // 1-indexed; index 0 unused
  "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March",
]

/** Convert fyMonthNo (1-12) to 0-based calendar month + year */
function fyMonthToCalendar(fyMonthNo: number, fy: string): { month: number; year: number } {
  const fyStartYear = parseInt(fy.split("-")[0], 10)
  // Apr=3, May=4, ..., Dec=11, Jan=0, Feb=1, Mar=2  (0-indexed)
  const calMonth = (3 + fyMonthNo - 1) % 12
  // Jan/Feb/Mar (fyMonthNo 10/11/12) belong to startYear+1
  const calYear = fyMonthNo <= 9 ? fyStartYear : fyStartYear + 1
  return { month: calMonth, year: calYear }
}

/** Filter PI records for a specific FY + fyMonthNo */
function getMonthPI(
  allPI: ReturnType<typeof filterPIByFY>,
  fy: string,
  fyMonth: number,
) {
  return allPI.filter((r) => {
    // Prefer explicit fyMonthNo when available
    if (r.fyMonthNo > 0) return r.fyMonthNo === fyMonth
    // Fallback: parse piDate
    const d = parsePIDate(r.piDate)
    if (isNaN(d.getTime())) return false
    const { month, year } = fyMonthToCalendar(fyMonth, fy)
    return d.getMonth() === month && d.getFullYear() === year
  })
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url    = new URL(req.url)
  const fy     = (url.searchParams.get("fy") || getCurrentFY()) as FinancialYear
  const month  = Math.max(1, Math.min(12, parseInt(url.searchParams.get("month") || "1", 10)))

  // ── Fetch in parallel ──────────────────────────────────────────────────────
  const [allPI, buyers8020, meetingSchedules] = await Promise.all([
    getPIRecords(),
    get8020Buyers(),
    getMeetingSchedules(),
  ])

  // ── Filter PI for this FY + month ─────────────────────────────────────────
  const fyPI     = filterPIByFY(allPI, fy)
  const monthPI  = getMonthPI(fyPI, fy, month)

  // ── Build 80/20 buyer lookup (normalize: lowercase trim) ──────────────────
  const norm = (s: string) => s.toLowerCase().trim()

  // Map: normalizedBuyerName → Buyer8020
  const buyerMap = new Map(
    buyers8020.map((b) => [norm(b.buyerName), b])
  )
  // Monthly target per buyer
  const monthlyTargetByBuyer = new Map(
    buyers8020.map((b) => [norm(b.buyerName), b.annualTarget / 12])
  )

  // Total monthly target (all 80/20 buyers, excl OTHERS)
  const totalMonthlyTarget = buyers8020
    .filter((b) => b.tier !== "OTHERS")
    .reduce((s, b) => s + b.annualTarget / 12, 0)

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalContainers = monthPI.reduce((s, r) => s + r.totalContainers, 0)
  const totalMTs        = monthPI.reduce((s, r) => s + r.qtyMTs, 0)
  const totalAmount     = monthPI.reduce((s, r) => s + r.totalAmount, 0)
  const uniqueBuyers    = new Set(monthPI.map((r) => norm(r.buyerCompanyName))).size
  const activeCountries = new Set(monthPI.map((r) => r.countries.toUpperCase())).size
  const activeSP        = new Set(monthPI.map((r) => r.salesPerson.toUpperCase()).filter(Boolean)).size
  const achievementPct  = totalMonthlyTarget > 0
    ? parseFloat(((totalContainers / totalMonthlyTarget) * 100).toFixed(1))
    : 0

  // ── Variety breakdown ─────────────────────────────────────────────────────
  const varietyMap = new Map<string, { containers: number; mts: number; amount: number }>()
  for (const r of monthPI) {
    const v = r.varieties?.trim() || "UNKNOWN"
    if (!varietyMap.has(v)) varietyMap.set(v, { containers: 0, mts: 0, amount: 0 })
    const e = varietyMap.get(v)!
    e.containers += r.totalContainers
    e.mts        += r.qtyMTs
    e.amount     += r.totalAmount
  }
  const varietyBreakdown = [...varietyMap.entries()]
    .map(([variety, data]) => ({
      variety,
      containers: parseFloat(data.containers.toFixed(2)),
      mts:        parseFloat(data.mts.toFixed(2)),
      amount:     parseFloat(data.amount.toFixed(2)),
      containersPct: totalContainers > 0
        ? parseFloat(((data.containers / totalContainers) * 100).toFixed(1))
        : 0,
    }))
    .sort((a, b) => b.containers - a.containers)

  // ── Country breakdown ──────────────────────────────────────────────────────
  const countryMap = new Map<string, { containers: number; mts: number; amount: number; buyers: Set<string> }>()
  for (const r of monthPI) {
    const c = r.countries?.toUpperCase().trim() || "UNKNOWN"
    if (!countryMap.has(c)) countryMap.set(c, { containers: 0, mts: 0, amount: 0, buyers: new Set() })
    const e = countryMap.get(c)!
    e.containers += r.totalContainers
    e.mts        += r.qtyMTs
    e.amount     += r.totalAmount
    e.buyers.add(norm(r.buyerCompanyName))
  }
  const countryBreakdown = [...countryMap.entries()]
    .map(([country, data]) => ({
      country,
      containers: parseFloat(data.containers.toFixed(2)),
      mts:        parseFloat(data.mts.toFixed(2)),
      amount:     parseFloat(data.amount.toFixed(2)),
      buyerCount: data.buyers.size,
      pct:        totalContainers > 0
        ? parseFloat(((data.containers / totalContainers) * 100).toFixed(1))
        : 0,
    }))
    .sort((a, b) => b.containers - a.containers)

  // ── Sales person breakdown ─────────────────────────────────────────────────
  const spMap = new Map<string, { containers: number; mts: number; amount: number; buyers: Set<string> }>()
  // Build SP → monthly target from 80/20 buyers
  const spTargetMap = new Map<string, number>()
  for (const b of buyers8020.filter((b) => b.tier !== "OTHERS")) {
    const spKey = (b.responsiblePerson || "—").toUpperCase().trim()
    spTargetMap.set(spKey, (spTargetMap.get(spKey) ?? 0) + b.annualTarget / 12)
  }

  for (const r of monthPI) {
    const sp = r.salesPerson?.toUpperCase().trim() || "—"
    if (!spMap.has(sp)) spMap.set(sp, { containers: 0, mts: 0, amount: 0, buyers: new Set() })
    const e = spMap.get(sp)!
    e.containers += r.totalContainers
    e.mts        += r.qtyMTs
    e.amount     += r.totalAmount
    e.buyers.add(norm(r.buyerCompanyName))
  }
  const salesPersonBreakdown = [...spMap.entries()]
    .map(([salesPerson, data]) => {
      const target = spTargetMap.get(salesPerson) ?? 0
      return {
        salesPerson,
        containers:     parseFloat(data.containers.toFixed(2)),
        mts:            parseFloat(data.mts.toFixed(2)),
        amount:         parseFloat(data.amount.toFixed(2)),
        monthlyTarget:  parseFloat(target.toFixed(2)),
        achievementPct: target > 0
          ? parseFloat(((data.containers / target) * 100).toFixed(1))
          : 0,
        buyerCount: data.buyers.size,
      }
    })
    .sort((a, b) => b.containers - a.containers)

  // ── Buyer breakdown ────────────────────────────────────────────────────────
  const buyerSalesMap = new Map<string, { containers: number; mts: number; amount: number; country: string; sp: string }>()
  for (const r of monthPI) {
    const key = norm(r.buyerCompanyName)
    if (!buyerSalesMap.has(key)) {
      buyerSalesMap.set(key, { containers: 0, mts: 0, amount: 0, country: r.countries, sp: r.salesPerson })
    }
    const e = buyerSalesMap.get(key)!
    e.containers += r.totalContainers
    e.mts        += r.qtyMTs
    e.amount     += r.totalAmount
  }
  const buyerBreakdown = [...buyerSalesMap.entries()]
    .map(([key, data]) => {
      const b80      = buyerMap.get(key)
      const target   = monthlyTargetByBuyer.get(key) ?? 0
      const isIn8020 = !!b80 && b80.tier !== "OTHERS"
      return {
        buyerName:        key.replace(/\b\w/g, (c) => c.toUpperCase()),
        country:          data.country,
        tier:             b80?.tier ?? "—",
        responsiblePerson:b80?.responsiblePerson ?? data.sp,
        containers:       parseFloat(data.containers.toFixed(2)),
        mts:              parseFloat(data.mts.toFixed(2)),
        amount:           parseFloat(data.amount.toFixed(2)),
        monthlyTarget:    parseFloat(target.toFixed(2)),
        achievementPct:   target > 0
          ? parseFloat(((data.containers / target) * 100).toFixed(1))
          : 0,
        isIn8020,
      }
    })
    .sort((a, b) => b.containers - a.containers)

  // ── Meetings in this month ─────────────────────────────────────────────────
  const { month: calMonth, year: calYear } = fyMonthToCalendar(month, fy)

  const byTier: Record<string, number> = { TIER1: 0, TIER2: 0, TIER3: 0 }
  const meetingRows: Array<{
    buyerName: string; country: string; tier: string
    meetingDate: string; completedBy: string; outcome: string; notes: string
  }> = []

  for (const sched of meetingSchedules) {
    for (const h of sched.history) {
      const d = new Date(h.meetingDate)
      if (isNaN(d.getTime())) continue
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
        const tierKey = sched.tier as string
        if (tierKey in byTier) byTier[tierKey]++
        meetingRows.push({
          buyerName:   sched.buyerName,
          country:     sched.country,
          tier:        sched.tier,
          meetingDate: h.meetingDate,
          completedBy: h.completedBy,
          outcome:     h.outcome,
          notes:       h.notes,
        })
      }
    }
  }
  meetingRows.sort((a, b) => b.meetingDate.localeCompare(a.meetingDate))

  // ── Calendar label ─────────────────────────────────────────────────────────
  const monthName       = FY_MONTH_NAMES[month] || `Month ${month}`
  const calendarMonthYear = `${monthName} ${calYear}`

  return NextResponse.json({
    fy,
    fyMonthNo:      month,
    monthName,
    calendarMonthYear,
    generatedAt:    new Date().toISOString(),

    summary: {
      totalContainers:    parseFloat(totalContainers.toFixed(2)),
      totalMTs:           parseFloat(totalMTs.toFixed(2)),
      totalAmount:        parseFloat(totalAmount.toFixed(2)),
      totalMonthlyTarget: parseFloat(totalMonthlyTarget.toFixed(2)),
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
      totalDone: meetingRows.length,
      byTier: { ...byTier, total: meetingRows.length },
      meetings: meetingRows,
    },
  })
}
