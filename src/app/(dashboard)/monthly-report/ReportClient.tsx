"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts"

// ── Types ─────────────────────────────────────────────────────────────────────
interface MonthlyReportData {
  fy: string
  fyMonthNo: number
  monthName: string
  calendarMonthYear: string
  generatedAt: string
  summary: {
    totalContainers: number
    totalMTs: number
    totalAmount: number
    totalMonthlyTarget: number
    achievementPct: number
    uniqueBuyers: number
    piCount: number
    activeCountries: number
    activeSalesPersons: number
  }
  varietyBreakdown: Array<{
    variety: string; containers: number; mts: number; amount: number; containersPct: number
  }>
  countryBreakdown: Array<{
    country: string; containers: number; mts: number; amount: number; buyerCount: number; pct: number
  }>
  salesPersonBreakdown: Array<{
    salesPerson: string; containers: number; mts: number; amount: number
    monthlyTarget: number; achievementPct: number; buyerCount: number
  }>
  buyerBreakdown: Array<{
    buyerName: string; country: string; tier: string; responsiblePerson: string
    containers: number; mts: number; amount: number; monthlyTarget: number
    achievementPct: number; isIn8020: boolean
  }>
  meetingsSummary: {
    totalDone: number
    byTier: { TIER1: number; TIER2: number; TIER3: number; total: number }
    meetings: Array<{
      buyerName: string; country: string; tier: string
      meetingDate: string; completedBy: string; outcome: string; notes: string
    }>
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const FY_MONTHS = [
  { no: 1, name: "April"    }, { no: 2,  name: "May"      },
  { no: 3, name: "June"     }, { no: 4,  name: "July"     },
  { no: 5, name: "August"   }, { no: 6,  name: "September"},
  { no: 7, name: "October"  }, { no: 8,  name: "November" },
  { no: 9, name: "December" }, { no: 10, name: "January"  },
  { no: 11, name: "February"}, { no: 12, name: "March"    },
]

const PIE_COLORS = ["#16a34a", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed"]

const OUTCOME_LABEL: Record<string, string> = {
  ORDER_CONFIRMED: "Order Confirmed", NEGOTIATING: "Negotiating",
  AWAITING_PI: "Awaiting PI",        FOLLOW_UP: "Follow-up",
  NO_INTEREST: "No Interest",        OTHER: "Other",
}

function getCurrentFY(): string {
  const today = new Date()
  const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  return `${year}-${String(year + 1).slice(-2)}`
}
function getCurrentFYMonth(): number {
  return ((new Date().getMonth() - 3 + 12) % 12) + 1
}
function generateFYList(): string[] {
  const fy = getCurrentFY()
  const y = parseInt(fy.split("-")[0])
  return [`${y-2}-${String(y-1).slice(-2)}`, `${y-1}-${String(y).slice(-2)}`, fy]
}
function fmt(n: number, d = 0) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n/1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

// ── PDF Generator (jsPDF) ─────────────────────────────────────────────────────
async function generatePDF(data: MonthlyReportData) {
  const { default: jsPDF } = await import("jspdf")
  const { default: autoTable } = await import("jspdf-autotable")

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const W = 210  // A4 width mm
  let y = 0

  // ── Brand header bar ─────────────────────────────────────────────────────────
  doc.setFillColor(22, 163, 74)   // green-600
  doc.rect(0, 0, W, 28, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.text("SHAZIA RICE EXPORT  ·  CONFIDENTIAL  ·  INTERNAL USE ONLY", 14, 8)
  doc.setFontSize(16)
  doc.text("Monthly MIS Report", 14, 17)
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(`${data.calendarMonthYear}   |   FY ${data.fy}`, 14, 24)
  // Generated date (right side)
  doc.setFontSize(7)
  const genDate = new Date(data.generatedAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
  doc.text(`Generated: ${genDate} IST`, W - 14, 24, { align: "right" })

  y = 34

  // ── Section label helper ──────────────────────────────────────────────────────
  function sectionLabel(title: string) {
    doc.setFillColor(243, 244, 246)  // gray-100
    doc.rect(14, y, W - 28, 6, "F")
    doc.setTextColor(55, 65, 81)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.text(title.toUpperCase(), 16, y + 4)
    y += 8
    doc.setTextColor(0, 0, 0)
    doc.setFont("helvetica", "normal")
  }

  // ── Executive Summary ─────────────────────────────────────────────────────────
  sectionLabel("Executive Summary")

  const s = data.summary
  const pct = s.achievementPct
  const kpis = [
    ["Containers", fmt(s.totalContainers, 1)],
    ["Monthly Target", fmt(s.totalMonthlyTarget, 1)],
    ["Achievement", `${pct}%`],
    ["Revenue", fmtUSD(s.totalAmount)],
    ["Active Markets", String(s.activeCountries)],
  ]
  const boxW = (W - 28 - 8) / 5
  kpis.forEach(([label, value], i) => {
    const x = 14 + i * (boxW + 2)
    // box bg — green tint for achievement if >= 100
    const isAchiev = i === 2
    doc.setFillColor(isAchiev && pct >= 100 ? 220 : 248, isAchiev && pct >= 100 ? 252 : 250, isAchiev && pct >= 100 ? 231 : 252)
    doc.roundedRect(x, y, boxW, 14, 2, 2, "F")
    doc.setTextColor(107, 114, 128)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6)
    doc.text(label, x + boxW / 2, y + 4, { align: "center" })
    doc.setFont("helvetica", "bold")
    doc.setFontSize(isAchiev ? 11 : 10)
    doc.setTextColor(isAchiev && pct >= 100 ? 22 : 17, isAchiev && pct >= 100 ? 101 : 24, isAchiev && pct >= 100 ? 52 : 39)
    doc.text(value, x + boxW / 2, y + 10, { align: "center" })
  })
  y += 17

  // Achievement bar
  doc.setFontSize(7)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(107, 114, 128)
  doc.text(`Orders: ${s.piCount}   Buyers: ${s.uniqueBuyers}   Sales Persons: ${s.activeSalesPersons}`, 14, y + 2)
  y += 5
  // progress bar
  doc.setFillColor(229, 231, 235)
  doc.roundedRect(14, y, W - 28, 4, 1, 1, "F")
  const barW = Math.min(pct, 100) / 100 * (W - 28)
  const [br, bg, bb] = pct >= 100 ? [22,163,74] : pct >= 75 ? [217,119,6] : pct >= 50 ? [234,88,12] : [220,38,38]
  doc.setFillColor(br, bg, bb)
  doc.roundedRect(14, y, barW, 4, 1, 1, "F")
  y += 8

  // ── Variety Breakdown ─────────────────────────────────────────────────────────
  if (data.varietyBreakdown.length) {
    sectionLabel("Variety Breakdown")
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [["Variety", "Containers", "Metric Tonnes", "Revenue", "Share %"]],
      body: data.varietyBreakdown.map((v) => [
        v.variety,
        fmt(v.containers, 1),
        fmt(v.mts, 1),
        fmtUSD(v.amount),
        `${v.containersPct}%`,
      ]),
      headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: "bold", fontSize: 7 },
      bodyStyles:  { fontSize: 7.5 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    })
    y = (doc as any).lastAutoTable.finalY + 5
  }

  // ── Top Countries ─────────────────────────────────────────────────────────────
  const topCountries = data.countryBreakdown.slice(0, 10)
  if (topCountries.length) {
    sectionLabel(`Country Performance  (Top ${topCountries.length} of ${data.countryBreakdown.length})`)
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [["#", "Country", "Containers", "Metric Tonnes", "Revenue", "Buyers", "Share %"]],
      body: topCountries.map((c, i) => [
        i + 1,
        c.country,
        fmt(c.containers, 1),
        fmt(c.mts, 1),
        fmtUSD(c.amount),
        c.buyerCount,
        `${c.pct}%`,
      ]),
      headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: "bold", fontSize: 7 },
      bodyStyles:  { fontSize: 7 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        2: { halign: "right" }, 3: { halign: "right" },
        4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
      },
    })
    y = (doc as any).lastAutoTable.finalY + 5
  }

  // ── New page if needed ────────────────────────────────────────────────────────
  if (y > 230) { doc.addPage(); y = 14 }

  // ── Sales Person Performance ──────────────────────────────────────────────────
  if (data.salesPersonBreakdown.length) {
    sectionLabel("Sales Person Performance")
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [["Sales Person", "Containers", "Metric Tonnes", "Revenue", "Monthly Target", "Achievement %", "Buyers"]],
      body: data.salesPersonBreakdown.map((sp) => [
        sp.salesPerson,
        fmt(sp.containers, 1),
        fmt(sp.mts, 1),
        fmtUSD(sp.amount),
        sp.monthlyTarget > 0 ? fmt(sp.monthlyTarget, 1) : "—",
        sp.monthlyTarget > 0 ? `${sp.achievementPct}%` : "—",
        sp.buyerCount,
      ]),
      headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: "bold", fontSize: 7 },
      bodyStyles:  { fontSize: 7 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        1: { halign: "right" }, 2: { halign: "right" },
        3: { halign: "right" }, 4: { halign: "right" },
        5: { halign: "right", fontStyle: "bold" }, 6: { halign: "right" },
      },
    })
    y = (doc as any).lastAutoTable.finalY + 5
  }

  // ── Meetings Done ─────────────────────────────────────────────────────────────
  const m = data.meetingsSummary
  sectionLabel(`Meetings Done — ${data.calendarMonthYear}`)
  // summary row
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(55, 65, 81)
  doc.text(
    `Total: ${m.totalDone}   |   Tier 1: ${m.byTier.TIER1}   |   Tier 2: ${m.byTier.TIER2}   |   Tier 3: ${m.byTier.TIER3}`,
    14, y + 3
  )
  y += 7

  if (m.meetings.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [["Buyer", "Country", "Tier", "Meeting Date", "Completed By", "Outcome", "Notes"]],
      body: m.meetings.map((mt) => [
        mt.buyerName,
        mt.country,
        mt.tier,
        (() => {
          try { return new Date(mt.meetingDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) }
          catch { return mt.meetingDate }
        })(),
        mt.completedBy,
        OUTCOME_LABEL[mt.outcome] ?? mt.outcome,
        mt.notes || "—",
      ]),
      headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: "bold", fontSize: 7 },
      bodyStyles:  { fontSize: 6.5 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: { 6: { cellWidth: 40 } },
    })
    y = (doc as any).lastAutoTable.finalY + 5
  } else {
    doc.setFontSize(7.5)
    doc.setTextColor(156, 163, 175)
    doc.text("No meetings recorded for this period.", 14, y + 3)
    y += 8
  }

  // ── Footer on every page ──────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFillColor(249, 250, 251)
    doc.rect(0, 285, W, 12, "F")
    doc.setTextColor(156, 163, 175)
    doc.setFontSize(6.5)
    doc.setFont("helvetica", "normal")
    doc.text("Shazia Rice Export · Monthly MIS Report · Confidential", 14, 291)
    doc.text(`Page ${i} of ${pageCount}   |   ${data.calendarMonthYear} · FY ${data.fy}`, W - 14, 291, { align: "right" })
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  const filename = `MIS-Report-${data.calendarMonthYear.replace(/\s+/g, "-")}-FY${data.fy}.pdf`
  doc.save(filename)
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${accent ? "bg-green-50 border-green-200" : "bg-white border-gray-200"}`}>
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${accent ? "text-green-700" : "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ReportClient({ userRole }: { userRole: string }) {
  const fyList = generateFYList()
  const [fy,      setFY]      = useState(() => getCurrentFY())
  const [month,   setMonth]   = useState(() => getCurrentFYMonth())
  const [data,    setData]    = useState<MonthlyReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const fetchReport = useCallback(async (selFY: string, selMonth: number) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/monthly-report?fy=${selFY}&month=${selMonth}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e: any) {
      setError(e.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReport(fy, month) }, [fy, month, fetchReport])

  const handleDownload = async () => {
    if (!data) return
    setPdfLoading(true)
    try { await generatePDF(data) }
    catch (e) { console.error("PDF error:", e) }
    finally { setPdfLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Sticky toolbar ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-900">Monthly MIS Report</h1>
          {data && !loading && (
            <p className="text-xs text-gray-400 mt-0.5">{data.calendarMonthYear} · FY {data.fy}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select value={fy} onChange={(e) => setFY(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
            {fyList.map((f) => <option key={f} value={f}>FY {f}</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
            {FY_MONTHS.map((m) => <option key={m.no} value={m.no}>{m.name}</option>)}
          </select>
          <button
            onClick={handleDownload}
            disabled={!data || loading || pdfLoading}
            className="flex items-center gap-2 px-4 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {pdfLoading ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating…</>
            ) : (
              <>⬇ Download PDF</>
            )}
          </button>
        </div>
      </div>

      {/* ── States ─────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-400">Loading report…</p>
          </div>
        </div>
      )}
      {error && (
        <div className="m-6 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">⚠️ {error}</div>
      )}

      {/* ── Report ─────────────────────────────────────────────────────────── */}
      {!loading && data && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50">

          {/* ─ KPI Summary ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Containers" value={fmt(data.summary.totalContainers, 1)}
              sub={`Target: ${fmt(data.summary.totalMonthlyTarget, 1)}`} />
            <KpiCard label="Achievement"
              value={`${data.summary.achievementPct}%`}
              sub="vs Monthly Target"
              accent={data.summary.achievementPct >= 100} />
            <KpiCard label="Total MTs" value={fmt(data.summary.totalMTs, 1)} sub="Metric Tonnes" />
            <KpiCard label="Revenue" value={fmtUSD(data.summary.totalAmount)}
              sub={`${data.summary.piCount} orders`} />
            <KpiCard label="Markets / Buyers"
              value={`${data.summary.activeCountries} / ${data.summary.uniqueBuyers}`}
              sub={`${data.summary.activeSalesPersons} Sales Persons`} />
          </div>

          {/* Achievement bar */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="font-semibold text-gray-700">Monthly Target Achievement</span>
              <span className="font-bold text-gray-900">
                {fmt(data.summary.totalContainers, 1)} / {fmt(data.summary.totalMonthlyTarget, 1)} containers
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all ${
                  data.summary.achievementPct >= 100 ? "bg-green-500"
                  : data.summary.achievementPct >= 75  ? "bg-amber-400"
                  : data.summary.achievementPct >= 50  ? "bg-orange-400"
                  : "bg-red-400"
                }`}
                style={{ width: `${Math.min(data.summary.achievementPct, 100)}%` }}
              />
            </div>
          </div>

          {/* ─ Variety + Country (side by side) ─────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Variety */}
            {data.varietyBreakdown.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">🌾 Variety Breakdown</p>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={130} height={130}>
                    <PieChart>
                      <Pie data={data.varietyBreakdown} dataKey="containers" nameKey="variety"
                        cx="50%" cy="50%" outerRadius={58} innerRadius={32}>
                        {data.varietyBreakdown.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [`${fmt(Number(v), 1)} ctrs`]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <table className="flex-1 text-xs">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left pb-1">Variety</th>
                        <th className="text-right pb-1">Ctrs</th>
                        <th className="text-right pb-1">Revenue</th>
                        <th className="text-right pb-1">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.varietyBreakdown.map((v, i) => (
                        <tr key={v.variety} className="border-t border-gray-100">
                          <td className="py-1.5 flex items-center gap-1.5 font-medium text-gray-800">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            {v.variety}
                          </td>
                          <td className="py-1.5 text-right font-semibold text-gray-900">{fmt(v.containers, 1)}</td>
                          <td className="py-1.5 text-right text-gray-500">{fmtUSD(v.amount)}</td>
                          <td className="py-1.5 text-right">
                            <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                              {v.containersPct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Top 8 Countries */}
            {data.countryBreakdown.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                  🌍 Top Countries ({Math.min(data.countryBreakdown.length, 8)})
                </p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={data.countryBreakdown.slice(0, 8)} layout="vertical"
                    margin={{ left: 60, right: 30, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                    <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v) => fmt(v)} />
                    <YAxis type="category" dataKey="country" tick={{ fontSize: 9 }} width={60} />
                    <Tooltip formatter={(v: any) => [`${fmt(Number(v), 1)} ctrs`]} />
                    <Bar dataKey="containers" fill="#16a34a" radius={[0,3,3,0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* ─ Sales Person Performance ─────────────────────────────────────── */}
          {data.salesPersonBreakdown.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">👤 Sales Person Performance</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Person</th>
                    <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Containers</th>
                    <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">MTs</th>
                    <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Revenue</th>
                    <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Target</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase min-w-[120px]">Achievement</th>
                    <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Buyers</th>
                  </tr>
                </thead>
                <tbody>
                  {data.salesPersonBreakdown.map((sp, i) => {
                    const pct = sp.achievementPct
                    const barColor = pct >= 100 ? "bg-green-500" : pct >= 75 ? "bg-amber-400" : "bg-red-400"
                    return (
                      <tr key={sp.salesPerson} className={`border-t border-gray-100 ${i % 2 ? "bg-gray-50/50" : ""}`}>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{sp.salesPerson}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmt(sp.containers, 1)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{fmt(sp.mts, 1)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{fmtUSD(sp.amount)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-400 text-xs">
                          {sp.monthlyTarget > 0 ? fmt(sp.monthlyTarget, 1) : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          {sp.monthlyTarget > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-2">
                                <div className={`${barColor} h-2 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <span className={`text-xs font-bold w-9 text-right ${pct >= 100 ? "text-green-700" : pct >= 75 ? "text-amber-600" : "text-red-600"}`}>
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{sp.buyerCount}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ─ Meetings Summary ──────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">🤝 Meetings Done — {data.calendarMonthYear}</p>
              <div className="flex items-center gap-3 text-xs">
                <span className="bg-gray-100 px-2 py-1 rounded font-semibold text-gray-700">Total: {data.meetingsSummary.totalDone}</span>
                <span className="bg-purple-50 px-2 py-1 rounded font-semibold text-purple-700">T1: {data.meetingsSummary.byTier.TIER1}</span>
                <span className="bg-blue-50 px-2 py-1 rounded font-semibold text-blue-700">T2: {data.meetingsSummary.byTier.TIER2}</span>
                <span className="bg-green-50 px-2 py-1 rounded font-semibold text-green-700">T3: {data.meetingsSummary.byTier.TIER3}</span>
              </div>
            </div>
            {data.meetingsSummary.meetings.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No meetings recorded for {data.calendarMonthYear}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Buyer</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Country</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Tier</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Outcome</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.meetingsSummary.meetings.map((m, i) => (
                    <tr key={i} className={`border-t border-gray-100 ${i % 2 ? "bg-gray-50/50" : ""}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-900 max-w-[160px] truncate">{m.buyerName}</td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{m.country}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: m.tier === "TIER1" ? "#f3e8ff" : m.tier === "TIER2" ? "#dbeafe" : "#d1fae5",
                            color:      m.tier === "TIER1" ? "#7c3aed" : m.tier === "TIER2" ? "#1d4ed8" : "#059669",
                          }}>
                          {m.tier}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">
                        {(() => { try { return new Date(m.meetingDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) } catch { return m.meetingDate } })()}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="bg-blue-50 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap">
                          {OUTCOME_LABEL[m.outcome] ?? m.outcome}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[200px] truncate">{m.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
