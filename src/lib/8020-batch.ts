/**
 * Batched 80/20 reminder dispatcher.
 *
 * Sales requirement (per Director, May 2026):
 *   • Office hours = 9:30 AM – 6:00 PM IST (UTC+5:30)
 *   • Send 3 reminders at a time, NOT all at once
 *   • Minimum 2-hour gap between batches (enforced by cron + gap-guard)
 *   • Most-urgent first: OVERDUE (longest overdue → least), then DUE_SOON
 *     (closest due → furthest)
 *
 * Vercel Cron fires at: 04:00, 06:00, 08:00, 10:00, 12:00 UTC
 *   = 09:30, 11:30, 13:30, 15:30, 17:30 IST  (5 batches/day max)
 *
 * Each invocation:
 *   1. Checks we're in the IST office-hours window (09:30–18:00)
 *   2. Checks ALERT_LOG_8020 — if a batch was sent < 2 h ago, skip
 *   3. Drops buyers already alerted today
 *   4. Sends ONE batch of BATCH_SIZE most-urgent buyers
 *   5. Logs every send → dedup for the rest of the day
 */

import { getMeetingSchedules, getAlertLogRows, addAlertLogEntry } from "./data"
import { sendMeetingReminderEmail } from "./email-8020"
import type { MeetingSchedule } from "@/types"

// ── Config ───────────────────────────────────────────────────────────────────
const BATCH_SIZE        = 3             // buyers per batch (each buyer = 1–2 emails)
const OFFICE_START_MIN  = 9 * 60 + 30  // 09:30 IST
const OFFICE_END_MIN    = 18 * 60      // 18:00 IST
const IST_OFFSET_MIN    = 5 * 60 + 30  // UTC+5:30
const MIN_BATCH_GAP_MS  = 2 * 60 * 60 * 1000  // 2 hours — minimum gap between batches

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Minutes since midnight IST for a given UTC Date. */
function istMinutes(now: Date): number {
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes()
  return (utcMin + IST_OFFSET_MIN) % (24 * 60)
}

/** True when the IST clock is between 09:30 and 18:00. */
export function isOfficeHoursIST(now: Date = new Date()): boolean {
  const m = istMinutes(now)
  return m >= OFFICE_START_MIN && m < OFFICE_END_MIN
}

/** Today's date in IST (YYYY-MM-DD) — used for ALERT_LOG_8020 dedup key. */
export function todayIST(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000)
  return ist.toISOString().split("T")[0]
}

/**
 * Urgency ranking — lower = more urgent.
 * OVERDUE first (most negative daysRemaining first), then DUE_SOON.
 */
function urgencyKey(m: MeetingSchedule): number {
  if (m.displayStatus === "OVERDUE")  return m.daysRemaining       // negative numbers, most negative wins
  if (m.displayStatus === "DUE_SOON") return 1000 + m.daysRemaining // 1000..1005
  return 9999
}

// ── Result type ──────────────────────────────────────────────────────────────

export interface BatchResult {
  ranAt:           string             // ISO timestamp
  skipped:         boolean            // true = outside office hours or nothing pending
  skipReason?:     string
  candidates:      number             // total eligible buyers today
  alreadySent:     number             // skipped due to dedup
  batchSize:       number             // buyers actually attempted this batch
  sent:            number             // successful email sends (recipient count)
  failed:          number
  lastBatchSentAt: string | null      // ISO timestamp of most recent alert today
  nextBatchAfter:  string | null      // ISO timestamp when next batch is allowed
  buyersSent:      { buyerName: string; tier: string; recipients: number; status: "SENT" | "FAILED" }[]
}

// ── Main entry ───────────────────────────────────────────────────────────────

/**
 * Run one batch tick. Idempotent — safe to call as often as you like; dedup
 * via ALERT_LOG_8020 ensures no buyer is double-alerted on the same day.
 */
