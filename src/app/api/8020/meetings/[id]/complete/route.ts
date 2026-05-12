/**
 * POST /api/8020/meetings/[id]/complete
 *
 * Marks a meeting as done: updates MEETING_SCHEDULE_8020 (new lastMeetingDate
 * and auto-calculated nextDueDate based on tier interval) and appends a row
 * to MEETING_HISTORY_8020.
 *
 * Body: { meetingDate?: "YYYY-MM-DD"; notes?: string }
 * Auth: NextAuth session cookie required.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { completeMeeting } from "@/lib/data"
import type { AppUser } from "@/types"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized — please sign in again." }, { status: 401 })
    }

    const user = session.user as unknown as AppUser
    const { id } = await params
    if (!id) return NextResponse.json({ error: "Missing meeting id" }, { status: 400 })

    let body: { meetingDate?: string; outcome?: string; notes?: string } = {}
    try { body = await req.json() } catch { /* empty body is fine */ }

    const meetingDate = body.meetingDate ?? new Date().toISOString().split("T")[0]
    const outcome     = (body.outcome ?? "OTHER").trim().toUpperCase()
    const notes       = (body.notes ?? "").trim()
    const completedBy = (user.name ?? user.email ?? "Unknown User").toString()

    console.log(`[8020/complete] id=${id} date=${meetingDate} outcome=${outcome} by=${completedBy}`)

    const updated = await completeMeeting({
      meetingId: id,
      meetingDate,
      outcome,
      notes,
      completedBy,
    })

    if (!updated) {
      console.warn(`[8020/complete] meeting not found: ${id}`)
      return NextResponse.json(
        { error: `Meeting not found in MEETING_SCHEDULE_8020 (id=${id}). Try refreshing the page.` },
        { status: 404 }
      )
    }

    console.log(`[8020/complete] ✓ ${updated.buyerName} → next due ${updated.nextDueDate}`)
    return NextResponse.json({ meeting: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    const stack = err instanceof Error ? err.stack : undefined
    console.error("[8020/complete] ERROR:", msg)
    if (stack) console.error(stack)
    return NextResponse.json(
      { error: `Failed to mark meeting done: ${msg}` },
      { status: 500 }
    )
  }
}
