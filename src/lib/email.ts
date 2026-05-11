/**
 * Email notifications via Resend.
 *
 * Env vars (set in .env.local):
 *   RESEND_API_KEY        — required for sending
 *   RESEND_FROM_EMAIL     — sender (e.g. "Shazia Rice <alerts@shaziarice.com>")
 *   RESEND_REPLY_TO       — optional reply-to
 *   APP_BASE_URL          — used to build absolute action URLs in emails (e.g. https://tracker.shaziarice.com)
 *
 * If RESEND_API_KEY is missing, sends are no-ops (logged to console).
 */

import { Resend } from "resend"
import type { Alert, PendingReview } from "@/types"
import { emailForSalesPerson, managerEmails } from "./users"

const API_KEY    = process.env.RESEND_API_KEY ?? ""
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "Shazia Rice <alerts@shaziarice.com>"
const REPLY_TO   = process.env.RESEND_REPLY_TO ?? ""
const BASE_URL   = process.env.APP_BASE_URL ?? "http://localhost:3000"

const SEVERITY_COLOR: Record<string, string> = {
  HIGH:   "#dc2626",
  MEDIUM: "#d97706",
  LOW:    "#2563eb",
}

const TYPE_LABEL: Record<string, string> = {
  BUYER_BEHIND_PACE:     "Behind pace",
  BUYER_DORMANT:         "Dormant buyer",
  COUNTRY_BEHIND:        "Country behind",
  MILESTONE_ACHIEVED:    "Milestone achieved",
  KEY_BUYER_AGING:       "Key buyer aging",
  USER_REMARK:           "Remark",
  ACTION_PLAN:           "Action plan",
  ACTION_OVERDUE:        "Action plan overdue",
  WEEKLY_REVIEW_PENDING: "Weekly review pending",
}

function getResend(): Resend | null {
  if (!API_KEY) return null
  return new Resend(API_KEY)
}

// ── Alert email ───────────────────────────────────────────────────────────────

export async function sendAlertEmail(alert: Alert): Promise<{ ok: boolean; reason?: string }> {
  const resend = getResend()
  if (!resend) {
    console.log("[email] (no-op, RESEND_API_KEY missing)", alert.title)
    return { ok: false, reason: "no_api_key" }
  }

  // Pick recipients: SP + their manager
  const spEmail = emailForSalesPerson(alert.salesPerson)
  const ccs     = managerEmails()
  if (!spEmail && ccs.length === 0) return { ok: false, reason: "no_recipients" }

  const to = spEmail ? [spEmail] : ccs
  const cc = spEmail ? ccs : []

  const color   = SEVERITY_COLOR[alert.severity] ?? "#475569"
  const action  = alert.actionUrl ? `${BASE_URL}${alert.actionUrl}` : `${BASE_URL}/alerts`
  const subject = `[${alert.severity}] ${alert.title}`

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; background: #f9fafb; padding: 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: ${color}; padding: 16px 20px;">
      <p style="margin: 0; color: white; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">${alert.severity} · ${TYPE_LABEL[alert.triggerType] ?? alert.triggerType}</p>
      <h2 style="margin: 4px 0 0 0; color: white; font-size: 18px;">${escapeHtml(alert.title)}</h2>
    </div>
    <div style="padding: 20px;">
      <p style="margin: 0 0 12px 0; color: #374151; font-size: 14px; line-height: 1.5;">${escapeHtml(alert.message)}</p>
      ${alert.dueDate ? `<p style="margin: 0 0 12px 0; padding: 8px 12px; background: #fef3c7; border-radius: 6px; color: #78350f; font-size: 13px;"><strong>Due:</strong> ${alert.dueDate}${alert.followUpOwner ? ` · <strong>Owner:</strong> ${escapeHtml(alert.followUpOwner)}` : ""}</p>` : ""}
      <table style="width: 100%; font-size: 13px; color: #6b7280; margin-bottom: 16px;">
        ${alert.buyerName    ? `<tr><td style="padding: 4px 0;">Buyer:</td><td style="padding: 4px 0; color: #111827; text-align: right;"><strong>${escapeHtml(alert.buyerName)}</strong></td></tr>` : ""}
        ${alert.country      ? `<tr><td style="padding: 4px 0;">Country:</td><td style="padding: 4px 0; color: #111827; text-align: right;">${escapeHtml(alert.country)}</td></tr>` : ""}
        ${alert.salesPerson  ? `<tr><td style="padding: 4px 0;">Owner:</td><td style="padding: 4px 0; color: #111827; text-align: right;">${escapeHtml(alert.salesPerson)}</td></tr>` : ""}
        <tr><td style="padding: 4px 0;">FY Week:</td><td style="padding: 4px 0; color: #111827; text-align: right;">W${alert.fyWeek}</td></tr>
      </table>
      <a href="${action}" style="display: inline-block; padding: 10px 20px; background: #16a34a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">View in Tracker →</a>
    </div>
    <div style="padding: 12px 20px; border-top: 1px solid #f3f4f6; background: #f9fafb;">
      <p style="margin: 0; font-size: 11px; color: #9ca3af;">Shazia Rice Sales Tracker · Auto-generated alert</p>
    </div>
  </div>
</body>
</html>`.trim()

  try {
    const res = await resend.emails.send({
      from:    FROM_EMAIL,
      to,
      cc:      cc.length > 0 ? cc : undefined,
      replyTo: REPLY_TO || undefined,
      subject,
      html,
    })
    return { ok: !!res.data?.id }
  } catch (e: unknown) {
    console.error("[email] send failed:", (e as Error).message)
    return { ok: false, reason: "send_failed" }
  }
}

// ── Weekly review reminder email ──────────────────────────────────────────────

export async function sendReviewReminderEmail(review: PendingReview): Promise<{ ok: boolean; reason?: string }> {
  const resend = getResend()
  if (!resend) {
    console.log("[email] (no-op) review reminder for", review.salesPerson)
    return { ok: false, reason: "no_api_key" }
  }
  const to = emailForSalesPerson(review.salesPerson) ?? review.email
  if (!to) return { ok: false, reason: "no_recipient" }

  const action  = `${BASE_URL}/execution`
  const subject = `Weekly review pending · W${review.fyWeek}${review.weeksOverdue > 1 ? ` (${review.weeksOverdue}w overdue)` : ""}`

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; background: #f9fafb; padding: 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: #d97706; padding: 16px 20px;">
      <p style="margin: 0; color: white; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Weekly Review Pending</p>
      <h2 style="margin: 4px 0 0 0; color: white; font-size: 18px;">Hi ${escapeHtml(review.salesPerson)} — week ${review.fyWeek} review is pending</h2>
    </div>
    <div style="padding: 20px;">
      <p style="color: #374151; font-size: 14px; line-height: 1.5; margin: 0 0 12px 0;">
        Please log your weekly review. It takes under 2 minutes:
      </p>
      <ul style="color: #6b7280; font-size: 13px; padding-left: 20px;">
        <li>Wins this week</li>
        <li>Blockers</li>
        <li>Next week's focus</li>
        <li>Open PI count</li>
      </ul>
      <a href="${action}" style="display: inline-block; padding: 10px 20px; background: #16a34a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 8px;">Log Review →</a>
    </div>
  </div>
</body>
</html>`.trim()

  try {
    const res = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      replyTo: REPLY_TO || undefined,
      subject,
      html,
    })
    return { ok: !!res.data?.id }
  } catch (e: unknown) {
    console.error("[email] review reminder failed:", (e as Error).message)
    return { ok: false, reason: "send_failed" }
  }
}

// ── HTML escape ───────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
