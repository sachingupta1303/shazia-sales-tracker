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
  get8020Buyers, getPIRecords, getTargetRecords, filterPIByFY, sumContainersBy,
} from "./data"
import { getCurrentFY, getCurrentFYWeek, parsePIDate } from "./fy-utils"
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
  const fyPI = filterPIByFY(allPI, fy)

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

// ── HTML email renderer (table — same UI on laptop & mobile; mobile scrolls horizontally) ──
const STATUS_LABEL: Record<DailyStatus, string> = {
  CRITICAL: "Critical", ON_TRACK: "On Track", OVER_ACHIEVED: "Over Achieved", NO_TARGET: "No Target",
}
const STATUS_CLASS: Record<DailyStatus, string> = {
  CRITICAL: "crit", ON_TRACK: "ok", OVER_ACHIEVED: "over", NO_TARGET: "nt",
}
const TIER_CLASS: Record<string, string> = { TIER1: "t1", TIER2: "t2", TIER3: "t3", OTHERS: "to" }

const n0 = (v: number) => Math.round(v).toLocaleString("en-IN")
const n1 = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })

// Cap rows so the email stays under Gmail's ~102KB clip limit (sorted critical-first).
const MAX_EMAIL_ROWS = 150

const REPORT_STYLE = `
<style>
  .dbr-wrap{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;padding:12px}
  .dbr-card{max-width:1000px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0}
  .dbr-hd{background:#059669;padding:16px 20px}
  .dbr-hd h1{margin:0;color:#fff;font-size:17px}
  .dbr-hd p{margin:4px 0 0;color:rgba(255,255,255,.85);font-size:12px}
  .dbr-kpis{padding:14px 16px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:0}
  .dbr-kpi{display:inline-block;min-width:92px;vertical-align:top;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin:0 6px 6px 0}
  .dbr-kpi .l{font-size:9px;text-transform:uppercase;letter-spacing:.03em;color:#94a3b8;font-weight:700}
  .dbr-kpi .v{font-size:17px;font-weight:800;margin-top:1px}
  .dbr-note{padding:8px 16px;color:#64748b;font-size:11px;line-height:1.5}
  .dbr-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;padding:2px 12px 14px}
  .dbr-tbl{width:100%;border-collapse:collapse;font-size:12.5px;min-width:760px}
  .dbr-tbl th{background:#0f172a;color:#cbd5e1;font-size:9.5px;text-transform:uppercase;letter-spacing:.03em;padding:8px 7px;font-weight:700;text-align:left;white-space:nowrap}
  .dbr-tbl td{padding:7px 7px;border-bottom:1px solid #f1f5f9;color:#334155;white-space:nowrap}
  .dbr-tbl tr:nth-child(even) td{background:#f8fafc}
  .r{text-align:right}.c{text-align:center}
  .nm{font-weight:600;color:#0f172a;white-space:normal}
  .badge{font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px;white-space:nowrap}
  .crit{background:#fee2e2;color:#dc2626}.ok{background:#fef3c7;color:#d97706}.over{background:#d1fae5;color:#059669}.nt{background:#f3f4f6;color:#6b7280}
  .t1{background:#f3e8ff;color:#7c3aed}.t2{background:#dbeafe;color:#1d4ed8}.t3{background:#d1fae5;color:#059669}.to{background:#f3f4f6;color:#6b7280}
  .tc-crit{color:#dc2626}.tc-ok{color:#d97706}.tc-over{color:#059669}.tc-nt{color:#6b7280}
  .pill{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;white-space:nowrap}
  @media (max-width:600px){
    .dbr-tbl{font-size:11.5px;min-width:680px}
    .dbr-tbl th,.dbr-tbl td{padding:6px 5px}
    .dbr-kpi{min-width:84px}
  }
</style>`

function kpi(label: string, value: string, cls = ""): string {
  return `<div class="dbr-kpi"><div class="l">${label}</div><div class="v ${cls}">${value}</div></div>`
}

