/**
 * Daily Buyer Performance Report builder + HTML email renderer.
 *
 * Per-buyer row: Buyer · Country · Tier · Month (Target/Actual) ·
 *                Till Week (Target/Actual) · Till-now % · Status · Year Target
 *
 * Sort (director view — worst first, key accounts prioritised):
 *   1. Status:  CRITICAL → ON_TRACK → OVER_ACHIEVED → NO_TARGET
 *   2. Tier:    TIER1 → TIER2 → TIER3 → OTHERS  (key accounts first)
 *   3. Poorest Till-now % first, tie-break by Till-week actual desc
 *
 * Containers are counted once per PI (PI-level), via sumContainersBy.
 * Status is pace-adjusted: Till-now % = Till-week actual ÷ Till-week target.
 */

import {
  get8020Buyers, getPIRecords, getTargetRecords, sumContainersBy,
} from "./data"
import { getCurrentFY, getCurrentFYWeek, parsePIDate, isInFY } from "./fy-utils"
import { APP_BASE_URL } from "./mailer"

export type DailyStatus = "CRITICAL" | "ON_TRACK" | "OVER_ACHIEVED" | "NO_TARGET"

export interface DailyBuyerRow {
  buyerName:   string
  country:     string
  tier:        "TIER1" | "TIER2" | "TIER3" | "OTHERS"
  yearTarget:  number
  monthTarget: number
  monthActual: number
  weekTarget:  number   // pace target till current FY week
  weekActual:  number   // FYTD actual
  tillNowPct:  number | null
  status:      DailyStatus
}

export interface DailyReport {
  fy:        string
  week:      number
  fyMonth:   number
  monthName: string
  rows:      DailyBuyerRow[]
  summary: {
    yearTarget:    number
    fytdActual:    number
    monthActual:   number
    critical:      number
    onTrack:       number
    overAchieved:  number
    noTarget:      number
    totalBuyers:   number
  }
}

const TIER_RANK:   Record<string, number> = { TIER1: 0, TIER2: 1, TIER3: 2, OTHERS: 3 }
const STATUS_RANK: Record<DailyStatus, number> = { CRITICAL: 0, ON_TRACK: 1, OVER_ACHIEVED: 2, NO_TARGET: 3 }
const FY_MONTH_NAMES = ["", "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March"]

const norm = (s: string) => s.toLowerCase().trim()
function currentFYMonth(): number {
  const m = new Date().getMonth()       // 0=Jan
  return ((m - 3 + 12) % 12) + 1        // April=1 … March=12
}

