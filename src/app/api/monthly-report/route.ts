/**
 * GET /api/monthly-report?fy=2025-26&month=2
 *
 * Monthly MIS aggregation.
 * FY month: 1=April … 9=December, 10=January, 11=February, 12=March
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getPIRecords, get8020Buyers, getMeetingSchedules, filterPIByFY } from "@/lib/data"
import { getCurrentFY, parsePIDate } from "@/lib/fy-utils"
import type { FinancialYear } from "@/types"

// ── Helpers ───────────────────────────────────────────────────────────────────

function fyMonthToCalendar(fyMonthNo: number, fy: string) {
  const fyStartYear = parseInt(fy.split("-")[0], 10)
  const calMonth    = (3 + fyMonthNo - 1) % 12          // 0-indexed, Apr=3
  const calYear     = fyMonthNo <= 9 ? fyStartYear : fyStartYear + 1
  return { month: calMonth, year: calYear }
}

/** Normalize variety: "Basmati" / "BASMATI" → "BASMATI"; anything with "non" → "NON BASMATI" */
function normalizeVariety(raw: string): string {
  const s = (raw ?? "").trim().toLowerCase().replace(/[^a-z\s]/g, "")
  if (s.includes("non") && s.includes("basmati")) return "NON BASMATI"
  if (s.includes("basmati"))                       return "BASMATI"
  if (s === "")                                    return "UNSPECIFIED"
  return raw.trim().toUpperCase()
}

/** Normalize description: consistent uppercase + whitespace */
function normalizeDescription(raw: string): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, " ") || "NOT SPECIFIED"
}

function getMonthPI(
  fyPI: ReturnType<typeof filterPIByFY>,
  fy: string,
  fyMonth: number,
) {
  return fyPI.filter((r) => {
    if (r.fyMonthNo > 0) return r.fyMonthNo === fyMonth
    const d = parsePIDate(r.piDate)
    if (isNaN(d.getTime())) return false
    const { month, year } = fyMonthToCalendar(fyMonth, fy)
    return d.getMonth() === month && d.getFullYear() === year
  })
}

const FY_MONTH_NAMES = [
  "", "April","May","June","July","August","September",
  "October","November","December","January","February","March",
]

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url   = new URL(req.url)
  const fy    = (url.searchParams.get("fy") || getCurrentFY()) as FinancialYear
  const month = Math.max(1, Math.min(12, parseInt(url.searchParams.get("month") || "1", 10)))

  const [allPI, buyers8020, meetingSchedules] = await Promise.all([
    getPIRecords(), get8020Buyers(), getMeetingSchedules(),
  ])

  const fyPI    = filterPIByFY(allPI, fy)
  const monthPI = getMonthPI(fyPI, fy, month)

  const norm = (s: string) => s.toLowerCase().trim()

  // ── 80/20 buyer lookup ─────────────────────────────────────────────────────
  const buyerMap          = new Map(buyers8020.map((b) => [norm(b.buyerName), b]))
  const monthlyTargetByBuyer = new Map(buyers8020.map((b) => [norm(b.buyerName), b.annualTarget / 12]))

  const monitored = buyers8020.filter((b) => b.tier !== "OTHERS")
  const totalMonthlyTarget = monitored.reduce((s, b) => s + b.annualTarget / 12, 0)

  // ── Country target map (from 80/20 buyers) ─────────────────────────────────
  const countryTargetMap = new Map<string, number>()
  for (const b of monitored) {
    const cKey = b.country.toUpperCase().trim()
    countryTargetMap.set(cKey, (countryTargetMap.get(cKey) ?? 0) + b.annualTarget / 12)
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totalContainers = monthPI.reduce((s, r) => s + r.totalContainers, 0)
  const totalMTs        = monthPI.reduce((s, r) => s + r.qtyMTs, 0)
  const totalAmount     = monthPI.reduce((s, r) => s + r.totalAmount, 0)
  const uniqueBuyers    = new Set(monthPI.map((r) => norm(r.buyerCompanyName))).size
  const activeCountries = new Set(monthPI.map((r) => r.countries.toUpperCase())).size
  const activeSP        = new Set(monthPI.map((r) => r.salesPerson.toUpperCase()).filter(Boolean)).size
  const achievementPct  = totalMonthlyTarget > 0
    ? parseFloat(((totalContainers / totalMonthlyTarget) * 100).toFixed(1)) : 0

  // ── Variety with description sub-breakdown ─────────────────────────────────
  const varietyDescMap = new Map<string, Map<string, { containers: number; mts: number; amount: number }>>()
  for (const r of monthPI) {
    const variety = normalizeVariety(r.varieties)
    const desc    = normalizeDescription(r.description)
    if (!varietyDescMap.has(variety)) varietyDescMap.set(variety, new Map())
    const dMap = varietyDescMap.get(variety)!
    if (!dMap.has(desc)) dMap.set(desc, { containers: 0, mts: 0, amount: 0 })
    const e = dMap.get(desc)!
    e.containers += r.totalContainers
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

  // ── Sales person breakdown (share%, no targets) ────────────────────────────
  const spMap = new Map<string, { containers: number; mts: number; amount: number; buyers: Set<string> }>()
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

  // ── Buyer breakdown (target vs actual) ────────────────────────────────────
  const buyerSalesMap = new Map<string, { containers: number; mts: number; amount: number; country: string; sp: string }>()
  for (const r of monthPI) {
    const key = norm(r.buyerCompanyName)
    if (!buyerSalesMap.has(key))
      buyerSalesMap.set(key, { containers: 0, mts: 0, amount: 0, country: r.countries, sp: r.salesPerson })
    const e = buyerSalesMap.get(key)!
    e.containers += r.totalContainers
    e.mts        += r.qtyMTs
    e.amount     += r.totalAmount
  }
  const buyerBreakdown = [...buyerSalesMap.entries()]
    .map(([key, data]) => {
      const b80    = buyerMap.get(key)
      const target = monthlyTargetByBuyer.get(key) ?? 0
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

  // ── Meetings in this month ─────────────────────────────────────────────────
  const { month: calMonth, year: calYear } = fyMonthToCalendar(month, fy)
  const byTierDone: Record<string, number> = { TIER1: 0, TIER2: 0, TIER3: 0 }
  const tierBuyerCount = { TIER1: 0, TIER2: 0, TIER3: 0 }
  for (const b of monitored) {
    const t = b.tier as keyof typeof tierBuyerCount
    if (t in tierBuyerCount) tierBuyerCount[t]++
  }

  const meetingRows: Array<{
    buyerName: string; country: string; tier: string
    meetingDate: string; completedBy: string; outcome: string; notes: string
  }> = []
  for (const sched of meetingSchedules) {
    for (const h of sched.history) {
      const d = new Date(h.meetingDate)
      if (isNaN(d.getTime())) continue
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
        const tk = sched.tier as string
        if (tk in byTierDone) byTierDone[tk]++
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

  const monthName         = FY_MONTH_NAMES[month] || `Month ${month}`
  const calendarMonthYear = `${monthName} ${calYear}`

  return NextResponse.json({
    fy, fyMonthNo: month, monthName, calendarMonthYear,
    generatedAt: new Date().toISOString(),

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
      totalDone:   meetingRows.length,
      totalBuyers: monitored.length,
      byTier: {
        TIER1: { done: byTierDone.TIER1, total: tierBuyerCount.TIER1 },
        TIER2: { done: byTierDone.TIER2, total: tierBuyerCount.TIER2 },
        TIER3: { done: byTierDone.TIER3, total: tierBuyerCount.TIER3 },
      },
    },
  })
}
