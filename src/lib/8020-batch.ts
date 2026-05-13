/**
 * 80/20 consolidated reminder dispatcher.
 *
 * One email per person per day:
 *   • Groups ALL eligible meetings (OVERDUE + DUE_SOON ≤5d) by Responsible Person
 *     → sends one consolidated list email per person (no done button)
 *   • Groups same meetings by Sales Coordinator
 *     → sends one consolidated list email per coordinator (with ✓ Done magic-link per row)
 *
 * Dedup: ALERT_LOG_8020 tracks by emailTo per day — each person gets max 1 email/day.
 * 2-hour gap guard still enforced between batch runs.
 *
 * Schedule (GitHub Actions):
 *   04:00 UTC = 09:30 IST
 *   06:00 UTC = 11:30 IST
 *   08:00 UTC = 13:30 IST
 *   10:00 UTC = 15:30 IST
 *   12:00 UTC = 17:30 IST
 */

import { getMeetingSchedules, getAlertLogRows, addAlertLogEntry, createDoneToken } from "./data"
import { sendConsolidatedEmail, type ConsolidatedMeetingRow } from "./email-8020"
import { APP_BASE_URL } from "./mailer"
import type { MeetingSchedule } from "@/types"

// ── Config ────────────────────────────────────────────────────────────────────
const OFFICE_START_MIN = 9 * 60 + 30   // 09:30 IST
const OFFICE_END_MIN   = 18 * 60       // 18:00 IST
const IST_OFFSET_MIN   = 5 * 60 + 30   // UTC+5:30
const MIN_BATCH_GAP_MS = 2 * 60 * 60 * 1000  // 2-hour gap between runs

// ── Helpers ───────────────────────────────────────────────────────────────────

function istMinutes(now: Date): number {
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes()
  return (utcMin + IST_OFFSET_MIN) % (24 * 60)
}

export function isOfficeHoursIST(now: Date = new Date()): boolean {
  const m = istMinutes(now)
  return m >= OFFICE_START_MIN && m < OFFICE_END_MIN
}

export function todayIST(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000)
  return ist.toISOString().split("T")[0]
}

// ── Result type (backward-compat with admin page) ─────────────────────────────

