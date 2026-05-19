/**
 * 80/20 Key Account — Consolidated meeting reminder emails.
 *
 * One email per person per day:
 *   • Responsible Person  → list of ALL their buyers due/overdue
 *   • Sales Coordinator   → list of ALL meetings they coordinate (with Responsible Person column)
 */
import { sendMail, esc } from "./mailer"
import { TIER_LABEL } from "./8020-utils"

export interface ConsolidatedMeetingRow {
  meetingId:         string
  buyerName:         string
  country:           string
  tier:              string
  responsiblePerson: string
  nextDueDate:       string   // ISO date string YYYY-MM-DD
  daysRemaining:     number
  displayStatus:     "OVERDUE" | "DUE_SOON"
  doneUrl?:          string   // magic link for Done button
  rescheduleUrl?:    string   // magic link for Reschedule button
}

export async function sendConsolidatedEmail(params: {
  personName:  string
  personEmail: string
  role:        "responsible" | "coordinator"
  meetings:    ConsolidatedMeetingRow[]
}): Promise<{ ok: boolean; reason?: string }> {
  const { personName, personEmail, role, meetings } = params
  if (!personEmail) return { ok: false, reason: "no_email" }
  if (!meetings.length) return { ok: false, reason: "no_meetings" }

  const isCoord = role === "coordinator"
  const count   = meetings.length

  const overdues = meetings
    .filter(m => m.displayStatus === "OVERDUE")
    .sort((a, b) => a.daysRemaining - b.daysRemaining)   // most negative first
  const dueSoons = meetings
    .filter(m => m.displayStatus === "DUE_SOON")
    .sort((a, b) => a.daysRemaining - b.daysRemaining)   // soonest first

  const subject = isCoord
    ? `📋 ${count} Meeting${count > 1 ? "s" : ""} to Schedule — ${personName}`
    : `📋 ${count} Meeting Reminder${count > 1 ? "s" : ""} — ${personName}`

  // ── Row builder ──────────────────────────────────────────────────────────────
  function buildRow(m: ConsolidatedMeetingRow): string {
    const isOver      = m.displayStatus === "OVERDUE"
    const statusColor = isOver ? "#dc2626" : "#d97706"
    const statusBg    = isOver ? "#fee2e2" : "#fef3c7"
    const absDays     = Math.abs(m.daysRemaining)
    const statusText  = isOver
      ? `Overdue ${absDays} day${absDays === 1 ? "" : "s"}`
      : `Due in ${m.daysRemaining} day${m.daysRemaining === 1 ? "" : "s"}`

    const tierLabel  = TIER_LABEL[m.tier] ?? m.tier
    const tierColor  = m.tier === "TIER1" ? "#7c3aed" : m.tier === "TIER2" ? "#1d4ed8" : "#374151"
    const tierBg     = m.tier === "TIER1" ? "#f3e8ff" : m.tier === "TIER2" ? "#dbeafe" : "#f3f4f6"

    const dueDateStr = (() => {
      try {
        return new Date(m.nextDueDate + "T00:00:00").toLocaleDateString("en-IN", {
          day: "numeric", month: "short", year: "numeric",
        })
      } catch { return m.nextDueDate }
    })()

    const respCell = `<td style="padding:10px 10px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;white-space:nowrap">${esc(m.responsiblePerson || "—")}</td>`

    const BTN = `display:inline-block;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:700;white-space:nowrap;text-decoration:none;line-height:1.5;`

    const doneBtn = m.doneUrl
      ? `<a href="${esc(m.doneUrl)}" target="_blank" rel="noopener"
             style="${BTN}background:#16a34a;color:#fff;">✓ Done</a>`
      : `<span style="color:#9ca3af;font-size:12px">—</span>`

    const rescheduleBtn = m.rescheduleUrl
      ? `<a href="${esc(m.rescheduleUrl)}" target="_blank" rel="noopener"
             style="${BTN}background:#ea580c;color:#fff;">📅 Reschedule</a>`
      : ""

    const doneCell = `<td style="padding:8px 14px;text-align:center;border-bottom:1px solid #f3f4f6;vertical-align:middle">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
          <tr>
            <td style="padding-right:6px">${doneBtn}</td>
            <td>${rescheduleBtn}</td>
          </tr>
        </table>
      </td>`

    return `
      <tr>
        <td style="padding:12px 14px;font-size:13px;font-weight:600;color:#111827;border-bottom:1px solid #f3f4f6;min-width:200px;max-width:260px;line-height:1.4;word-break:break-word">${esc(m.buyerName)}</td>
        <td style="padding:10px 10px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;white-space:nowrap">${esc(m.country)}</td>
        <td style="padding:10px 8px;text-align:center;border-bottom:1px solid #f3f4f6">
          <span style="background:${tierBg};color:${tierColor};padding:3px 8px;border-radius:5px;font-size:11px;font-weight:700;white-space:nowrap">${esc(tierLabel)}</span>
        </td>
        ${respCell}
        <td style="padding:10px 10px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;white-space:nowrap">${dueDateStr}</td>
        <td style="padding:10px 10px;border-bottom:1px solid #f3f4f6">
          <span style="background:${statusBg};color:${statusColor};padding:3px 10px;border-radius:5px;font-size:11px;font-weight:700;white-space:nowrap">${statusText}</span>
        </td>
        ${doneCell}
      </tr>`
  }

  // ── Section builder ───────────────────────────────────────────────────────────
  function buildSection(emoji: string, title: string, borderColor: string, bg: string, rows: ConsolidatedMeetingRow[]): string {
    if (!rows.length) return ""

    const respHeader = `<th style="padding:9px 10px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;background:#f9fafb;white-space:nowrap">Responsible</th>`

    return `
    <tr><td style="padding:20px 28px 0">
      <div style="background:${bg};border-left:4px solid ${borderColor};padding:10px 16px;border-radius:0 8px 8px 0;margin-bottom:14px">
        <p style="margin:0;font-size:13px;font-weight:700;color:${borderColor}">${emoji} ${title}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:auto">
          <thead>
            <tr>
              <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;background:#f9fafb;min-width:200px">Buyer</th>
              <th style="padding:9px 10px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;background:#f9fafb;white-space:nowrap">Country</th>
              <th style="padding:9px 8px;text-align:center;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;background:#f9fafb">Tier</th>
              ${respHeader}
              <th style="padding:9px 10px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;background:#f9fafb;white-space:nowrap">Due Date</th>
              <th style="padding:9px 10px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;background:#f9fafb">Status</th>
              <th style="padding:9px 12px;text-align:center;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;background:#f9fafb">Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(buildRow).join("")}
          </tbody>
        </table>
      </div>
    </td></tr>`
  }

  // ── Full HTML ─────────────────────────────────────────────────────────────────
  // Responsible Person → yellow/amber header; Coordinator → blue header
  const headerBg   = isCoord ? "#1d4ed8" : "#ca8a04"
  const headerRole = isCoord ? "Coordinator Alert" : "Sales Reminder"
  const headerMsg  = isCoord
    ? `you have ${count} meeting${count > 1 ? "s" : ""} to schedule`
    : `you have ${count} meeting${count > 1 ? "s" : ""} coming up`

  const noteBox = `<tr><td style="padding:16px 28px 0">
       <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px">
         <p style="margin:0;font-size:13px;color:#166534;line-height:1.6">
           <strong>✓ Done:</strong> Meeting completed? Click <strong>✓ Done</strong>, add remarks and save.<br>
           <strong>📅 Reschedule:</strong> Need to push the date? Click <strong>📅 Reschedule</strong>, pick a new date and confirm. No login required.
         </p>
       </div>
     </td></tr>`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
  style="max-width:760px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">

  <!-- HEADER -->
  <tr><td style="background:${headerBg};padding:24px 28px">
    <p style="margin:0;color:rgba(255,255,255,.65);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">
      Shazia Rice · 80/20 Key Account System · ${headerRole}
    </p>
    <h1 style="margin:8px 0 4px;color:#ffffff;font-size:20px;font-weight:700;line-height:1.3">
      Hi ${esc(personName)}, ${headerMsg}
    </h1>
    <p style="margin:0;color:rgba(255,255,255,.65);font-size:13px">
      ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
    </p>
  </td></tr>

  ${buildSection("🔴", "OVERDUE — Immediate Action Required", "#dc2626", "#fef2f2", overdues)}
  ${buildSection("🟡", "DUE SOON — Within 5 Days", "#d97706", "#fffbeb", dueSoons)}

  ${noteBox}

  <!-- FOOTER -->
  <tr><td style="padding:24px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;margin-top:24px">
    <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;line-height:1.6">
      <strong style="color:#6b7280">Shazia Rice · 80/20 Key Account System</strong><br>
      Auto-generated · ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`

  return sendMail({ to: [personEmail], subject, html })
}
