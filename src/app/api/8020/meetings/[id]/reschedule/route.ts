/**
 * POST /api/8020/meetings/[id]/reschedule
 *
 * PUBLIC endpoint — no login required (token-based auth).
 * Called from the meeting-reschedule page after token validation.
 *
 * Body: { token: string; newDueDate: string; remarks?: string }
 */

import { NextResponse } from "next/server"
import { validateDoneToken, rescheduleMeeting } from "@/lib/data"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: { token?: string; newDueDate?: string; remarks?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }) }

  const { token, newDueDate, remarks } = body

  if (!token || !newDueDate)
    return NextResponse.json({ error: "Missing token or newDueDate" }, { status: 400 })

  // Validate using same HMAC token as Done button
  const validId = await validateDoneToken(token, id)
  if (!validId || validId !== id)
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 })

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDueDate))
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 })

  const result = await rescheduleMeeting({ meetingId: id, newDueDate, remarks })
  if (!result.ok)
    return NextResponse.json({ error: result.error ?? "Failed to reschedule" }, { status: 500 })

  return NextResponse.json({ ok: true, newDueDate })
}