export interface BatchResult {
  ranAt:           string
  skipped:         boolean
  skipReason?:     string
  candidates:      number        // total eligible buyers
  alreadySent:     number        // persons already emailed today (skipped)
  batchSize:       number        // persons emailed this run
  sent:            number        // emails sent successfully
  failed:          number        // emails failed
  lastBatchSentAt: string | null
  nextBatchAfter:  string | null
  buyersSent: {                  // one entry per person emailed (name = person, tier = role)
    buyerName:  string
    tier:       string
    recipients: number
    status:     "SENT" | "FAILED"
  }[]
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function runReminderBatch(opts: {
  force?:     boolean
  batchSize?: number   // kept for API compat — ignored in consolidated mode
} = {}): Promise<BatchResult> {
  const now = new Date()
  const result: BatchResult = {
    ranAt:           now.toISOString(),
    skipped:         false,
    candidates:      0,
    alreadySent:     0,
    batchSize:       0,
    sent:            0,
    failed:          0,
    lastBatchSentAt: null,
    nextBatchAfter:  null,
    buyersSent:      [],
  }

  // 1. Office-hours gate
  if (!opts.force && !isOfficeHoursIST(now)) {
    const m = istMinutes(now)
    result.skipped    = true
    result.skipReason = `Outside office hours (~${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} IST; window is 09:30–18:00 IST)`
    return result
  }

  // 2. Fetch meetings + today's alert log
  const todayISO = todayIST(now)
  const [meetings, todaysAlerts] = await Promise.all([
    getMeetingSchedules(),
    getAlertLogRows(todayISO),
  ])

  // 2b. 2-hour gap guard
  if (todaysAlerts.length > 0) {
    const sorted = [...todaysAlerts]
      .filter(a => a.createdAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const lastSentAt = sorted[0]?.createdAt
    if (lastSentAt) {
      result.lastBatchSentAt = lastSentAt
      result.nextBatchAfter  = new Date(new Date(lastSentAt).getTime() + MIN_BATCH_GAP_MS).toISOString()
      if (!opts.force) {
        const msSinceLast = now.getTime() - new Date(lastSentAt).getTime()
        if (msSinceLast < MIN_BATCH_GAP_MS) {
          const minLeft = Math.ceil((MIN_BATCH_GAP_MS - msSinceLast) / 60_000)
          result.skipped    = true
          result.skipReason = `Last batch was sent ${Math.floor(msSinceLast / 60_000)} min ago. Next allowed in ~${minLeft} min (2-hour gap).`
          return result
        }
      }
    }
  }

  // 3. Filter eligible meetings — OVERDUE or DUE_SOON (≤5 days)
  const eligible = meetings.filter(
    m => m.displayStatus === "OVERDUE" || m.displayStatus === "DUE_SOON"
  )
  result.candidates = eligible.length

  if (!eligible.length) {
    result.skipped    = true
    result.skipReason = "No buyers are OVERDUE or DUE_SOON right now."
    return result
  }

  // Sort: OVERDUE first (most overdue → least), then DUE_SOON (soonest → furthest)
  const sorted = [...eligible].sort((a, b) => {
    if (a.displayStatus !== b.displayStatus)
      return a.displayStatus === "OVERDUE" ? -1 : 1
    return a.daysRemaining - b.daysRemaining
  })

  // 4. Already-sent emails today (dedup by emailTo)
  const sentTodayEmails = new Set(todaysAlerts.map(a => a.emailTo))
  result.alreadySent    = sentTodayEmails.size

  // 5. Group by responsible email
  const byResponsible = new Map<string, { name: string; meetings: MeetingSchedule[] }>()
  for (const m of sorted) {
    if (!m.responsibleEmail) continue
    if (!byResponsible.has(m.responsibleEmail))
      byResponsible.set(m.responsibleEmail, { name: m.responsiblePerson, meetings: [] })
    byResponsible.get(m.responsibleEmail)!.meetings.push(m)
  }

  // 6. Group by coordinator email
  const byCoordinator = new Map<string, { name: string; meetings: MeetingSchedule[] }>()
  for (const m of sorted) {
    if (!m.coordinatorEmail) continue
    if (!byCoordinator.has(m.coordinatorEmail))
      byCoordinator.set(m.coordinatorEmail, { name: m.salesCoordinator, meetings: [] })
    byCoordinator.get(m.coordinatorEmail)!.meetings.push(m)
  }

  // ── 7. Send to Responsible Persons ──────────────────────────────────────────
  for (const [email, { name, meetings: mList }] of byResponsible) {
    if (sentTodayEmails.has(email)) continue   // already sent today

    const rows: ConsolidatedMeetingRow[] = mList.map(m => ({
      meetingId:         m.id,
      buyerName:         m.buyerName,
      country:           m.country,
      tier:              m.tier,
      responsiblePerson: m.responsiblePerson,
      nextDueDate:       m.nextDueDate,
      daysRemaining:     m.daysRemaining,
      displayStatus:     m.displayStatus as "OVERDUE" | "DUE_SOON",
    }))

    const { ok } = await sendConsolidatedEmail({
      personName:  name,
      personEmail: email,
      role:        "responsible",
      meetings:    rows,
    })

    await addAlertLogEntry({
      meetingId: "CONSOLIDATED",
      buyerName: `[Responsible] ${name}`,
      alertDate: todayISO,
      emailTo:   email,
      status:    ok ? "SENT" : "FAILED",
    })
    sentTodayEmails.add(email)

    result.batchSize++
    if (ok) result.sent++
    else    result.failed++
    result.buyersSent.push({
      buyerName:  name,
      tier:       "Responsible",
      recipients: mList.length,
      status:     ok ? "SENT" : "FAILED",
    })
  }

  // ── 8. Send to Coordinators (with magic-link tokens per row) ─────────────────
  for (const [email, { name, meetings: mList }] of byCoordinator) {
    if (sentTodayEmails.has(email)) continue

    // Generate magic link tokens in parallel
    const rows: ConsolidatedMeetingRow[] = await Promise.all(
      mList.map(async (m) => {
        let doneUrl = `${APP_BASE_URL}/8020`
        try {
          const token = await createDoneToken(m.id, m.buyerName)
          doneUrl = `${APP_BASE_URL}/meeting-done/${encodeURIComponent(m.id)}?token=${token}`
        } catch {
          // token creation failed — fallback to 8020 dashboard
        }
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
        }
      })
    )

    const { ok } = await sendConsolidatedEmail({
      personName:  name,
      personEmail: email,
      role:        "coordinator",
      meetings:    rows,
    })

    await addAlertLogEntry({
      meetingId: "CONSOLIDATED",
      buyerName: `[Coordinator] ${name}`,
      alertDate: todayISO,
      emailTo:   email,
      status:    ok ? "SENT" : "FAILED",
    })
    sentTodayEmails.add(email)

    result.batchSize++
    if (ok) result.sent++
    else    result.failed++
    result.buyersSent.push({
      buyerName:  name,
      tier:       "Coordinator",
      recipients: mList.length,
      status:     ok ? "SENT" : "FAILED",
    })
  }

  if (result.batchSize === 0) {
    result.skipped    = true
    result.skipReason = "All eligible persons already received their consolidated email today."
  }

  return result
}
