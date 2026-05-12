/**
 * POST /api/8020/meetings/[id]/undo
 *
 * Reverses the most recent "Mark as Done" action for a meeting:
 *   • Deletes the latest MEETING_HISTORY_8020 row for this meetingId
 *   • Recomputes lastMeetingDate from the prior history entry (or resets to
 *     bootstrap if there was no prior history)
 *   • Recomputes nextDueDate accordingly
 *
 * Use case: sales coordinator clicked Done by mistake — undo it.
 * Body: (none required)
 * Auth: NextAuth session cookie required.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { undoLastMeeting } from "@/lib/data"
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

    const undoneBy = (user.name ?? user.email ?? "Unknown User").toString()
    console.log(`[8020/undo] id=${id} by=${undoneBy}`)

    const { meeting, undone, removedHistoryId } = await undoLastMeeting({
      meetingId: id,
      undoneBy,
    })

    if (!meeting) {
      return NextResponse.json(
        { error: `Meeting not found (id=${id}).` },
        { status: 404 }
      )
    }
    if (!undone) {
      return NextResponse.json(
        { error: "Nothing to undo — this meeting has no history entries yet.", meeting },
        { status: 409 }
      )
    }

    console.log(`[8020/undo] ✓ removed history ${removedHistoryId}, new lastMeeting=${meeting.lastMeetingDate ?? "(none)"} nextDue=${meeting.nextDueDate}`)
    return NextResponse.json({ meeting, undone: true, removedHistoryId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("[8020/undo] ERROR:", msg)
    if (err instanceof Error && err.stack) console.error(err.stack)
    return NextResponse.json(
      { error: `Failed to undo meeting: ${msg}` },
      { status: 500 }
    )
  }
}
