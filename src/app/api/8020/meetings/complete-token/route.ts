/**
 * POST /api/8020/meetings/complete-token
 *
 * Token-based meeting completion — no login required.
 * Used by coordinators who click the magic link in reminder emails.
 *
 * Body: { meetingId, token, meetingDate?, outcome?, notes? }
 */

import { NextResponse } from "next/server"
import { validateDoneToken, consumeDoneToken, completeMeeting } from "@/lib/data"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    let body: {
      meetingId?: string
      token?: string
      meetingDate?: string
      outcome?: string
      notes?: string
    } = {}
    try { body = await req.json() } catch { /* empty */ }

    const { meetingId, token } = body
    if (!meetingId || !token) {
      return NextResponse.json({ error: "meetingId and token are required" }, { status: 400 })
    }

    // Validate token
    const validMeetingId = await validateDoneToken(token)
    if (!validMeetingId) {
      return NextResponse.json(
        { error: "This link has expired or already been used. Please contact your coordinator." },
        { status: 403 }
      )
    }
    if (validMeetingId !== meetingId) {
      return NextResponse.json({ error: "Token does not match this meeting." }, { status: 403 })
    }

    const meetingDate = body.meetingDate ?? new Date().toISOString().split("T")[0]
    const outcome     = (body.outcome ?? "FOLLOW_UP").trim().toUpperCase()
    const notes       = (body.notes ?? "").trim()

    const updated = await completeMeeting({
      meetingId,
      meetingDate,
      outcome,
      notes,
      completedBy: "coordinator (email link)",
    })

    if (!updated) {
      return NextResponse.json(
        { error: "Meeting not found. It may have already been updated." },
        { status: 404 }
      )
    }

    // Consume token so it can't be reused
    await consumeDoneToken(token)

    return NextResponse.json({ ok: true, meeting: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("[complete-token] ERROR:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
