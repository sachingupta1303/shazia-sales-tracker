"use client"

import { useState, useEffect, useCallback } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts"

// ── Types ─────────────────────────────────────────────────────────────────────
interface MeetingRow {
  buyerName: string
  country: string
  tier: string
  meetingDate: string
  completedBy: string
  outcome: string
  notes: string
}

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
    meetings: MeetingRow[]
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

const PIE_COLORS  = ["#16a34a", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed"]
const TIER_COLORS: Record<string, string> = {
  TIER1: "#7c3aed", TIER2: "#1d4ed8", TIER3: "#059669", "—": "#9ca3af",
}
const TIER_BG: Record<string, string> = {
  TIER1: "#f3e8ff", TIER2: "#dbeafe", TIER3: "#d1fae5", "—": "#f3f4f6",
}
const OUTCOME_LABEL: Record<string, string> = {
  ORDER_CONFIRMED: "Order Confirmed",
  NEGOTIATING:     "Negotiating",
  AWAITING_PI:     "Awaiting PI",
  FOLLOW_UP:       "Follow-up",
  NO_INTEREST:     "No Interest",
  OTHER:           "Other",
}

function getCurrentFY(): string {
  const today = new Date()
  const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  return `${year}-${String(year + 1).slice(-2)}`
}

function getCurrentFYMonth(): number {
  const m = new Date().getMonth() // 0-indexed
  // Apr=0→1, May=1→2, ..., Mar=11→12
  return ((m - 3 + 12) % 12) + 1
}

function generateFYList(): string[] {
  const currentFY = getCurrentFY()
  const [startYear] = currentFY.split("-").map(Number)
  return [
    `${startYear - 2}-${String(startYear - 1).slice(-2)}`,
    `${startYear - 1}-${String(startYear).slice(-2)}`,
    currentFY,
  ]
}

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color = "gray", highlight = false,
}: {
  label: string; value: string; sub?: string; color?: string; highlight?: boolean
}) {
  const bg = highlight ? "bg-green-50 border-green-200" : "bg-white border-gray-200"
  const vc = highlight ? "text-green-700" : "text-gray-900"
  return (
    <div className={`${bg} border rounded-xl p-4 flex flex-col gap-1`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${vc}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

function AchievementBar({ pct }: { pct: number }) {
  const capped = Math.min(pct, 100)
  const color = pct >= 100 ? "bg-green-500" : pct >= 75 ? "bg-amber-400" : pct >= 50 ? "bg-orange-400" : "bg-red-400"
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${capped}%` }} />
      </div>
      <span className={`text-xs font-semibold w-10 text-right ${pct >= 100 ? "text-green-700" : pct >= 75 ? "text-amber-600" : "text-red-600"}`}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap"
      style={{ background: TIER_BG[tier] ?? "#f3f4f6", color: TIER_COLORS[tier] ?? "#374151" }}
    >
      {tier}
    </span>
  )
}

// ── Custom Recharts Tooltip ───────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-800 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{fmt(p.value, p.value % 1 ? 1 : 0)}</strong>
        </p>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
interface ReportClientProps {
  userRole: string
}

export function ReportClient({ userRole }: ReportClientProps) {
  const fyList    = generateFYList()
  const [fy,      setFY]     = useState(() => getCurrentFY())
  const [month,   setMonth]  = useState(() => getCurrentFYMonth())
  const [data,    setData]   = useState<MonthlyReportData | null>(null)
  const [loading, setLoading]= useState(false)
  const [error,   setError]  = useState<string | null>(null)

  const fetchReport = useCallback(async (selFY: string, selMonth: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/monthly-report?fy=${selFY}&month=${selMonth}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      setError(e.message || "Failed to load report")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReport(fy, month) }, [fy, month, fetchReport])

  const handlePrint = () => window.print()

  return (
    <>
      {/* Print-only styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-break { page-break-before: always; }
          body { background: white; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Monthly MIS Report</h1>
          <p className="text-xs text-gray-500">Select period to generate the report</p>
        </div>
        <div className="flex items-center gap-3">
          {/* FY selector */}
          <select
            value={fy}
            onChange={(e) => setFY(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {fyList.map((f) => (
              <option key={f} value={f}>FY {f}</option>
            ))}
          </select>
          {/* Month selector */}
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {FY_MONTHS.map((m) => (
              <option key={m.no} value={m.no}>{m.name}</option>
            ))}
          </select>
          {/* Print button */}
          <button
            onClick={handlePrint}
            disabled={!data || loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            🖨 Download PDF
          </button>
        </div>
      </div>

      {/* ── Loading / Error ──────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading report data…</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-6 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* ── Report Body ──────────────────────────────────────────────────────── */}
      {!loading && data && (
        <div className="p-6 space-y-8 max-w-[1200px] mx-auto">

          {/* ── Print header (hidden on screen) ───────────────────────────── */}
          <div className="hidden print:block mb-6 pb-4 border-b-2 border-gray-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Shazia Rice Export</p>
                <h1 className="text-2xl font-bold text-gray-900 mt-1">Monthly MIS Report</h1>
                <p className="text-sm text-gray-600">{data.calendarMonthYear} &nbsp;|&nbsp; FY {data.fy}</p>
              </div>
              <div className="text-right text-xs text-gray-400">
                <p>Generated: {new Date(data.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
                <p>Confidential · Internal Use Only</p>
              </div>
            </div>
          </div>

          {/* ── Period badge (screen) ─────────────────────────────────────── */}
          <div className="no-print flex items-center gap-3">
            <div className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold">
              {data.calendarMonthYear}
            </div>
            <div className="text-sm text-gray-500">
              FY {data.fy} &nbsp;·&nbsp; Report generated{" "}
              {new Date(data.generatedAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </div>
          </div>

          {/* ═══ SECTION 1: Executive Summary ════════════════════════════════ */}
          <section>
            <SectionTitle
              title="📊 Executive Summary"
              subtitle="Overall performance for the selected month"
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <KpiCard
                label="Total Containers"
                value={fmt(data.summary.totalContainers, 1)}
                sub={`Target: ${fmt(data.summary.totalMonthlyTarget, 1)}`}
                highlight
              />
              <KpiCard
                label="Achievement"
                value={`${data.summary.achievementPct}%`}
                sub={`vs Monthly Target`}
                highlight={data.summary.achievementPct >= 100}
              />
              <KpiCard
                label="Total MTs"
                value={fmt(data.summary.totalMTs, 1)}
                sub="Metric tonnes"
              />
              <KpiCard
                label="Total Revenue"
                value={fmtUSD(data.summary.totalAmount)}
                sub={`${data.summary.piCount} PI orders`}
              />
              <KpiCard
                label="Active Markets"
                value={String(data.summary.activeCountries)}
                sub={`${data.summary.uniqueBuyers} buyers · ${data.summary.activeSalesPersons} SPs`}
              />
            </div>

            {/* Achievement progress bar */}
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Monthly Target Achievement</span>
                <span className="text-sm font-bold text-gray-900">
                  {fmt(data.summary.totalContainers, 1)} / {fmt(data.summary.totalMonthlyTarget, 1)} containers
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-4 rounded-full transition-all ${
                    data.summary.achievementPct >= 100 ? "bg-green-500"
                    : data.summary.achievementPct >= 75 ? "bg-amber-400"
                    : data.summary.achievementPct >= 50 ? "bg-orange-400"
                    : "bg-red-400"
                  }`}
                  style={{ width: `${Math.min(data.summary.achievementPct, 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-gray-400">
                <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
              </div>
            </div>
          </section>

          {/* ═══ SECTION 2: Variety Breakdown ════════════════════════════════ */}
          {data.varietyBreakdown.length > 0 && (
            <section>
              <SectionTitle
                title="🌾 Variety Breakdown"
                subtitle="Basmati vs Non-Basmati split"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pie chart */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Containers by Variety</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={data.varietyBreakdown}
                        dataKey="containers"
                        nameKey="variety"
                        cx="50%"
                        cy="50%"
                        outerRadius={85}
                        innerRadius={45}
                        label={(entry: any) => `${entry.variety} ${entry.containersPct}%`}
                        labelLine={false}
                      >
                        {data.varietyBreakdown.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [`${fmt(Number(v), 1)} ctrs`, "Containers"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Variety table */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Variety</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Containers</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">MTs</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Revenue</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.varietyBreakdown.map((v, i) => (
                        <tr key={v.variety} className="border-t border-gray-100">
                          <td className="px-4 py-3 flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                            />
                            <span className="font-medium text-gray-800">{v.variety}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(v.containers, 1)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{fmt(v.mts, 1)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{fmtUSD(v.amount)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs font-bold">
                              {v.containersPct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* ═══ SECTION 3: Country Performance ══════════════════════════════ */}
          {data.countryBreakdown.length > 0 && (
            <section className="print-break">
              <SectionTitle
                title="🌍 Country Performance"
                subtitle={`${data.countryBreakdown.length} active markets`}
              />
              <div className="space-y-4">
                {/* Bar chart - top 10 */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-3">
                    Top {Math.min(data.countryBreakdown.length, 10)} Countries — Containers
                  </p>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={data.countryBreakdown.slice(0, 10)}
                      layout="vertical"
                      margin={{ left: 80, right: 40, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                      <YAxis type="category" dataKey="country" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="containers" name="Containers" fill="#16a34a" radius={[0, 4, 4, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Country table */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">#</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Country</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Containers</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">MTs</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Revenue</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Buyers</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.countryBreakdown.map((c, i) => (
                        <tr key={c.country} className={`border-t border-gray-100 ${i % 2 === 0 ? "" : "bg-gray-50/40"}`}>
                          <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{c.country}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(c.containers, 1)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{fmt(c.mts, 1)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{fmtUSD(c.amount)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{c.buyerCount}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-gray-100 rounded-full h-1.5">
                                <div
                                  className="bg-green-500 h-1.5 rounded-full"
                                  style={{ width: `${c.pct}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-gray-700 w-8 text-right">{c.pct}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* ═══ SECTION 4: Sales Person Performance ═════════════════════════ */}
          {data.salesPersonBreakdown.length > 0 && (
            <section>
              <SectionTitle
                title="👤 Sales Person Performance"
                subtitle="Actual containers vs monthly target per sales person"
              />
              <div className="space-y-4">
                {/* Bar chart */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Actual vs Target (Containers)</p>
                  <ResponsiveContainer width="100%" height={Math.max(200, data.salesPersonBreakdown.length * 48)}>
                    <BarChart
                      data={data.salesPersonBreakdown}
                      layout="vertical"
                      margin={{ left: 120, right: 40, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                      <YAxis
                        type="category"
                        dataKey="salesPerson"
                        tick={{ fontSize: 11 }}
                        width={120}
                        tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 14) + "…" : v}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="containers"    name="Actual" fill="#16a34a" radius={[0, 4, 4, 0]} barSize={12} />
                      <Bar dataKey="monthlyTarget" name="Target" fill="#d1fae5" radius={[0, 4, 4, 0]} barSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* SP table */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Sales Person</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Containers</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">MTs</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Revenue</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Target</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Achievement</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Buyers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.salesPersonBreakdown.map((sp, i) => (
                        <tr key={sp.salesPerson} className={`border-t border-gray-100 ${i % 2 === 0 ? "" : "bg-gray-50/40"}`}>
                          <td className="px-4 py-3 font-medium text-gray-900">{sp.salesPerson}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(sp.containers, 1)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{fmt(sp.mts, 1)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{fmtUSD(sp.amount)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{sp.monthlyTarget > 0 ? fmt(sp.monthlyTarget, 1) : "—"}</td>
                          <td className="px-4 py-3 min-w-[140px]">
                            {sp.monthlyTarget > 0
                              ? <AchievementBar pct={sp.achievementPct} />
                              : <span className="text-xs text-gray-400">No target</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{sp.buyerCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* ═══ SECTION 5: Buyer-wise Performance ═══════════════════════════ */}
          {data.buyerBreakdown.length > 0 && (
            <section className="print-break">
              <SectionTitle
                title="🏢 Buyer-wise Performance"
                subtitle={`${data.buyerBreakdown.length} buyers ordered this month`}
              />
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">#</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Buyer</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Country</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Tier</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Responsible</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Containers</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">MTs</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Revenue</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Target/Mo</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase min-w-[130px]">Achievement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.buyerBreakdown.map((b, i) => (
                      <tr key={`${b.buyerName}-${b.country}`} className={`border-t border-gray-100 ${i % 2 === 0 ? "" : "bg-gray-50/40"}`}>
                        <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">{b.buyerName}</span>
                          {b.isIn8020 && (
                            <span className="ml-2 text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-semibold">80/20</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{b.country}</td>
                        <td className="px-4 py-3"><TierBadge tier={b.tier} /></td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{b.responsiblePerson || "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(b.containers, 1)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{fmt(b.mts, 1)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{fmtUSD(b.amount)}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{b.monthlyTarget > 0 ? fmt(b.monthlyTarget, 1) : "—"}</td>
                        <td className="px-4 py-3 min-w-[130px]">
                          {b.monthlyTarget > 0
                            ? <AchievementBar pct={b.achievementPct} />
                            : <span className="text-xs text-gray-400">No target</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ═══ SECTION 6: Meetings Summary ══════════════════════════════════ */}
          <section>
            <SectionTitle
              title="🤝 Meetings Done"
              subtitle={`Key Account meetings completed in ${data.calendarMonthYear}`}
            />

            {/* Tier summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <KpiCard
                label="Total Meetings"
                value={String(data.meetingsSummary.totalDone)}
                highlight={data.meetingsSummary.totalDone > 0}
              />
              <KpiCard
                label="Tier 1"
                value={String(data.meetingsSummary.byTier.TIER1)}
                sub="VIP Buyers"
              />
              <KpiCard
                label="Tier 2"
                value={String(data.meetingsSummary.byTier.TIER2)}
                sub="Key Accounts"
              />
              <KpiCard
                label="Tier 3"
                value={String(data.meetingsSummary.byTier.TIER3)}
                sub="Growth Buyers"
              />
            </div>

            {data.meetingsSummary.meetings.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
                No meetings recorded for {data.calendarMonthYear}
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Buyer</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Country</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Tier</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Completed By</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Outcome</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.meetingsSummary.meetings.map((m, i) => (
                      <tr key={i} className={`border-t border-gray-100 ${i % 2 === 0 ? "" : "bg-gray-50/40"}`}>
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px] truncate" title={m.buyerName}>{m.buyerName}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{m.country}</td>
                        <td className="px-4 py-3"><TierBadge tier={m.tier} /></td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {(() => {
                            try {
                              return new Date(m.meetingDate).toLocaleDateString("en-IN", {
                                day: "numeric", month: "short", year: "numeric",
                              })
                            } catch { return m.meetingDate }
                          })()}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{m.completedBy}</td>
                        <td className="px-4 py-3">
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap">
                            {OUTCOME_LABEL[m.outcome] ?? m.outcome}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[220px] truncate" title={m.notes}>{m.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Print footer ─────────────────────────────────────────────────── */}
          <div className="hidden print:block mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 flex items-center justify-between">
            <span>Shazia Rice Export — Confidential &amp; Internal</span>
            <span>{data.calendarMonthYear} · FY {data.fy}</span>
          </div>

        </div>
      )}

      {/* Empty state */}
      {!loading && !data && !error && (
        <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
          Select a period above to generate the report.
        </div>
      )}
    </>
  )
}
