import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getMeetingSchedules } from "@/lib/data"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const period     = searchParams.get("period") || "all"   // all | month_1..12 | q1..q4
  const responsible = searchParams.get("responsible") || ""

  const meetings = await getMeetingSchedules()

  // Filter by responsible person
  const filtered = responsible
    ? meetings.filter(m => m.responsiblePerson?.toLowerCase().includes(responsible.toLowerCase()))
    : meetings

  // Helper: is a date in the selected period?
  function inPeriod(dateStr: string): boolean {
    if (!dateStr || period === "all") return true
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return false
    // FY month: April=1 ... March=12
    const cal = d.getMonth() + 1  // 1-12 calendar month
    const fyMonth = cal >= 4 ? cal - 3 : cal + 9  // Apr=1, May=2 ... Mar=12
    if (period.startsWith("month_")) {
      return fyMonth === parseInt(period.replace("month_", ""))
    }
    if (period === "q1") return fyMonth >= 1  && fyMonth <= 3
    if (period === "q2") return fyMonth >= 4  && fyMonth <= 6
    if (period === "q3") return fyMonth >= 7  && fyMonth <= 9
    if (period === "q4") return fyMonth >= 10 && fyMonth <= 12
    return true
  }

  // Rows with period-aware "done this period" flag
  const rows = filtered.map(m => {
    const doneThisPeriod = inPeriod(m.lastMeetingDate ?? "")
    return {
      id:                m.id,
      buyerName:         m.buyerName,
      country:           m.country,
      tier:              m.tier,
      responsiblePerson: m.responsiblePerson,
      salesCoordinator:  m.salesCoordinator,
      lastMeetingDate:   m.lastMeetingDate || null,
      nextDueDate:       m.nextDueDate,
      daysRemaining:     m.daysRemaining,
      displayStatus:     m.displayStatus,
      doneThisPeriod,
      totalMeetingsDone: m.history?.length ?? 0,
    }
  })

  // KPI summary
  const total    = rows.length
  const done     = rows.filter(r => r.doneThisPeriod && r.lastMeetingDate).length
  const neverMet = rows.filter(r => !r.lastMeetingDate).length
  const overdue  = rows.filter(r => r.displayStatus === "OVERDUE").length
  const dueSoon  = rows.filter(r => r.displayStatus === "DUE_SOON").length
  const upcoming = rows.filter(r => r.displayStatus === "UPCOMING").length

  // Unique responsible persons for filter dropdown
  const responsiblePersons = [...new Set(
    meetings.flatMap(m => m.responsiblePerson?.split("/").map(s => s.trim()) ?? [])
  )].filter(Boolean).sort()

  return NextResponse.json({ rows, kpis: { total, done, neverMet, overdue, dueSoon, upcoming }, responsiblePersons })
}
