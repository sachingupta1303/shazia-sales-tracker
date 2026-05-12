/**
 * GET /api/performance/meetings
 *
 * Aggregated 80/20 meeting analytics for the Performance → Meeting Reports tab.
 * Returns:
 *   - High-level KPIs (total meetings, overdue, due-soon, monitored buyers)
 *   - Outcome distribution (counts per MeetingOutcome)
 *   - Per-salesperson stats (meetings done, overdue, due-soon)
 *   - Per-tier stats (T1/T2/T3 meetings done this FY)
 *   - Monthly trend (last 12 months of meeting counts)
 *   - Recent meeting log (most recent 50)
 *
 * Filters: ?salesPerson, ?tier, ?outcome
 */

import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { getMeetingSchedules } from "@/lib/data"
import { getCurrentFY } from "@/lib/fy-utils"
import type { AppUser, MeetingSchedule } from "@/types"

export const dynamic = "force-dynamic"

interface FlatMeeting {
  meetingId:         string
  buyerName:         string
  country:           string
  tier:              string
  responsiblePerson: string
  salesCoordinator:  string
  historyId:         string
  meetingDate:       string
  outcome:           string
  notes:             string
  completedBy:       string
  createdAt:         string
}

function fyStartMonth(fy: string): { year: number; month: number } {
  // FY format: "2026-27" → April 2026
  const [startYear] = fy.split("-").map(Number)
  return { year: startYear, month: 3 } // month is 0-indexed (April = 3)
}

function fyStartDate(fy: string): Date {
  const { year, month } = fyStartMonth(fy)
  return new Date(year, month, 1)
}

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const user = session.user as AppUser
    const url  = new URL(req.url)

    const spFilter      = url.searchParams.get("salesPerson") || undefined
    const tierFilter    = url.searchParams.get("tier")        || undefined
    const outcomeFilter = url.searchParams.get("outcome")     || undefined

    // SP role only sees their own data
    const effectiveSP =
      user.role === "SALES_PERSON" && user.salesPersonName
        ? user.salesPersonName
        : spFilter

    const meetings = await getMeetingSchedules()

    // Apply buyer-level filters first
    const filteredMeetings: MeetingSchedule[] = meetings.filter((m) => {
      if (effectiveSP && m.responsiblePerson.toUpperCase() !== effectiveSP.toUpperCase()) return false
      if (tierFilter  && m.tier !== tierFilter) return false
      return true
    })

    const fy            = getCurrentFY()
    const fyStart       = fyStartDate(fy)
    const fyStartISO    = fyStart.toISOString().split("T")[0]
    const todayISO      = new Date().toISOString().split("T")[0]
    const monthStr      = todayISO.slice(0, 7)  // YYYY-MM

    // ── Flatten history rows so we can run analytics ─────────────────────────
    const allRows: FlatMeeting[] = []
    for (const m of filteredMeetings) {
      for (const h of m.history) {
        if (outcomeFilter && h.outcome !== outcomeFilter) continue
        allRows.push({
          meetingId:         m.id,
          buyerName:         m.buyerName,
          country:           m.country,
          tier:              m.tier,
          responsiblePerson: m.responsiblePerson,
          salesCoordinator:  m.salesCoordinator,
          historyId:         h.id,
          meetingDate:       h.meetingDate,
          outcome:           h.outcome || "OTHER",
          notes:             h.notes,
          completedBy:       h.completedBy,
          createdAt:         h.createdAt,
        })
      }
    }
    // Filter to current FY only for analytics
    const fyRows = allRows.filter((r) => r.meetingDate >= fyStartISO)

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const totalBuyers       = filteredMeetings.length
    const meetingsThisFY    = fyRows.length
    const meetingsThisMonth = fyRows.filter((r) => r.meetingDate.startsWith(monthStr)).length
    const meetingsToday     = fyRows.filter((r) => r.meetingDate === todayISO).length
    const overdueCount      = filteredMeetings.filter((m) => m.displayStatus === "OVERDUE").length
    const dueSoonCount      = filteredMeetings.filter((m) => m.displayStatus === "DUE_SOON").length
    const upcomingCount     = filteredMeetings.filter((m) => m.displayStatus === "UPCOMING").length

    // ── Outcome distribution ─────────────────────────────────────────────────
    const outcomeCounts: Record<string, number> = {}
    for (const r of fyRows) outcomeCounts[r.outcome] = (outcomeCounts[r.outcome] ?? 0) + 1

    // ── By Salesperson ───────────────────────────────────────────────────────
    interface SpRow {
      salesPerson:     string
      monitoredBuyers: number
      meetingsDone:    number
      overdue:         number
      dueSoon:         number
      orderConfirmed:  number
    }
    const spMap = new Map<string, SpRow>()
    for (const m of filteredMeetings) {
      const sp = m.responsiblePerson || "(unassigned)"
      if (!spMap.has(sp)) {
        spMap.set(sp, { salesPerson: sp, monitoredBuyers: 0, meetingsDone: 0, overdue: 0, dueSoon: 0, orderConfirmed: 0 })
      }
      const row = spMap.get(sp)!
      row.monitoredBuyers++
      if (m.displayStatus === "OVERDUE")  row.overdue++
      if (m.displayStatus === "DUE_SOON") row.dueSoon++
    }
    for (const r of fyRows) {
      const sp = r.responsiblePerson || "(unassigned)"
      if (!spMap.has(sp)) {
        spMap.set(sp, { salesPerson: sp, monitoredBuyers: 0, meetingsDone: 0, overdue: 0, dueSoon: 0, orderConfirmed: 0 })
      }
      const row = spMap.get(sp)!
      row.meetingsDone++
      if (r.outcome === "ORDER_CONFIRMED") row.orderConfirmed++
    }
    const bySalesPerson = [...spMap.values()].sort((a, b) => b.meetingsDone - a.meetingsDone)

    // ── By Tier ──────────────────────────────────────────────────────────────
    const byTier = (["TIER1", "TIER2", "TIER3"] as const).map((tier) => ({
      tier,
      monitoredBuyers: filteredMeetings.filter((m) => m.tier === tier).length,
      meetingsDone:    fyRows.filter((r) => r.tier === tier).length,
      overdue:         filteredMeetings.filter((m) => m.tier === tier && m.displayStatus === "OVERDUE").length,
      dueSoon:         filteredMeetings.filter((m) => m.tier === tier && m.displayStatus === "DUE_SOON").length,
    }))

    // ── Monthly trend (last 12 months) ───────────────────────────────────────
    const now = new Date()
    const monthly: { month: string; label: string; count: number; orderConfirmed: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const label = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
      const rows = allRows.filter((r) => r.meetingDate.startsWith(key))
      monthly.push({
        month: key,
        label,
        count: rows.length,
        orderConfirmed: rows.filter((r) => r.outcome === "ORDER_CONFIRMED").length,
      })
    }

    // ── Recent meetings log (last 50, most recent first) ─────────────────────
    const recent = [...allRows]
      .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)

    return NextResponse.json({
      kpi: {
        totalBuyers,
        meetingsThisFY,
        meetingsThisMonth,
        meetingsToday,
        overdue:  overdueCount,
        dueSoon:  dueSoonCount,
        upcoming: upcomingCount,
      },
      outcomeCounts,
      bySalesPerson,
      byTier,
      monthly,
      recent,
      meta: { fy, fyStartISO, generatedAt: new Date().toISOString() },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("[performance/meetings] ERROR:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
