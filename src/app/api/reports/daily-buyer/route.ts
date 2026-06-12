/**
 * Daily Buyer Performance Report.
 *
 * GET /api/reports/daily-buyer                 → JSON (rows + summary)
 * GET /api/reports/daily-buyer?format=html     → full HTML (preview in browser)
 * GET /api/reports/daily-buyer?send=1           → emails the report to the logged-in user
 * GET /api/reports/daily-buyer?send=1&to=x@y    → emails to a specific address
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { buildDailyBuyerReport, renderDailyReportHtml } from "@/lib/daily-report"
import { sendMail } from "@/lib/mailer"
import type { AppUser } from "@/types"

function canView(user: AppUser) {
  return user.role === "MANAGER" || user.role === "DIRECTOR"
    || user.role === "SUPER_ADMIN" || user.role === "ADMIN"
}

function todayLabelIST(): string {
  return new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
  })
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!canView(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url    = new URL(req.url)
  const format = url.searchParams.get("format")
  const send   = url.searchParams.get("send")
  const to     = url.searchParams.get("to") || session.user.email || ""

  const report    = await buildDailyBuyerReport()
  const dateLabel = todayLabelIST()

  // ── Send email ──
  if (send === "1") {
    if (!to) return NextResponse.json({ error: "no recipient (no ?to= and no login email)" }, { status: 400 })
    const html   = renderDailyReportHtml(report, dateLabel)
    const result = await sendMail({
      to,
      subject: `📊 Daily Buyer Report — ${dateLabel} · ${report.summary.critical} critical`,
      html,
    })
    return NextResponse.json({
      ok: result.ok, sentTo: to, reason: result.reason,
      buyers: report.summary.totalBuyers, critical: report.summary.critical,
    })
  }

  // ── HTML preview ──
  if (format === "html") {
    return new Response(renderDailyReportHtml(report, dateLabel), {
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  }

  // ── JSON ──
  return NextResponse.json(report)
}
