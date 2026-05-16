/**
 * Temporary endpoint — sends real meeting reminder to research@shaziarice.com for testing.
 * DELETE this file after testing is done.
 */
import { NextResponse } from "next/server"
import { getMeetingSchedules, createDoneToken } from "@/lib/data"
import { sendConsolidatedEmail, type ConsolidatedMeetingRow } from "@/lib/email-8020"
import { APP_BASE_URL } from "@/lib/mailer"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? ""
  const auth   = req.headers.get("authorization") ?? ""
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const meetings = await getMeetingSchedules()

  const eligible = meetings.filter(
    m => m.displayStatus === "OVERDUE" || m.displayStatus === "DUE_SOON"
  )

  if (!eligible.length) {
    return NextResponse.json({ ok: false, reason: "No overdue/due-soon meetings found" })
  }

  const rows: ConsolidatedMeetingRow[] = await Promise.all(
    eligible.map(async (m) => {
      let doneUrl: string | undefined
      try {
        const token = await createDoneToken(m.id, m.buyerName)
        doneUrl = `${APP_BASE_URL}/meeting-done/${encodeURIComponent(m.id)}?token=${token}`
      } catch { /* skip */ }

      return {
        meetingId:         m.id,
        buyerName:         m.buyerName,
        country:           m.country ?? "",
        tier:              m.tier ?? "OTHERS",
        responsiblePerson: m.responsiblePerson ?? "",
        nextDueDate:       m.nextDueDate ?? "",
        daysRemaining:     m.daysRemaining ?? 0,
        displayStatus:     m.displayStatus as "OVERDUE" | "DUE_SOON",
        doneUrl,
      }
    })
  )

  const result = await sendConsolidatedEmail({
    personName:  "Research",
    personEmail: "research@shaziarice.com",
    role:        "coordinator",
    meetings:    rows,
  })

  return NextResponse.json({ ok: result.ok, total: rows.length, reason: result.reason })
}