export function renderDailyReportHtml(report: DailyReport, dateLabel: string): string {
  const { rows, summary, fy, week, monthName } = report

  const shown     = rows.slice(0, MAX_EMAIL_ROWS)
  const remaining = rows.length - shown.length

  const rowsHtml = shown.map((r, i) => {
    const stCls   = STATUS_CLASS[r.status]
    const tierCls = TIER_CLASS[r.tier] ?? "to"
    const tierLbl = r.tier === "OTHERS" ? "Others" : r.tier.replace("TIER", "T")
    const pct     = r.tillNowPct === null ? "—" : `${r.tillNowPct}%`
    return `<tr>`
      + `<td class="c" style="color:#9ca3af">${i + 1}</td>`
      + `<td class="nm">${escapeHtml(r.buyerName)}</td>`
      + `<td>${escapeHtml(r.country)}</td>`
      + `<td class="c"><span class="badge ${tierCls}">${tierLbl}</span></td>`
      + `<td class="r">${n1(r.monthTarget)}</td>`
      + `<td class="r" style="font-weight:600;color:#0f172a">${n0(r.monthActual)}</td>`
      + `<td class="r">${n1(r.weekTarget)}</td>`
      + `<td class="r" style="font-weight:600;color:#0f172a">${n0(r.weekActual)}</td>`
      + `<td class="r" style="font-weight:700"><span class="tc-${stCls}">${pct}</span></td>`
      + `<td class="c"><span class="pill ${stCls}">${STATUS_LABEL[r.status]}</span></td>`
      + `<td class="r" style="font-weight:700;color:#0f172a">${n0(r.yearTarget)}</td>`
      + `</tr>`
  }).join("")

  const tillNowTarget = (summary.yearTarget / 52) * week
  const overallPct = tillNowTarget > 0 ? Math.round((summary.fytdActual / tillNowTarget) * 100) : 0
  const pctCls = overallPct >= 100 ? "tc-over" : overallPct >= 70 ? "tc-ok" : "tc-crit"
  const moreLink = `${APP_BASE_URL}/admin/daily-report`

  return `${REPORT_STYLE}
  <div class="dbr-wrap"><div class="dbr-card">
    <div class="dbr-hd">
      <h1>📊 Daily Buyer Performance Report</h1>
      <p>Shazia Rice · ${escapeHtml(dateLabel)} · ${escapeHtml(monthName)} · FY ${escapeHtml(fy)} · Till Week ${week}</p>
    </div>
    <div class="dbr-kpis">
      ${kpi("Year Target", n0(summary.yearTarget))}
      ${kpi("Till-now Target", n0(tillNowTarget), "tc-ok")}
      ${kpi("Actual (Till Now)", n0(summary.fytdActual), "tc-over")}
      ${kpi("Till-now %", `${overallPct}%`, pctCls)}
      ${kpi("🔴 Critical", String(summary.critical), "tc-crit")}
      ${kpi("🟠 On Track", String(summary.onTrack), "tc-ok")}
      ${kpi("🟢 Over Ach.", String(summary.overAchieved), "tc-over")}
    </div>
    <div class="dbr-note">Sort: <b>Critical first</b> → key accounts (T1→T2→T3→Others) → poorest %. Till-now % = Till Week actual ÷ Till Week target (pace). <i>Mobile: table side me scroll hoti hai.</i></div>
    <div class="dbr-scroll">
      <table class="dbr-tbl">
        <thead><tr>
          <th class="c">#</th><th>Buyer</th><th>Country</th><th class="c">Tier</th>
          <th class="r">Month Tgt</th><th class="r">Month Act</th>
          <th class="r">Till Week Tgt</th><th class="r">Till Week Act</th>
          <th class="r">Till-now %</th><th class="c">Status</th><th class="r">Year Tgt</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    ${remaining > 0 ? `<div style="padding:0 16px 14px;color:#64748b;font-size:12px">+ ${remaining} more buyers — <a href="${moreLink}" style="color:#059669;font-weight:700">open full report in app</a></div>` : ""}
    <div style="padding:12px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:10.5px">Auto-generated by Shazia Rice Sales Tracker · ${escapeHtml(dateLabel)}</div>
  </div></div>`
}

function escapeHtml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
