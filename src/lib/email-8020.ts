/**
 * 80/20 Key Account meeting reminder emails.
 * Sends via the shared nodemailer SMTP transport (see src/lib/mailer.ts).
 *
 * Template includes:
 *  - Buyer + tier + country
 *  - Urgency banner (red overdue / amber due-soon)
 *  - Performance card (target / actual / achievement %)
 *  - Owner / coordinator details
 *  - "Action required" checklist
 *  - "Mark Done" CTA → /8020 page
 */
import { sendMail, APP_BASE_URL, esc } from "./mailer"
import { TIER_LABEL } from "./8020-utils"

export interface MeetingReminderPayload {
  meetingId?:        string   // optional only for legacy callers; required for working CTA
  buyerName:         string
  country:           string
  tier:              string
  nextDueDate:       Date
  daysRemaining:     number
  responsiblePerson: string
  responsibleEmail:  string
  salesCoordinator:  string
  coordinatorEmail:  string
  // Performance (optional — included when available)
  target?:           number
  actual?:           number
  achievementPct?:   number
  lastMeetingDate?:  string | null
}

const TIER_INTERVAL_LABEL: Record<string, string> = {
  TIER1: "every 15 days",
  TIER2: "every 20 days",
  TIER3: "every 30 days",
}

export async function sendMeetingReminderEmail(
  p: MeetingReminderPayload
): Promise<{ ok: boolean; reason?: string; previewUrl?: string }> {
  // Both responsible + coordinator receive the alert
  const to: string[] = []
  if (p.responsibleEmail) to.push(p.responsibleEmail)
  if (p.coordinatorEmail && p.coordinatorEmail !== p.responsibleEmail) {
    to.push(p.coordinatorEmail)
  }
  if (!to.length) return { ok: false, reason: "no_recipients" }

  const isOverdue      = p.daysRemaining < 0
  const isToday        = p.daysRemaining === 0
  const accent         = isOverdue ? "#dc2626" : isToday ? "#ea580c" : "#d97706"
  const accentSoft     = isOverdue ? "#fef2f2" : isToday ? "#fff7ed" : "#fffbeb"
  const accentBorder   = isOverdue ? "#fecaca" : isToday ? "#fed7aa" : "#fde68a"
  const urgencyText    = isOverdue
    ? `⚠️ OVERDUE by ${Math.abs(p.daysRemaining)} day${Math.abs(p.daysRemaining) === 1 ? "" : "s"}`
    : isToday
      ? `🔔 DUE TODAY`
      : `⏰ Due in ${p.daysRemaining} day${p.daysRemaining === 1 ? "" : "s"}`
  const tierLabel      = TIER_LABEL[p.tier] ?? p.tier
  const cycleLabel     = TIER_INTERVAL_LABEL[p.tier] ?? ""
  const dueDateStr     = p.nextDueDate.toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  })
  const lastMeetingStr = p.lastMeetingDate
    ? new Date(p.lastMeetingDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "No prior meeting recorded"

  const subject = isOverdue
    ? `[OVERDUE] Meeting with ${p.buyerName} — ${tierLabel}`
    : isToday
      ? `[DUE TODAY] Meeting with ${p.buyerName} — ${tierLabel}`
      : `Reminder: Meeting with ${p.buyerName} in ${p.daysRemaining} day${p.daysRemaining === 1 ? "" : "s"}`

  // Performance section (only if data available)
  const hasPerf = p.target !== undefined && p.target > 0
  const achColor = !hasPerf ? "#6b7280"
    : (p.achievementPct ?? 0) >= 100 ? "#16a34a"
    : (p.achievementPct ?? 0) >= 70  ? "#d97706"
    : "#dc2626"
  const achBg = !hasPerf ? "#f3f4f6"
    : (p.achievementPct ?? 0) >= 100 ? "#dcfce7"
    : (p.achievementPct ?? 0) >= 70  ? "#fef3c7"
    : "#fee2e2"

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:24px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">

  <!-- HEADER -->
  <tr><td style="background:${accent};padding:24px 28px">
    <p style="margin:0;color:rgba(255,255,255,.85);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">
      80/20 Key Account Alert · ${esc(tierLabel)}
    </p>
    <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3">
      Meeting reminder: ${esc(p.buyerName)}
    </h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px">${esc(p.country)}</p>
  </td></tr>

  <!-- URGENCY BANNER -->
  <tr><td style="padding:20px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:${accentSoft};border:1px solid ${accentBorder};border-radius:10px">
      <tr><td style="padding:14px 18px">
        <p style="margin:0;font-size:16px;font-weight:700;color:${accent}">${urgencyText}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#6b7280">
          Scheduled due date: <strong style="color:#111827">${dueDateStr}</strong>
        </p>
      </td></tr>
    </table>
  </td></tr>

  <!-- MEETING DETAILS -->
  <tr><td style="padding:20px 28px 0">
    <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.5px;text-transform:uppercase">
      Buyer Details
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;border-collapse:collapse">
      <tr><td style="padding:10px 0;color:#6b7280;border-bottom:1px solid #f3f4f6">Buyer</td>
          <td style="padding:10px 0;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6">${esc(p.buyerName)}</td></tr>
      <tr><td style="padding:10px 0;color:#6b7280;border-bottom:1px solid #f3f4f6">Country</td>
          <td style="padding:10px 0;color:#111827;text-align:right;border-bottom:1px solid #f3f4f6">${esc(p.country)}</td></tr>
      <tr><td style="padding:10px 0;color:#6b7280;border-bottom:1px solid #f3f4f6">Classification</td>
          <td style="padding:10px 0;text-align:right;border-bottom:1px solid #f3f4f6">
            <span style="background:${accent}1a;color:${accent};padding:3px 10px;border-radius:6px;font-weight:700;font-size:12px">${esc(tierLabel)}</span>
            <span style="color:#9ca3af;font-size:12px;margin-left:6px">${esc(cycleLabel)}</span>
          </td></tr>
      <tr><td style="padding:10px 0;color:#6b7280;border-bottom:1px solid #f3f4f6">Last meeting</td>
          <td style="padding:10px 0;color:#111827;text-align:right;border-bottom:1px solid #f3f4f6">${esc(lastMeetingStr)}</td></tr>
      <tr><td style="padding:10px 0;color:#6b7280">Responsible</td>
          <td style="padding:10px 0;color:#111827;font-weight:600;text-align:right">${esc(p.responsiblePerson)}</td></tr>
      <tr><td style="padding:10px 0;color:#6b7280;border-top:1px solid #f3f4f6">Sales Coordinator</td>
          <td style="padding:10px 0;color:#111827;text-align:right;border-top:1px solid #f3f4f6">${esc(p.salesCoordinator)}</td></tr>
    </table>
  </td></tr>

  ${hasPerf ? `<!-- PERFORMANCE CARD -->
  <tr><td style="padding:20px 28px 0">
    <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.5px;text-transform:uppercase">
      FY 2026-27 Performance
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="33%" style="text-align:center;background:#f9fafb;border-radius:10px 0 0 10px;padding:14px 8px;border-right:1px solid #e5e7eb">
          <p style="margin:0;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:.5px;text-transform:uppercase">Target</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#111827;font-variant-numeric:tabular-nums">${(p.target ?? 0).toLocaleString("en-IN")}</p>
        </td>
        <td width="33%" style="text-align:center;background:#f9fafb;padding:14px 8px;border-right:1px solid #e5e7eb">
          <p style="margin:0;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:.5px;text-transform:uppercase">Actual</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#111827;font-variant-numeric:tabular-nums">${(p.actual ?? 0).toLocaleString("en-IN")}</p>
        </td>
        <td width="33%" style="text-align:center;background:${achBg};border-radius:0 10px 10px 0;padding:14px 8px">
          <p style="margin:0;font-size:10px;font-weight:700;color:${achColor};letter-spacing:.5px;text-transform:uppercase">Achievement</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:${achColor};font-variant-numeric:tabular-nums">${p.achievementPct ?? 0}%</p>
        </td>
      </tr>
    </table>
    <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;text-align:center">containers · target from 80/20 Buyers sheet · actual from PI Backend Master</p>
  </td></tr>` : ""}

  <!-- ACTION REQUIRED -->
  <tr><td style="padding:24px 28px 0">
    <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.5px;text-transform:uppercase">
      Action Required
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb">
      <tr><td style="padding:14px 18px">
        <ol style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:1.7">
          <li>Connect with <strong>${esc(p.buyerName)}</strong> on or before <strong>${dueDateStr}</strong></li>
          <li>Discuss requirements, pricing, samples, and next steps</li>
          <li>Log the meeting in the 80/20 tracker by clicking the button below</li>
        </ol>
      </td></tr>
    </table>
  </td></tr>

  <!-- CTA BUTTON -->
  <tr><td style="padding:24px 28px;text-align:center">
    <a href="${p.meetingId ? `${APP_BASE_URL}/8020/done/${encodeURIComponent(p.meetingId)}` : `${APP_BASE_URL}/8020`}" target="_blank" rel="noopener"
      style="display:inline-block;padding:14px 32px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;box-shadow:0 2px 8px rgba(22,163,74,.3)">
      ✓ Mark Meeting as Done
    </a>
    <p style="margin:12px 0 0;font-size:11px;color:#9ca3af">
      One click → fill the meeting outcome → done. (Made a mistake? Undo on the same screen.)
    </p>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #f3f4f6">
    <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;line-height:1.5">
      <strong style="color:#6b7280">Shazia Rice · 80/20 Key Account System</strong><br/>
      Auto-generated reminder · Sent on ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`

  return sendMail({ to, subject, html })
}
