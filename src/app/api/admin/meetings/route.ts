/**
 * Meeting Control admin API (Control Panel · Meetings tab).
 *
 * GET  /api/admin/meetings   — list all 80/20 meeting schedules
 * POST /api/admin/meetings   — reschedule one, or bulk-shift several
 *      single:    { action: "single", meetingId, newDueDate, remarks? }
 *      bulkShift: { action: "bulkShift", meetingIds: string[], shiftDays: number, remarks? }
 *
 * Reschedule moves the Next Due Date and logs a RESCHEDULED history entry
 * (reuses rescheduleMeeting). Bulk-shift moves each selected meeting's current
 * due date by ±N days (Sundays skipped to match the app's cadence rule).
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getMeetingSchedules, rescheduleMeeting } from "@/lib/data"
import type { AppUser } from "@/types"

function canAdmin(user: AppUser) {
  return user.role === "MANAGER" || user.role === "DIRECTOR"
    || user.role === "SUPER_ADMIN" || user.role === "ADMIN"
}

/** Shift a YYYY-MM-DD date by N calendar days; if it lands on Sunday, push +1. */
function shiftDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  if (!y || !m || !d) return ymd
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  if (dt.getDay() === 0) dt.setDate(dt.getDate() + 1)  // skip Sunday
  const mm = String(dt.getMonth() + 1).padStart(2, "0")
  const dd = String(dt.getDate()).padStart(2, "0")
  return `${dt.getFullYear()}-${mm}-${dd}`
}

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!canAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const schedules = await getMeetingSchedules()
  const rows = schedules.map((s) => ({
    id:              s.id,
    buyerName:       s.buyerName,
    country:         s.country,
    tier:            s.tier,
    responsiblePerson: s.responsiblePerson,
    lastMeetingDate: s.lastMeetingDate,
    nextDueDate:     s.nextDueDate,
    displayStatus:   s.displayStatus,
    daysRemaining:   s.daysRemaining,
  })).sort((a, b) => (a.nextDueDate || "").localeCompare(b.nextDueDate || ""))

  return NextResponse.json({ rows })
}

// ── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!canAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json() as {
    action:     "single" | "bulkShift"
    meetingId?:  string
    newDueDate?: string
    meetingIds?: string[]
    shiftDays?:  number
    remarks?:    string
  }

  // ── Single reschedule ──
  if (body.action === "single") {
    if (!body.meetingId || !body.newDueDate) {
      return NextResponse.json({ error: "meetingId and newDueDate required" }, { status: 400 })
    }
    const result = await rescheduleMeeting({
      meetingId:  body.meetingId,
      newDueDate: body.newDueDate,
      remarks:    body.remarks ?? `Rescheduled by ${user.name ?? "admin"} via Control Panel`,
    })
    if (!result.ok) return NextResponse.json({ error: result.error ?? "reschedule_failed" }, { status: 400 })
    return NextResponse.json({ ok: true, newDueDate: body.newDueDate })
  }

  // ── Bulk shift ──
  if (body.action === "bulkShift") {
    const ids   = body.meetingIds ?? []
    const shift = body.shiftDays ?? 0
    if (!ids.length)  return NextResponse.json({ error: "meetingIds required" }, { status: 400 })
    if (!shift)       return NextResponse.json({ error: "shiftDays must be non-zero" }, { status: 400 })
    if (Math.abs(shift) > 365) return NextResponse.json({ error: "shiftDays out of range" }, { status: 400 })

    // Snapshot current due dates BEFORE mutating (reschedule invalidates cache each call)
    const schedules = await getMeetingSchedules()
    const dueById = new Map(schedules.map((s) => [s.id, s.nextDueDate]))

    const results: { id: string; ok: boolean; newDueDate?: string; error?: string }[] = []
    for (const id of ids) {
      const curDue = dueById.get(id)
      if (!curDue) { results.push({ id, ok: false, error: "not_found" }); continue }
      const newDueDate = shiftDate(curDue, shift)
      const r = await rescheduleMeeting({
        meetingId:  id,
        newDueDate,
        remarks:    body.remarks ?? `Bulk shift ${shift > 0 ? "+" : ""}${shift}d by ${user.name ?? "admin"}`,
      })
      results.push({ id, ok: r.ok, newDueDate: r.ok ? newDueDate : undefined, error: r.ok ? undefined : r.error })
    }

    const okCount = results.filter((r) => r.ok).length
    return NextResponse.json({ ok: true, shifted: okCount, total: ids.length, results })
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}