export async function buildDailyBuyerReport(): Promise<DailyReport> {
  const fy      = getCurrentFY()
  const week    = getCurrentFYWeek()
  const fyMonth = currentFYMonth()

  const [buyers, allPI, targets] = await Promise.all([
    get8020Buyers(), getPIRecords(), getTargetRecords(fy),
  ])
  // Use the SAME FY filter as Live Data (by PI date), so totals stay in sync.
  const fyPI = allPI.filter((r) => isInFY(parsePIDate(r.piDate), fy))

  // Current-month PI: prefer fyMonthNo, else derive from piDate
  const monthPI = fyPI.filter((r) => {
    if (r.fyMonthNo > 0) return r.fyMonthNo === fyMonth
    const d = parsePIDate(r.piDate)
    if (isNaN(d.getTime())) return false
    return ((d.getMonth() - 3 + 12) % 12) + 1 === fyMonth
  })

  // Actuals by buyer name (containers counted once per PI)
  const fytdActualByName  = sumContainersBy(fyPI,    (r) => norm(r.buyerCompanyName))
  const monthActualByName = sumContainersBy(monthPI, (r) => norm(r.buyerCompanyName))

  // Buyer universe: 80/20 (tier + target) → TARGET_MASTER → PI (others with orders)
  type U = { name: string; country: string; tier: DailyBuyerRow["tier"]; yearTarget: number }
  const map = new Map<string, U>()

  for (const b of buyers) {
    map.set(norm(b.buyerName), {
      name: b.buyerName, country: b.country,
      tier: b.tier, yearTarget: b.annualTarget,
    })
  }
  for (const t of targets) {
    const k = norm(t.buyerCompanyName)
    const ex = map.get(k)
    if (!ex) {
      map.set(k, { name: t.buyerCompanyName, country: t.countries, tier: "OTHERS", yearTarget: t.currentYearTargetContainers })
    } else if (!ex.yearTarget) {
      ex.yearTarget = t.currentYearTargetContainers
    }
  }
  for (const r of fyPI) {
    const k = norm(r.buyerCompanyName)
    if (!map.has(k)) map.set(k, { name: r.buyerCompanyName, country: r.countries, tier: "OTHERS", yearTarget: 0 })
  }

  let rows: DailyBuyerRow[] = [...map.entries()].map(([k, b]) => {
    const yearTarget  = b.yearTarget
    const monthTarget = yearTarget / 12
    const weekTarget  = (yearTarget / 52) * week
    const monthActual = monthActualByName.get(k) ?? 0
    const weekActual  = fytdActualByName.get(k) ?? 0

    let status: DailyStatus
    let tillNowPct: number | null
    if (yearTarget <= 0) {
      status = "NO_TARGET"; tillNowPct = null
    } else {
      tillNowPct = weekTarget > 0 ? Math.round((weekActual / weekTarget) * 100) : (weekActual > 0 ? 100 : 0)
      status = tillNowPct >= 100 ? "OVER_ACHIEVED" : tillNowPct >= 70 ? "ON_TRACK" : "CRITICAL"
    }
    return {
      buyerName: b.name, country: b.country, tier: b.tier,
      yearTarget, monthTarget, monthActual, weekTarget, weekActual, tillNowPct, status,
    }
  }).filter((r) => r.yearTarget > 0 || r.weekActual > 0)

  rows.sort((a, b) =>
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    TIER_RANK[a.tier]     - TIER_RANK[b.tier] ||
    (a.tillNowPct ?? 9999) - (b.tillNowPct ?? 9999) ||
    b.weekActual - a.weekActual
  )

  const summary = {
    yearTarget:   rows.reduce((s, r) => s + r.yearTarget, 0),
    fytdActual:   rows.reduce((s, r) => s + r.weekActual, 0),
    monthActual:  rows.reduce((s, r) => s + r.monthActual, 0),
    critical:     rows.filter((r) => r.status === "CRITICAL").length,
    onTrack:      rows.filter((r) => r.status === "ON_TRACK").length,
    overAchieved: rows.filter((r) => r.status === "OVER_ACHIEVED").length,
    noTarget:     rows.filter((r) => r.status === "NO_TARGET").length,
    totalBuyers:  rows.length,
  }

  return { fy, week, fyMonth, monthName: FY_MONTH_NAMES[fyMonth] ?? "", rows, summary }
}

// ── HTML email renderer (inline styles — Gmail-safe; capped rows; mobile h-scroll) ──
const STATUS_LABEL: Record<DailyStatus, string> = {
  CRITICAL: "Critical", ON_TRACK: "On Track", OVER_ACHIEVED: "Over Achieved", NO_TARGET: "No Target",
}
const STATUS_COLOR: Record<DailyStatus, { bg: string; fg: string }> = {
  CRITICAL:      { bg: "#fee2e2", fg: "#dc2626" },
  ON_TRACK:      { bg: "#fef3c7", fg: "#d97706" },
  OVER_ACHIEVED: { bg: "#d1fae5", fg: "#059669" },
  NO_TARGET:     { bg: "#f3f4f6", fg: "#6b7280" },
}
const TIER_COLOR: Record<string, { bg: string; fg: string }> = {
  TIER1: { bg: "#f3e8ff", fg: "#7c3aed" },
  TIER2: { bg: "#dbeafe", fg: "#1d4ed8" },
  TIER3: { bg: "#d1fae5", fg: "#059669" },
  OTHERS:{ bg: "#f3f4f6", fg: "#6b7280" },
}
const n0 = (v: number) => Math.round(v).toLocaleString("en-IN")
const n1 = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })

// Cap rows so the email stays under Gmail's ~102KB clip limit (sorted critical-first).
const MAX_EMAIL_ROWS = 120

