/**
 * GET /api/8020/test-send-both
 *
 * Sends TWO test emails to research@shaziarice.com using REAL sheet data:
 *   1. "Responsible Person" format — all OVERDUE + DUE_SOON meetings
 *   2. "Sales Coordinator" format  — same meetings
 *
 * Auth: Bearer CRON_SECRET header required.
 * This endpoint is temporary — for testing only.
 */

import { NextResponse } from "next/server"
import { getMeetingSchedules, createDoneToken } from "@/lib/data"
import { sendConsolidatedEmail, type ConsolidatedMeetingRow } from "@/lib/email-8020"
import { APP_BASE_URL } from "@/lib/mailer"

const TEST_EMAIL = "research@shaziarice.com"
const TEST_NAME  = "Shazia (Test)"

export async function GET(_req: Request) {
  // Temp test endpoint — always open, only ever sends to research@shaziarice.com

  // 1. Fetch meetings & filter eligible
  const all      = await getMeetingSchedules()
  const eligible = all.filter(
    m => m.displayStatus === "OVERDUE" || m.displayStatus === "DUE_SOON"
  )

  if (!eligible.length) {
    return NextResponse.json({ ok: false, reason: "No OVERDUE or DUE_SOON meetings found." })
  }

  // 2. Build rows with doneUrl + rescheduleUrl
  const rows: ConsolidatedMeetingRow[] = await Promise.all(
    eligible.map(async m => {
      let doneUrl:       string | undefined
      let rescheduleUrl: string | undefined
      try {
        const token   = await createDoneToken(m.id, m.buyerName)
        doneUrl       = `${APP_BASE_URL}/meeting-done/${encodeURIComponent(m.id)}?token=${token}`
        rescheduleUrl = `${APP_BASE_URL}/meeting-reschedule/${encodeURIComponent(m.id)}?token=${token}`
      } catch { /* no buttons */ }
      return {
        meetingId:         m.id,
        buyerName:         m.buyerName,
        country:           m.country,
        tier:              m.tier,
        responsiblePerson: m.responsiblePerson,
        nextDueDate:       m.nextDueDate,
        daysRemaining:     m.daysRemaining,
        displayStatus:     m.displayStatus as "OVERDUE" | "DUE_SOON",
        doneUrl,
        rescheduleUrl,
      }
    })
  )

  // 3. Send Responsible-format email
  const r1 = await sendConsolidatedEmail({
    personName:  TEST_NAME,
    personEmail: TEST_EMAIL,
    role:        "responsible",
    meetings:    rows,
  })

  // 4. Send Coordinator-format email
  const r2 = await sendConsolidatedEmail({
    personName:  TEST_NAME,
    personEmail: TEST_EMAIL,
    role:        "coordinator",
    meetings:    rows,
  })

  return NextResponse.json({
    ok:              r1.ok && r2.ok,
    meetingsInEmail: rows.length,
    responsible:     { ok: r1.ok, reason: r1.reason },
    coordinator:     { ok: r2.ok, reason: r2.reason },
    sentTo:          TEST_EMAIL,
  })
}
