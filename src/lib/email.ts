/**
 * Email notifications via nodemailer (SMTP).
 * See src/lib/mailer.ts for env-var setup.
 *
 * If SMTP is not configured, sends are no-ops (logged to console).
 */

import type { Alert, PendingReview } from "@/types"
import { emailForSalesPerson, managerEmails } from "./users"
import { sendMail, APP_BASE_URL, esc } from "./mailer"

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

// ── Alert email ───────────────────────────────────────────────────────────────

export async function sendAlertEmail(alert: Alert): Promise<{ ok: boolean; reason?: string }> {
  // Pick recipients: SP + their manager
  const spEmail = emailForSalesPerson(alert.salesPerson)
  const ccs     = managerEmails()
  if (!spEmail && ccs.length === 0) return { ok: false, reason: "no_recipients" }

  const to = spEmail ? [spEmail] : ccs
  const cc = spEmail ? ccs : []

  const color   = SEVERITY_COLOR[alert.severity] ?? "#475569"
  const action  = alert.actionUrl ? `${APP_BASE_URL}${alert.actionUrl}` : `${APP_BASE_URL}/alerts`
  const subject = `[${alert.severity}] ${alert.title}`

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; background: #f9fafb; padding: 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: ${color}; padding: 16px 20px;">
      <p style="margin: 0; color: white; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">${alert.severity} · ${TYPE_LABEL[alert.triggerType] ?? alert.triggerType}</p>
      <h2 style="margin: 4px 0 0 0; color: white; font-size: 18px;">${esc(alert.title)}</h2>
    </div>
    <div style="padding: 20px;">
      <p style="margin: 0 0 12px 0; color: #374151; font-size: 14px; line-height: 1.5;">${esc(alert.message)}</p>
      ${alert.dueDate ? `<p style="margin: 0 0 12px 0; padding: 8px 12px; background: #fef3c7; border-radius: 6px; color: #78350f; font-size: 13px;"><strong>Due:</strong> ${alert.dueDate}${alert.followUpOwner ? ` · <strong>Owner:</strong> ${esc(alert.followUpOwner)}` : ""}</p>` : ""}
      <table style="width: 100%; font-size: 13px; color: #6b7280; margin-bottom: 16px;">
        ${alert.buyerName    ? `<tr><td style="padding: 4px 0;">Buyer:</td><td style="padding: 4px 0; color: #111827; text-align: right;"><strong>${esc(alert.buyerName)}</strong></td></tr>` : ""}
        ${alert.country      ? `<tr><td style="padding: 4px 0;">Country:</td><td style="padding: 4px 0; color: #111827; text-align: right;">${esc(alert.country)}</td></tr>` : ""}
        ${alert.salesPerson  ? `<tr><td style="padding: 4px 0;">Owner:</td><td style="padding: 4px 0; color: #111827; text-align: right;">${esc(alert.salesPerson)}</td></tr>` : ""}
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

  return sendMail({ to, cc: cc.length ? cc : undefined, subject, html })
}

// ── Weekly review reminder email ──────────────────────────────────────────────

export async function sendReviewReminderEmail(review: PendingReview): Promise<{ ok: boolean; reason?: string }> {
  const to = emailForSalesPerson(review.salesPerson) ?? review.email
  if (!to) return { ok: false, reason: "no_recipient" }

  const action  = `${APP_BASE_URL}/execution`
  const subject = `Weekly review pending · W${review.fyWeek}${review.weeksOverdue > 1 ? ` (${review.weeksOverdue}w overdue)` : ""}`

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; background: #f9fafb; padding: 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: #d97706; padding: 16px 20px;">
      <p style="margin: 0; color: white; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Weekly Review Pending</p>
      <h2 style="margin: 4px 0 0 0; color: white; font-size: 18px;">Hi ${esc(review.salesPerson)} — week ${review.fyWeek} review is pending</h2>
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

  return sendMail({ to, subject, html })
}