export function renderDailyReportHtml(report: DailyReport, dateLabel: string): string {
  const { rows, summary, fy, week, monthName } = report

  const shown     = rows.slice(0, MAX_EMAIL_ROWS)
  const remaining = rows.length - shown.length

  const rowsHtml = shown.map((r, i) => {
    const sc = STATUS_COLOR[r.status]
    const tc = TIER_COLOR[r.tier] ?? TIER_COLOR.OTHERS
    const tierLabel = r.tier === "OTHERS" ? "Others" : r.tier.replace("TIER", "T")
    const pct = r.tillNowPct === null ? "—" : `${r.tillNowPct}%`
    const p = "padding:7px 8px"
    return `<tr style="background:${i % 2 ? "#f8fafc" : "#fff"}">`
      + `<td align="center" style="${p};color:#9ca3af;font-size:11px">${i + 1}</td>`
      + `<td style="${p};font-weight:600;color:#0f172a">${escapeHtml(r.buyerName)}</td>`
      + `<td style="${p};color:#475569">${escapeHtml(r.country)}</td>`
      + `<td align="center" style="${p}"><span style="background:${tc.bg};color:${tc.fg};font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px">${tierLabel}</span></td>`
      + `<td align="right" style="${p};color:#475569">${n1(r.monthTarget)}</td>`
      + `<td align="right" style="${p};font-weight:600;color:#0f172a">${n0(r.monthActual)}</td>`
      + `<td align="right" style="${p};color:#475569">${n1(r.weekTarget)}</td>`
      + `<td align="right" style="${p};font-weight:600;color:#0f172a">${n0(r.weekActual)}</td>`
      + `<td align="right" style="${p};font-weight:700;color:${sc.fg}">${pct}</td>`
      + `<td align="center" style="${p}"><span style="background:${sc.bg};color:${sc.fg};font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap">${STATUS_LABEL[r.status]}</span></td>`
      + `<td align="right" style="${p};font-weight:700;color:#0f172a">${n0(r.yearTarget)}</td>`
      + `</tr>`
  }).join("")

  const th = (label: string, align = "left") =>
    `<th align="${align}" style="padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#cbd5e1;font-weight:700;white-space:nowrap">${label}</th>`

  const tillNowTarget = (summary.yearTarget / 52) * week
  const overallPct = tillNowTarget > 0 ? Math.round((summary.fytdActual / tillNowTarget) * 100) : 0
  const moreLink = `${APP_BASE_URL}/admin/daily-report`

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;padding:18px">
    <div style="max-width:980px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:linear-gradient(135deg,#059669,#047857);padding:18px 22px">
        <h1 style="margin:0;color:#fff;font-size:18px">📊 Daily Buyer Performance Report</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:12px">Shazia Rice · ${escapeHtml(dateLabel)} · ${escapeHtml(monthName)} · FY ${escapeHtml(fy)} · Till Week ${week}</p>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:10px;padding:16px 22px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
        ${summaryCard("Year Target", n0(summary.yearTarget), "#0f172a")}
        ${summaryCard("Till-now Target", n0(tillNowTarget), "#1d4ed8")}
        ${summaryCard("Actual (Till Now)", n0(summary.fytdActual), "#059669")}
        ${summaryCard("Till-now %", `${overallPct}%`, overallPct >= 100 ? "#059669" : overallPct >= 70 ? "#d97706" : "#dc2626")}
        ${summaryCard("🔴 Critical", String(summary.critical), "#dc2626")}
        ${summaryCard("🟠 On Track", String(summary.onTrack), "#d97706")}
        ${summaryCard("🟢 Over Ach.", String(summary.overAchieved), "#059669")}
      </div>

      <div style="padding:6px 22px 4px;color:#64748b;font-size:11px">
        Sort: <b>Critical first</b> → key accounts (T1→T2→T3→Others) → poorest %. Till-now % = Till Week actual ÷ Till Week target (pace).
      </div>

      <div style="padding:8px 16px 16px;overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:760px">
          <thead>
            <tr style="background:#0f172a">
              ${th("#", "center")}${th("Buyer")}${th("Country")}${th("Tier", "center")}
              ${th("Month Tgt", "right")}${th("Month Act", "right")}
              ${th("Till Week Tgt", "right")}${th("Till Week Act", "right")}
              ${th("Till-now %", "right")}${th("Status", "center")}${th("Year Tgt", "right")}
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>

      ${remaining > 0 ? `<div style="padding:0 22px 14px;color:#64748b;font-size:12px">+ ${remaining} more buyers — <a href="${moreLink}" style="color:#059669;font-weight:700">open full report in app</a></div>` : ""}

      <div style="padding:12px 22px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:10.5px">
        Auto-generated by Shazia Rice Sales Tracker · ${escapeHtml(dateLabel)}
      </div>
    </div>
  </div>`
}

function summaryCard(label: string, value: string, color: string): string {
  return `<div style="flex:1;min-width:110px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:700">${label}</div>
    <div style="font-size:20px;font-weight:800;color:${color};margin-top:2px">${value}</div>
  </div>`
}

function escapeHtml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
