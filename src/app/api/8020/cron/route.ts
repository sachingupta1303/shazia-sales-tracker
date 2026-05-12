/**
 * GET /api/8020/cron
 *
 * Daily cron endpoint (Vercel Cron or external scheduler).
 * Finds all meetings within 5 days of due (or overdue) and sends reminder
 * emails to responsible person + coordinator, deduplicating by date+email
 * via the ALERT_LOG_8020 sheet.
 *
 * Secure via Authorization: Bearer <CRON_SECRET> (skipped if env var not set).
 */

import { NextResponse } from "next/server"
import {
  getMeetingSchedules,
  getAlertLogRows,
  addAlertLogEntry,
} from "@/lib/data"
import { sendMeetingReminderEmail } from "@/lib/email-8020"

const CRON_SECRET = process.env.CRON_SECRET ?? ""

function isAuthorized(req: Request): boolean {
  if (!CRON_SECRET) return true
  return req.headers.get("authorization") === `Bearer ${CRON_SECRET}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const todayISO = new Date().toISOString().split("T")[0]
  const meetings = await getMeetingSchedules()

  // Build dedup set: "meetingId|emailTo" already sent today
  const todaysAlerts = await getAlertLogRows(todayISO)
  const sentToday = new Set(todaysAlerts.map((a) => `${a.meetingId}|${a.emailTo}`))

  const results = { sent: 0, skipped: 0, failed: 0 }

  for (const m of meetings) {
    if (m.displayStatus !== "DUE_SOON" && m.displayStatus !== "OVERDUE") continue

    const recipients: string[] = []
    if (m.responsibleEmail) recipients.push(m.responsibleEmail)
    if (m.coordinatorEmail && m.coordinatorEmail !== m.responsibleEmail) {
      recipients.push(m.coordinatorEmail)
    }

    for (const emailTo of recipients) {
      if (sentToday.has(`${m.id}|${emailTo}`)) { results.skipped++; continue }

      const { ok } = await sendMeetingReminderEmail({
        meetingId:         m.id,
        buyerName:         m.buyerName,
        country:           m.country,
        tier:              m.tier,
        nextDueDate:       new Date(m.nextDueDate),
        daysRemaining:     m.daysRemaining,
        responsiblePerson: m.responsiblePerson,
        responsibleEmail:  m.responsibleEmail,
        salesCoordinator:  m.salesCoordinator,
        coordinatorEmail:  m.coordinatorEmail,
        target:            m.target,
        actual:            m.actual,
        achievementPct:    m.achievementPct,
        lastMeetingDate:   m.lastMeetingDate,
      })

      await addAlertLogEntry({
        meetingId: m.id,
        buyerName: m.buyerName,
        alertDate: todayISO,
        emailTo,
        status:    ok ? "SENT" : "FAILED",
      })

      if (ok) results.sent++; else results.failed++
    }
  }

  return NextResponse.json({
    date: todayISO,
    processed: meetings.length,
    ...results,
  })
}

// Vercel Cron uses GET by default but we accept POST too for flexibility.
export { GET as POST }