export async function runReminderBatch(opts: {
  force?: boolean         // bypass office-hours gate (for manual / testing)
  batchSize?: number      // override BATCH_SIZE
} = {}): Promise<BatchResult> {
  const now    = new Date()
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
    result.skipped = true
    result.skipReason = `Outside office hours (current IST ~${Math.floor(istMinutes(now)/60)}:${String(istMinutes(now)%60).padStart(2,"0")}; window is 09:30–18:00 IST)`
    return result
  }

  // 2. Get all meetings + today's dedup log
  const todayISO  = todayIST(now)
  const [meetings, todaysAlerts] = await Promise.all([
    getMeetingSchedules(),
    getAlertLogRows(todayISO),
  ])

  // 2b. 2-hour gap guard — skip if a batch was sent recently (safety net)
  if (todaysAlerts.length > 0) {
    const sortedByTime = [...todaysAlerts]
      .filter((a) => a.createdAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const lastSentAt = sortedByTime[0]?.createdAt
    if (lastSentAt) {
      result.lastBatchSentAt = lastSentAt
      result.nextBatchAfter  = new Date(new Date(lastSentAt).getTime() + MIN_BATCH_GAP_MS).toISOString()
      if (!opts.force) {
        const msSinceLast = now.getTime() - new Date(lastSentAt).getTime()
        if (msSinceLast < MIN_BATCH_GAP_MS) {
          const minutesLeft = Math.ceil((MIN_BATCH_GAP_MS - msSinceLast) / 60_000)
          result.skipped    = true
          result.skipReason = `Last batch was sent ${Math.floor(msSinceLast / 60_000)} min ago. Next batch allowed in ~${minutesLeft} min (2-hour gap enforced).`
          return result
        }
      }
    }
  }

  const sentToday = new Set(todaysAlerts.map((a) => `${a.meetingId}|${a.emailTo}`))

  // 3. Filter to eligible buyers (OVERDUE or DUE_SOON) and sort by urgency
  const eligible = meetings
    .filter((m) => m.displayStatus === "OVERDUE" || m.displayStatus === "DUE_SOON")
    .sort((a, b) => urgencyKey(a) - urgencyKey(b))

  result.candidates = eligible.length

  // 4. Drop buyers fully alerted today (all their recipients already in log)
  const pending = eligible.filter((m) => {
    const recipients = collectRecipients(m)
    if (!recipients.length) return false
    const allDone = recipients.every((email) => sentToday.has(`${m.id}|${email}`))
    if (allDone) result.alreadySent++
    return !allDone
  })

  if (!pending.length) {
    result.skipped = true
    result.skipReason = result.candidates === 0
      ? "No buyers are OVERDUE or DUE_SOON right now."
      : `All ${result.candidates} eligible buyers already alerted today.`
    return result
  }

  // 5. Take just the next batch
  const batchSize = opts.batchSize ?? BATCH_SIZE
  const batch = pending.slice(0, batchSize)
  result.batchSize = batch.length

  // 6. Send sequentially (small batch — no need to parallelize, gentler on SMTP)
  for (const m of batch) {
    const recipients = collectRecipients(m)

    const { ok, reason } = await sendMeetingReminderEmail({
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

    // Log every recipient (so this buyer is dedup'd for the rest of the day)
    for (const email of recipients) {
      if (sentToday.has(`${m.id}|${email}`)) continue
      await addAlertLogEntry({
        meetingId: m.id,
        buyerName: m.buyerName,
        alertDate: todayISO,
        emailTo:   email,
        status:    ok ? "SENT" : "FAILED",
      })
      sentToday.add(`${m.id}|${email}`)
    }

    if (ok) {
      result.sent += recipients.length
      result.buyersSent.push({ buyerName: m.buyerName, tier: m.tier, recipients: recipients.length, status: "SENT" })
    } else {
      result.failed += recipients.length
      result.buyersSent.push({ buyerName: m.buyerName, tier: m.tier, recipients: recipients.length, status: "FAILED" })
      console.warn(`[batch] ${m.buyerName} send failed: ${reason}`)
    }
  }

  return result
}

function collectRecipients(m: MeetingSchedule): string[] {
  const out: string[] = []
  if (m.responsibleEmail) out.push(m.responsibleEmail)
  if (m.coordinatorEmail && m.coordinatorEmail !== m.responsibleEmail) {
    out.push(m.coordinatorEmail)
  }
  return out
}
