"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts"
import { 
  StatusBadge, 
  TierBadge, 
  GapCell, 
  AchievementBar,
  SegmentTag 
} from "@/components/ui/status-badge"
import { SummaryCard } from "@/components/ui/page-header"
import {
  formatNumber, segmentBg, segmentLabel, ALL_BUYER_SEGMENTS,
} from "@/lib/utils"
import type {
  BuyerSegment, PerformanceStatus, UserRole, BuyerTier,
} from "@/types"

// ── Types matching enhanced API responses ────────────────────────────────────

interface BuyerRow {
  buyerCode: string; buyerName: string; country: string; salesPerson: string
  tier: BuyerTier; segment: BuyerSegment
  target: number; targetDue: number; actual: number; gap: number
  achievementPercent: number; status: PerformanceStatus
  previousYear: number; growthPct: number | null
  topBrands: { brand: string; containers: number; pct: number }[]
  basmatiContainers: number; nonBasmatiContainers: number
  isKeyAccount: boolean
}
interface BuyersResponse {
  rows: BuyerRow[]
  summary: {
    totalTarget: number; totalActual: number; totalPrev: number; totalGap: number
    achieved: number; missed: number; noTarget: number
    tier1Count: number; tier2Count: number; tier3Count: number
    basmatiContainers: number; nonBasmatiContainers: number
    bySegment: Record<string, number>
  }
  meta: { fy: string; week: number }
}

interface TopBuyer { name: string; code: string; containers: number; pct: number }
interface CountryRow {
  country: string; previousYear: number
  target: number; targetDue: number; actual: number; gap: number
  status: PerformanceStatus; achievementPercent: number
  activeBuyers: number; totalBuyers: number
  growthPct: number | null
  topBuyers: TopBuyer[]
  isDreamMarket: boolean
}
interface CountriesResponse {
  rows: CountryRow[]
  summary: {
    totalTarget: number; totalActual: number; totalPrev: number; totalGap: number
    activeCount: number; growingCount: number; decliningCount: number
  }
  meta: { fy: string; week: number }
}

interface SPRow {
  salesPerson: string; previousYear: number
  target: number; targetDue: number; actual: number; gap: number
  status: PerformanceStatus; achievementPercent: number; activeBuyers: number
  meetings: number; calls: number; whatsapp: number; emails: number
  samples: number; followUps: number; totalActivities: number
  growthPct: number | null
}
interface SPResponse {
  rows: SPRow[]
  summary: {
    totalTarget: number; totalActual: number; totalGap: number; totalPrev: number
    totalActiveBuyers: number; totalMeetings: number; totalActivities: number; totalFollowUps: number
  }
  meta: { fy: string; week: number }
}

interface CoordRow {
  coordinator: string
  assignedBuyers: number; meetingsFixed: number; pitchesPrepared: number
  productAvailability: number; marketResearchDone: number
  tasksCompleted: number; tasksOpen: number; tasksOverdue: number
  totalTasks: number; completionRate: number
  actualContainers: number
  targetContainers: number
  achievementPercent: number
  status: PerformanceStatus
}
interface CoordResponse {
  rows: CoordRow[]
  summary: {
    totalCoordinators: number; totalTasksCompleted: number; totalTasksOpen: number
    totalTasksOverdue: number; totalMeetingsFixed: number; totalProductUpdates: number
    totalAssignedBuyers: number; totalActualContainers: number
  }
  filterOptions: { coordinators: string[] }
}

type Tab = "buyers" | "countries" | "salesperson" | "coordinator" | "meetings"

interface Props {
  userRole?: UserRole
  salesPerson?: string
  allSalesPersons: string[]
  allCountries: string[]
}

// ── Filter state ────────────────────────────────────────────────────────────

interface Filters {
  fy: string
  fyMonth: string
  fyWeek: string
  fyQuarter: string
  country: string
  salesPerson: string
  coordinator: string
  segment: string
  buyer: string  // search
}

const FY_MONTHS = [
  "April","May","June","July","August","September",
  "October","November","December","January","February","March",
]

// Computed once at module load — covers the last 3 FYs + current
function buildFYOptions(): string[] {
  const today = new Date()
  const currentYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  return [0, -1, -2].map((offset) => {
    const y = currentYear + offset
    return `${y}-${String(y + 1).slice(-2)}`
  })
}
const FY_OPTIONS = buildFYOptions()
const DEFAULT_FY = FY_OPTIONS[0]

// ── Filter Bar ──────────────────────────────────────────────────────────────

function FilterBar({
  filters, setFilters, isSP, allSalesPersons, allCountries, coordinators, activeTab,
}: {
  filters: Filters
  setFilters: (f: Filters) => void
  isSP: boolean
  allSalesPersons: string[]
  allCountries: string[]
  coordinators: string[]
  activeTab: Tab
}) {
  const set = (k: keyof Filters, v: string) => {
    const next = { ...filters, [k]: v }
    // Period filters are mutually exclusive
    if (k === "fyMonth"   && v) { next.fyWeek = ""; next.fyQuarter = "" }
    if (k === "fyWeek"    && v) { next.fyMonth = ""; next.fyQuarter = "" }
    if (k === "fyQuarter" && v) { next.fyMonth = ""; next.fyWeek = "" }
    setFilters(next)
  }

  const hasAny = !!(
    filters.country || filters.salesPerson || filters.coordinator ||
    filters.segment || filters.buyer || filters.fyMonth || filters.fyWeek || filters.fyQuarter
  )

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filters</span>

      {/* Financial year */}
      <select value={filters.fy} onChange={(e) => set("fy", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 font-semibold bg-blue-50 text-blue-900 border-blue-200">
        {FY_OPTIONS.map((f) => <option key={f} value={f}>FY {f}</option>)}
      </select>

      {/* Period (mutually exclusive) */}
      <select value={filters.fyMonth} onChange={(e) => set("fyMonth", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
        <option value="">All Months</option>
        {FY_MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
      </select>
      <select value={filters.fyWeek} onChange={(e) => set("fyWeek", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 w-24">
        <option value="">All Weeks</option>
        {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
          <option key={w} value={String(w)}>W{w}</option>
        ))}
      </select>
      <select value={filters.fyQuarter} onChange={(e) => set("fyQuarter", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
        <option value="">All Quarters</option>
        <option value="1">Q1 (Apr–Jun)</option>
        <option value="2">Q2 (Jul–Sep)</option>
        <option value="3">Q3 (Oct–Dec)</option>
        <option value="4">Q4 (Jan–Mar)</option>
      </select>

      <div className="w-px bg-gray-200 self-stretch" />

      {/* Country */}
      <select value={filters.country} onChange={(e) => set("country", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
        <option value="">All Countries</option>
        {allCountries.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      {/* SP — hidden for SALES_PERSON role + on coordinator tab */}
      {!isSP && activeTab !== "coordinator" && (
        <select value={filters.salesPerson} onChange={(e) => set("salesPerson", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
          <option value="">All Sales Persons</option>
          {allSalesPersons.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}

      {/* Coordinator (only on coordinator tab) */}
      {activeTab === "coordinator" && (
        <select value={filters.coordinator} onChange={(e) => set("coordinator", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
          <option value="">All Coordinators</option>
          {coordinators.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}

      {/* Segment (only on buyer tab) */}
      {activeTab === "buyers" && (
        <select value={filters.segment} onChange={(e) => set("segment", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
          <option value="">All Segments</option>
          {ALL_BUYER_SEGMENTS.map((s) => <option key={s} value={s}>{segmentLabel(s)}</option>)}
        </select>
      )}

      {/* Buyer search (only on buyer tab) */}
      {activeTab === "buyers" && (
        <input type="text" placeholder="Search buyer…" value={filters.buyer}
               onChange={(e) => set("buyer", e.target.value)}
               className="flex-1 min-w-[150px] text-sm border border-gray-200 rounded-lg px-3 py-1.5" />
      )}

      {hasAny && (
        <button
          onClick={() => setFilters({
            fy: filters.fy || DEFAULT_FY,
            fyMonth: "", fyWeek: "", fyQuarter: "",
            country: "", salesPerson: isSP ? filters.salesPerson : "",
            coordinator: "", segment: "", buyer: "",
          })}
          className="text-xs text-red-500 hover:text-red-700 font-medium ml-auto"
        >Clear all</button>
      )}
    </div>
  )
}

// ── Buyer Tab ───────────────────────────────────────────────────────────────

function TablePager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const totalPages = Math.ceil(total / 10)
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50">
      <button onClick={() => onPage(page - 1)} disabled={page === 1}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
        ← Prev
      </button>
      <span className="text-xs text-gray-500">
        Page {page} of {totalPages} <span className="text-gray-400">({total} rows · 10/page)</span>
      </span>
      <button onClick={() => onPage(page + 1)} disabled={page >= totalPages}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
        Next →
      </button>
    </div>
  )
}

function BuyerTab({ filters }: { filters: Filters }) {
  const router = useRouter()
  const [data, setData] = useState<BuyersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tablePage, setTablePage] = useState(1)

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (filters.fy)          p.set("fy",          filters.fy)
    if (filters.country)     p.set("country",     filters.country)
    if (filters.salesPerson) p.set("salesPerson", filters.salesPerson)
    if (filters.segment)     p.set("segment",     filters.segment)
    if (filters.buyer)       p.set("buyer",       filters.buyer)
    if (filters.fyMonth)     p.set("fyMonth",     filters.fyMonth)
    if (filters.fyWeek)      p.set("fyWeek",      filters.fyWeek)
    if (filters.fyQuarter)   p.set("fyQuarter",   filters.fyQuarter)
    return p.toString()
  }, [filters])

  useEffect(() => {
    setLoading(true); setError(null); setTablePage(1)
    fetch(`/api/performance/buyers?${params}`)
      .then(async (r) => {
        if (!r.ok) {
          let msg = `Server returned ${r.status}`
          try { const j = await r.json(); if (j?.error) msg = j.error } catch {}
          throw new Error(msg)
        }
        return r.json()
      })
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false))
  }, [params])

  if (loading) return (
    <div className="space-y-3">
      <div className="text-xs text-gray-400 px-1">Loading from Google Sheets (first load may take a few seconds)…</div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
      ))}
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
      <p className="font-semibold mb-1">Failed to load performance data</p>
      <p className="text-xs">{error}</p>
    </div>
  )
  if (!data) return null

  if (data.rows.length === 0) return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-900 text-sm space-y-2">
      <p className="font-semibold">No buyer rows match the current filters.</p>
      <p className="text-xs leading-relaxed">
        Check that <strong>TARGET_MASTER</strong> or the <strong>80/20 Buyers</strong> sheet has entries for FY <strong>{data.meta.fy}</strong>, or relax the filters above.
        If you just opened the app, the first Google Sheets fetch may have failed silently — try the diagnostic page below.
      </p>
      <a
        href="/diagnostics"
        className="inline-flex items-center gap-1.5 mt-2 text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors"
      >
        🩺 Run Data Diagnostics →
      </a>
    </div>
  )

  // Top 10 buyers by gap (most behind / ahead)
  const top10 = [...data.rows].slice(0, 10)
  const varietyData = [
    { name: "Basmati",     value: data.summary.basmatiContainers,    color: "#f59e0b" },
    { name: "Non Basmati", value: data.summary.nonBasmatiContainers, color: "#6b7280" },
  ].filter((d) => d.value > 0)

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard label="Buyers"      value={data.rows.length}                       color="bg-white border-gray-200" />
        <SummaryCard label="Total Target" value={formatNumber(data.summary.totalTarget, 0)} sub="containers" color="bg-blue-50 border-blue-200" />
        <SummaryCard label="Total Actual" value={formatNumber(data.summary.totalActual, 0)} sub={`vs ${formatNumber(data.summary.totalPrev, 0)} last yr`} color="bg-green-50 border-green-200" />
        <SummaryCard label="Total Gap"
                     value={`${data.summary.totalGap >= 0 ? "+" : ""}${formatNumber(data.summary.totalGap, 0)}`}
                     sub={data.summary.totalGap >= 0 ? "ahead" : "behind"}
                     color={data.summary.totalGap >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"} />
        <SummaryCard label="Achieved / Missed"
                     value={`${data.summary.achieved} / ${data.summary.missed}`}
                     sub={`${data.summary.tier1Count} T1 · ${data.summary.tier2Count} T2`}
                     color="bg-gray-50 border-gray-200" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top 10 by Target — Achievement vs Gap</h3>
          {top10.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={top10} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                <XAxis dataKey="buyerName" tick={{ fontSize: 9, fill: "#9ca3af" }} interval={0} angle={-25} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="target" name="Target" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="actual" name="Actual" fill="#16a34a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data</div>}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Variety Split</h3>
          {varietyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={varietyData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                     outerRadius={70} innerRadius={40} label={({ name, value }) => `${name}: ${formatNumber(value as number, 0)}`}>
                  {varietyData.map((e) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data</div>}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Buyer</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Country</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Segment</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Prev Yr</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Growth</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gap</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ach%</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.rows.slice((tablePage-1)*10, tablePage*10).map((r, i) => (
                <tr key={`${r.buyerCode}-${i}`}
                    onClick={() => router.push(`/buyers/${encodeURIComponent(r.buyerCode)}`)}
                    className="hover:bg-green-50 cursor-pointer">
                  <td className="px-3 py-2.5 text-gray-400 tabular-nums">{(tablePage-1)*10 + i + 1}</td>
                  <td className="px-3 py-2.5 text-gray-800">
                    <div className="flex items-center gap-1.5">
                      <SegmentTag segment={r.segment} isKeyAccount={r.isKeyAccount} />
                      <span className="truncate max-w-[180px] font-bold group-hover:text-green-700">{r.buyerName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 font-medium">{r.country}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${segmentBg(r.segment)}`}>
                      {segmentLabel(r.segment)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-medium text-gray-600">{formatNumber(r.target, 0)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-black text-gray-900">{formatNumber(r.actual, 0)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-gray-400">{formatNumber(r.previousYear, 0)}</td>
                  <td className="px-3 py-2.5 text-center text-[10px]">
                    {r.growthPct !== null ? (
                      <span className={r.growthPct >= 0 ? "text-green-600 font-bold" : "text-red-500 font-bold"}>
                        {r.growthPct >= 0 ? "▲" : "▼"} {Math.abs(r.growthPct)}%
                      </span>
                    ) : <span className="text-gray-300">–</span>}
                  </td>
                  <td className={`px-3 py-2.5 text-center tabular-nums text-xs font-bold ${r.gap >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {r.gap >= 0 ? "+" : ""}{formatNumber(r.gap, 0)}
                  </td>
                  <td className="px-3 py-2.5 min-w-[100px]">
                    <AchievementBar pct={r.achievementPercent} status={r.status} />
                  </td>
                  <td className="px-3 py-2.5 text-center"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 font-medium">
                    <a 
                      href={`/sales-persons/${encodeURIComponent(r.salesPerson)}`} 
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-green-700 hover:underline"
                    >
                      {r.salesPerson}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                <td className="px-3 py-4" />
                <td className="px-3 py-4 text-gray-900 uppercase text-[10px] tracking-widest" colSpan={3}>Grand Total ({data.rows.length})</td>
                <td className="px-3 py-4 text-center tabular-nums text-gray-600">{formatNumber(data.summary.totalTarget, 0)}</td>
                <td className="px-3 py-4 text-center tabular-nums text-gray-900">{formatNumber(data.summary.totalActual, 0)}</td>
                <td className="px-3 py-4 text-center tabular-nums text-gray-400 font-medium">{formatNumber(data.summary.totalPrev, 0)}</td>
                <td className="px-3 py-4" />
                <td className={`px-3 py-4 text-center tabular-nums font-bold ${data.summary.totalGap >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {data.summary.totalGap >= 0 ? "+" : ""}{formatNumber(data.summary.totalGap, 0)}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
        <TablePager page={tablePage} total={data.rows.length} onPage={setTablePage} />
      </div>
    </div>
  )
}

// ── Country Tab ─────────────────────────────────────────────────────────────

function CountryTab({ filters }: { filters: Filters }) {
  const router = useRouter()
  const [data, setData] = useState<CountriesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [tablePage, setTablePage] = useState(1)

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (filters.fy)          p.set("fy",          filters.fy)
    if (filters.country)     p.set("country",     filters.country)
    if (filters.salesPerson) p.set("salesPerson", filters.salesPerson)
    if (filters.fyMonth)     p.set("fyMonth",     filters.fyMonth)
    if (filters.fyWeek)      p.set("fyWeek",      filters.fyWeek)
    if (filters.fyQuarter)   p.set("fyQuarter",   filters.fyQuarter)
    return p.toString()
  }, [filters])

  useEffect(() => {
    setLoading(true)
    setTablePage(1)
    fetch(`/api/performance/countries?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .finally(() => setLoading(false))
  }, [params])

  if (loading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (
    <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
  ))}</div>

  if (!data) return <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-600 text-sm">Failed to load</div>

  const filtered = filters.country
    ? data.rows.filter((r) => r.country === filters.country.toUpperCase())
    : data.rows

  const top10Growth = [...filtered]
    .filter((r) => r.growthPct !== null)
    .sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))
    .slice(0, 10)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard label="Countries"   value={filtered.length}                            color="bg-white border-gray-200" />
        <SummaryCard label="Total Target" value={formatNumber(data.summary.totalTarget, 0)} sub="containers" color="bg-blue-50 border-blue-200" />
        <SummaryCard label="Total Actual" value={formatNumber(data.summary.totalActual, 0)} sub={`vs ${formatNumber(data.summary.totalPrev, 0)} last yr`} color="bg-green-50 border-green-200" />
        <SummaryCard label="Growing / Declining"
                     value={`${data.summary.growingCount} / ${data.summary.decliningCount}`}
                     sub="vs prev year" color="bg-amber-50 border-amber-200" />
        <SummaryCard label="Active"      value={data.summary.activeCount} sub="with orders" color="bg-teal-50 border-teal-200" />
      </div>

      {/* Top growth chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Top 10 Countries — YoY Growth %</h3>
        {top10Growth.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={top10Growth} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
              <XAxis dataKey="country" tick={{ fontSize: 10, fill: "#9ca3af" }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }}
                       formatter={(val: unknown) => [`${val}%`, "Growth"]} />
              <Bar dataKey="growthPct" radius={[3, 3, 0, 0]}>
                {top10Growth.map((e) => (
                  <Cell key={e.country} fill={(e.growthPct ?? 0) >= 0 ? "#16a34a" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No prev-year data to compare</div>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Country</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prev Yr</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Growth</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gap</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ach%</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Top Buyer</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Buyers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.slice((tablePage-1)*10, tablePage*10).map((r, i) => (
                <tr key={r.country}
                    onClick={() => router.push(`/countries/${encodeURIComponent(r.country)}`)}
                    className="hover:bg-green-50 cursor-pointer">
                  <td className="px-3 py-2.5 text-gray-400 tabular-nums">{(tablePage-1)*10 + i + 1}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">
                    <div className="flex items-center gap-1.5">
                      {r.isDreamMarket && <span className="text-amber-500" title="Dream Market">🌟</span>}
                      {r.country}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-medium">{formatNumber(r.target, 0)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-semibold">{formatNumber(r.actual, 0)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-gray-500">{formatNumber(r.previousYear, 0)}</td>
                  <td className="px-3 py-2.5 text-center text-xs">
                    {r.growthPct !== null ? (
                      <span className={r.growthPct >= 0 ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>
                        {r.growthPct >= 0 ? "▲" : "▼"} {Math.abs(r.growthPct)}%
                      </span>
                    ) : <span className="text-gray-300">–</span>}
                  </td>
                  <td className={`px-3 py-2.5 text-center tabular-nums text-xs font-semibold ${r.gap >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {r.gap >= 0 ? "+" : ""}{formatNumber(r.gap, 0)}
                  </td>
                  <td className="px-3 py-2.5 min-w-[110px]">
                    <AchievementBar pct={r.achievementPercent} status={r.status} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[140px] truncate">
                    {r.topBuyers[0] ? `${r.topBuyers[0].name} (${r.topBuyers[0].pct}%)` : "–"}
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2.5 text-center text-xs text-gray-500 font-medium">{r.activeBuyers}/{r.totalBuyers}</td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-gray-800 uppercase text-[10px] tracking-widest">Total ({filtered.length})</td>
                  <td className="px-3 py-3 text-center tabular-nums">{formatNumber(filtered.reduce((s, r) => s + r.target, 0), 0)}</td>
                  <td className="px-3 py-3 text-center tabular-nums">{formatNumber(filtered.reduce((s, r) => s + r.actual, 0), 0)}</td>
                  <td className="px-3 py-3 text-center tabular-nums text-gray-700 font-medium">{formatNumber(filtered.reduce((s, r) => s + r.previousYear, 0), 0)}</td>
                  <td className="px-3 py-3" />
                  <td className={`px-3 py-3 text-center tabular-nums font-bold ${filtered.reduce((s, r) => s + r.gap, 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {filtered.reduce((s, r) => s + r.gap, 0) >= 0 ? "+" : ""}{formatNumber(filtered.reduce((s, r) => s + r.gap, 0), 0)}
                  </td>
                  <td colSpan={3} />
                  <td className="px-3 py-3 text-center text-xs text-gray-600 font-bold">
                    {filtered.reduce((s, r) => s + r.activeBuyers, 0)}/{filtered.reduce((s, r) => s + r.totalBuyers, 0)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <TablePager page={tablePage} total={filtered.length} onPage={setTablePage} />
      </div>
    </div>
  )
}

// ── SP Tab ──────────────────────────────────────────────────────────────────

function SPTab({ filters }: { filters: Filters }) {
  const [data, setData] = useState<SPResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [tablePage, setTablePage] = useState(1)

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (filters.fy)          p.set("fy",          filters.fy)
    if (filters.country)     p.set("country",     filters.country)
    if (filters.salesPerson) p.set("salesPerson", filters.salesPerson)
    if (filters.fyMonth)     p.set("fyMonth",     filters.fyMonth)
    if (filters.fyWeek)      p.set("fyWeek",      filters.fyWeek)
    if (filters.fyQuarter)   p.set("fyQuarter",   filters.fyQuarter)
    return p.toString()
  }, [filters])

  useEffect(() => {
    setLoading(true)
    setTablePage(1)
    fetch(`/api/performance/salesperson?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .finally(() => setLoading(false))
  }, [params])

  if (loading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (
    <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
  ))}</div>

  if (!data) return <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-700 text-sm">Manager / Director access required</div>

  // Activity stacked bar data for top 8 SPs
  const top8 = [...data.rows]
    .sort((a, b) => b.totalActivities - a.totalActivities)
    .slice(0, 8)
    .map((r) => ({
      name: r.salesPerson,
      Meetings: r.meetings, Calls: r.calls, WhatsApp: r.whatsapp,
      Emails: r.emails, Samples: r.samples, FollowUps: r.followUps,
    }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard label="Sales People"   value={data.rows.length}                              color="bg-white border-gray-200" />
        <SummaryCard label="Total Target"   value={formatNumber(data.summary.totalTarget, 0)}    sub="containers" color="bg-blue-50 border-blue-200" />
        <SummaryCard label="Total Actual"   value={formatNumber(data.summary.totalActual, 0)}    sub={`vs ${formatNumber(data.summary.totalPrev, 0)}`} color="bg-green-50 border-green-200" />
        <SummaryCard label="Active Buyers"  value={data.summary.totalActiveBuyers}               sub="across SPs" color="bg-teal-50 border-teal-200" />
        <SummaryCard label="Activities Logged"
                     value={data.summary.totalActivities}
                     sub={`${data.summary.totalMeetings} mtgs · ${data.summary.totalFollowUps} follow-ups`}
                     color="bg-amber-50 border-amber-200" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Activity Mix per Sales Person</h3>
        {top8.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={top8} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Meetings"  stackId="a" fill="#14b8a6" />
              <Bar dataKey="Calls"     stackId="a" fill="#3b82f6" />
              <Bar dataKey="WhatsApp"  stackId="a" fill="#22c55e" />
              <Bar dataKey="Emails"    stackId="a" fill="#6366f1" />
              <Bar dataKey="Samples"   stackId="a" fill="#f59e0b" />
              <Bar dataKey="FollowUps" stackId="a" fill="#06b6d4" />
            </BarChart>
          </ResponsiveContainer>
        ) : <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No activities logged yet</div>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["#","Sales Person","Buyers","Target","Actual","Gap","Ach%","Mtgs","Calls","Whatsapp","Emails","Samples","Follow-ups","Status"].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.rows.slice((tablePage-1)*10, tablePage*10).map((r, i) => (
                <tr key={r.salesPerson} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 text-gray-400 tabular-nums">{(tablePage-1)*10 + i + 1}</td>
                  <td className="px-3 py-2.5">
                    <a 
                      href={`/sales-persons/${encodeURIComponent(r.salesPerson)}`} 
                      className="font-bold text-gray-800 hover:text-green-700 hover:underline"
                    >
                      {r.salesPerson}
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-gray-500">{r.activeBuyers}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatNumber(r.target, 0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{formatNumber(r.actual, 0)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums text-xs font-semibold ${r.gap >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {r.gap >= 0 ? "+" : ""}{formatNumber(r.gap, 0)}
                  </td>
                  <td className="px-3 py-2.5 min-w-[110px]"><AchievementBar pct={r.achievementPercent} status={r.status} /></td>
                  <td className="px-3 py-2.5 text-center text-sm font-bold text-teal-600">{r.meetings}</td>
                  <td className="px-3 py-2.5 text-center text-sm text-blue-600">{r.calls}</td>
                  <td className="px-3 py-2.5 text-center text-sm text-green-600">{r.whatsapp}</td>
                  <td className="px-3 py-2.5 text-center text-sm text-indigo-600">{r.emails}</td>
                  <td className="px-3 py-2.5 text-center text-sm text-amber-600">{r.samples}</td>
                  <td className="px-3 py-2.5 text-center text-sm text-cyan-600">{r.followUps}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
            {data.rows.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-gray-800 uppercase text-xs tracking-wide">Grand Total ({data.rows.length})</td>
                  <td className="px-3 py-3 text-center text-xs text-gray-700">{data.summary.totalActiveBuyers}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNumber(data.summary.totalTarget, 0)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNumber(data.summary.totalActual, 0)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${data.summary.totalGap >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {data.summary.totalGap >= 0 ? "+" : ""}{formatNumber(data.summary.totalGap, 0)}
                  </td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-center text-sm">{data.summary.totalMeetings}</td>
                  <td className="px-3 py-3" colSpan={4} />
                  <td className="px-3 py-3 text-center text-sm">{data.summary.totalFollowUps}</td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <TablePager page={tablePage} total={data.rows.length} onPage={setTablePage} />
      </div>
    </div>
  )
}

// ── Coordinator Tab ─────────────────────────────────────────────────────────

function CoordinatorTab({
  filters, onCoordOptions,
}: {
  filters: Filters
  onCoordOptions: (opts: string[]) => void
}) {
  const [data, setData] = useState<CoordResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [tablePage, setTablePage] = useState(1)

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (filters.country)     p.set("country",     filters.country)
    if (filters.coordinator) p.set("coordinator", filters.coordinator)
    return p.toString()
  }, [filters])

  useEffect(() => {
    setLoading(true)
    setTablePage(1)
    fetch(`/api/performance/coordinator?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        setData(d)
        if (d?.filterOptions?.coordinators) onCoordOptions(d.filterOptions.coordinators)
      })
      .finally(() => setLoading(false))
  }, [params, onCoordOptions])

  if (loading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (
    <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
  ))}</div>

  if (!data) return <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-700 text-sm">Manager / Director access required</div>

  if (data.rows.length === 0) return (
    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-10 text-center">
      <p className="text-gray-400 text-sm">No coordinator performance data yet.</p>
      <p className="text-gray-400 text-xs mt-1">Coordinators are identified from PI records and assigned tasks.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard label="Coordinators"     value={data.summary.totalCoordinators}     color="bg-white border-gray-200" />
        <SummaryCard label="Total Actual"      value={formatNumber(data.summary.totalActualContainers, 0)} sub="containers" color="bg-green-50 border-green-200" />
        <SummaryCard label="Tasks Completed"  value={data.summary.totalTasksCompleted}   color="bg-blue-50 border-blue-200" />
        <SummaryCard label="Tasks Open"       value={data.summary.totalTasksOpen}        color="bg-white border-gray-200" />
        <SummaryCard label="Tasks Overdue"    value={data.summary.totalTasksOverdue}
                     color={data.summary.totalTasksOverdue > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Actual Containers vs Tasks Completed</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.rows} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <XAxis dataKey="coordinator" tick={{ fontSize: 10, fill: "#9ca3af" }} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="actualContainers" name="Actual Ctrs" fill="#16a34a" radius={[3, 3, 0, 0]} />
            <Bar dataKey="tasksCompleted"   name="Tasks Done"  fill="#3b82f6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Coordinator</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual Ctrs</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ach%</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Buyers</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mtgs</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-green-700">Done</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-blue-600">Open</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.rows.slice((tablePage-1)*10, tablePage*10).map((r, i) => (
                <tr key={r.coordinator} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2.5 text-gray-400 tabular-nums">{(tablePage-1)*10 + i + 1}</td>
                  <td className="px-3 py-2.5 font-bold text-gray-800">{r.coordinator}</td>
                  <td className="px-3 py-2.5 text-center font-black text-gray-900 tabular-nums">{formatNumber(r.actualContainers, 0)}</td>
                  <td className="px-3 py-2.5 text-center text-gray-500 tabular-nums">{formatNumber(r.targetContainers, 0)}</td>
                  <td className="px-3 py-2.5 min-w-[100px]">
                    <AchievementBar pct={r.achievementPercent} status={r.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-600 font-medium">{r.assignedBuyers}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-teal-600">{r.meetingsFixed}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-green-700">{r.tasksCompleted}</td>
                  <td className="px-3 py-2.5 text-center font-medium text-blue-600">{r.tasksOpen}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-gray-700">{r.completionRate}%</td>
                </tr>
              ))}
            </tbody>
            {data.rows.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-gray-800 uppercase text-[10px] tracking-widest">Grand Total ({data.rows.length})</td>
                  <td className="px-3 py-3 text-center tabular-nums text-gray-900">{formatNumber(data.summary.totalActualContainers, 0)}</td>
                  <td className="px-3 py-3 text-center tabular-nums text-gray-600">{data.summary.totalAssignedBuyers}</td>
                  <td className="px-3 py-3 text-center font-bold text-teal-600 tabular-nums">{data.summary.totalMeetingsFixed}</td>
                  <td colSpan={2} />
                  <td className="px-3 py-3 text-center font-bold text-green-700 tabular-nums">{data.summary.totalTasksCompleted}</td>
                  <td className="px-3 py-3 text-center text-blue-600 tabular-nums">{data.summary.totalTasksOpen}</td>
                  <td className={`px-3 py-3 text-center font-bold tabular-nums ${data.summary.totalTasksOverdue > 0 ? "text-red-600" : "text-gray-300"}`}>
                    {data.summary.totalTasksOverdue}
                  </td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <TablePager page={tablePage} total={data.rows.length} onPage={setTablePage} />
      </div>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────

export function PerformanceClient({ userRole, salesPerson, allSalesPersons, allCountries }: Props) {
  const isSP = userRole === "SALES_PERSON"
  const [tab, setTab] = useState<Tab>("buyers")
  const [coordinators, setCoordinators] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>({
    fy: DEFAULT_FY, fyMonth: "", fyWeek: "", fyQuarter: "",
    country: "", salesPerson: salesPerson ?? "",
    coordinator: "", segment: "", buyer: "",
  })

  // SP role sees only their data — restrict + hide some tabs
  const tabs: { key: Tab; label: string }[] = isSP
    ? [
        { key: "buyers",    label: "👤 Buyer-wise" },
        { key: "countries", label: "🌍 Country-wise" },
        { key: "meetings",  label: "🤝 Meeting Reports" },
      ]
    : [
        { key: "buyers",      label: "👤 Buyer-wise" },
        { key: "countries",   label: "🌍 Country-wise" },
        { key: "salesperson", label: "🧑‍💼 Sales Person" },
        { key: "coordinator", label: "📋 Coordinator" },
        { key: "meetings",    label: "🤝 Meeting Reports" },
      ]

  const onCoordOptions = useCallback((opts: string[]) => setCoordinators(opts), [])

  return (
    <div className="space-y-4">
      <FilterBar
        filters={filters} setFilters={setFilters}
        isSP={isSP}
        allSalesPersons={allSalesPersons}
        allCountries={allCountries}
        coordinators={coordinators}
        activeTab={tab}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t.key
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === "buyers"      && <BuyerTab       filters={filters} />}
      {tab === "countries"   && <CountryTab     filters={filters} />}
      {tab === "salesperson" && !isSP && <SPTab filters={filters} />}
      {tab === "coordinator" && !isSP && <CoordinatorTab filters={filters} onCoordOptions={onCoordOptions} />}
      {tab === "meetings"    && <MeetingReportsTab filters={filters} />}
    </div>
  )
}

// ── Meeting Reports Tab ─────────────────────────────────────────────────────

interface MeetingsKpi {
  totalBuyers: number; meetingsThisFY: number; meetingsThisMonth: number
  meetingsToday: number; overdue: number; dueSoon: number; upcoming: number
}
interface MeetingsSpRow {
  salesPerson: string; monitoredBuyers: number; meetingsDone: number
  overdue: number; dueSoon: number; orderConfirmed: number
}
interface MeetingsTierRow {
  tier: "TIER1" | "TIER2" | "TIER3"
  monitoredBuyers: number; meetingsDone: number; overdue: number; dueSoon: number
}
interface MeetingsMonthly { month: string; label: string; count: number; orderConfirmed: number }
interface RecentMeeting {
  meetingId: string; buyerName: string; country: string; tier: string
  responsiblePerson: string; salesCoordinator: string
  historyId: string; meetingDate: string; outcome: string; notes: string
  completedBy: string; createdAt: string
}
interface MeetingsResponse {
  kpi: MeetingsKpi
  outcomeCounts: Record<string, number>
  bySalesPerson: MeetingsSpRow[]
  byTier: MeetingsTierRow[]
  monthly: MeetingsMonthly[]
  recent: RecentMeeting[]
  meta: { fy: string }
}

const OUTCOME_META: Record<string, { label: string; emoji: string; color: string }> = {
  ORDER_CONFIRMED: { label: "Order Confirmed",  emoji: "🎉", color: "#16a34a" },
  NEGOTIATING:     { label: "Negotiating",      emoji: "💬", color: "#2563eb" },
  AWAITING_PI:     { label: "Awaiting PI",      emoji: "📄", color: "#7c3aed" },
  FOLLOW_UP:       { label: "Follow-up",        emoji: "📅", color: "#d97706" },
  NO_INTEREST:     { label: "No Interest",      emoji: "🚫", color: "#6b7280" },
  OTHER:           { label: "Other",            emoji: "📝", color: "#94a3b8" },
}

const TIER_LABEL_LOCAL: Record<string, string> = {
  TIER1: "Tier 1",
  TIER2: "Tier 2",
  TIER3: "Tier 3",
}

function MeetingReportsTab({ filters }: { filters: Filters }) {
  const [data, setData] = useState<MeetingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [outcomeFilter, setOutcomeFilter] = useState<string>("")
  const [tablePage, setTablePage] = useState(1)
  const [tablePageSize, setTablePageSize] = useState(10)

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (filters.salesPerson) p.set("salesPerson", filters.salesPerson)
    if (outcomeFilter)       p.set("outcome",     outcomeFilter)
    return p.toString()
  }, [filters.salesPerson, outcomeFilter])

  useEffect(() => {
    setLoading(true); setError(null); setTablePage(1)
    fetch(`/api/performance/meetings?${params}`)
      .then(async (r) => {
        if (!r.ok) {
          let msg = `Server returned ${r.status}`
          try { const j = await r.json(); if (j?.error) msg = j.error } catch {}
          throw new Error(msg)
        }
        return r.json()
      })
      .then((d: MeetingsResponse) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false))
  }, [params])

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
      ))}
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
      <p className="font-semibold mb-1">Could not load meeting reports</p>
      <p className="text-xs">{error}</p>
    </div>
  )

  if (!data) return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-700 text-sm">No meeting data available.</div>
  )

  // Show prominent diagnostic banner when meetings are 0 — this is the symptom
  // of a deeper data issue (80/20 sheet not parsing, cache holding empty, etc.)
  const meetingsZeroBanner = data.kpi.totalBuyers === 0 ? (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-amber-900 text-sm space-y-2">
      <p className="font-semibold">⚠️ 0 monitored buyers — meeting data won&apos;t show until this is fixed.</p>
      <p className="text-xs leading-relaxed">
        The 80/20 sheet should contain buyers tagged with Tier 1/2/3. If you just opened the app,
        the first Sheets fetch may have failed silently. Run the diagnostic to see what&apos;s actually being read.
      </p>
      <a
        href="/diagnostics"
        className="inline-flex items-center gap-1.5 mt-1 text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors"
      >
        🩺 Run Data Diagnostics →
      </a>
    </div>
  ) : null

  // Build outcome list sorted by count desc
  const outcomeRows = Object.entries(data.outcomeCounts)
    .map(([key, count]) => ({ key, count, meta: OUTCOME_META[key] ?? OUTCOME_META.OTHER }))
    .sort((a, b) => b.count - a.count)
  const totalOutcomes = outcomeRows.reduce((s, r) => s + r.count, 0)

  // Recent meetings — pagination
  const totalPages = Math.max(1, Math.ceil(data.recent.length / tablePageSize))
  const safePage   = Math.min(tablePage, totalPages)
  const pageRows   = data.recent.slice((safePage - 1) * tablePageSize, safePage * tablePageSize)

  return (
    <div className="space-y-4">
      {meetingsZeroBanner}
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <SummaryCard label="Monitored Buyers" value={data.kpi.totalBuyers} sub={`${data.meta.fy}`} color="bg-white border-gray-200" />
        <SummaryCard label="Meetings (FY)"   value={data.kpi.meetingsThisFY} sub="this financial year" color="bg-blue-50 border-blue-200" />
        <SummaryCard label="This Month"      value={data.kpi.meetingsThisMonth} color="bg-green-50 border-green-200" />
        <SummaryCard label="Today"           value={data.kpi.meetingsToday} color="bg-teal-50 border-teal-200" />
        <SummaryCard label="Overdue"         value={data.kpi.overdue}  color={data.kpi.overdue > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"} />
        <SummaryCard label="Due Soon"        value={data.kpi.dueSoon}  color="bg-amber-50 border-amber-200" />
        <SummaryCard label="Upcoming"        value={data.kpi.upcoming} color="bg-gray-50 border-gray-200" />
      </div>

      {/* Charts: outcome + monthly trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Outcome Distribution</h3>
          {outcomeRows.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={outcomeRows}
                  dataKey="count"
                  nameKey="meta.label"
                  cx="50%" cy="50%"
                  outerRadius={70}
                  innerRadius={40}
                  label={({ payload }: { payload?: typeof outcomeRows[number] }) =>
                    payload ? `${payload.meta.label}: ${payload.count}` : ""
                  }
                >
                  {outcomeRows.map((e) => <Cell key={e.key} fill={e.meta.color} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No meetings logged yet</div>}
          {/* Outcome filter chips */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <button
              onClick={() => setOutcomeFilter("")}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                outcomeFilter === "" ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >All ({totalOutcomes})</button>
            {outcomeRows.map((r) => (
              <button
                key={r.key}
                onClick={() => setOutcomeFilter(outcomeFilter === r.key ? "" : r.key)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  outcomeFilter === r.key ? "text-white border-transparent font-semibold" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
                style={outcomeFilter === r.key ? { backgroundColor: r.meta.color } : {}}
              >
                {r.meta.emoji} {r.meta.label}: {r.count}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Monthly Meeting Trend (last 12 months)</h3>
          {data.monthly.some((m) => m.count > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.monthly} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="count"          name="All Meetings"    fill="#14b8a6" radius={[3,3,0,0]} />
                <Bar dataKey="orderConfirmed" name="Orders Confirmed" fill="#16a34a" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No meetings logged yet</div>}
        </div>
      </div>

      {/* By Tier + By Salesperson side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <h3 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">By Tier</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Tier</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Buyers</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Meetings Done</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Overdue</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Due Soon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.byTier.map((t) => (
                <tr key={t.tier} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{TIER_LABEL_LOCAL[t.tier] ?? t.tier}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.monitoredBuyers}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-green-700">{t.meetingsDone}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${t.overdue > 0 ? "text-red-600 font-bold" : "text-gray-400"}`}>{t.overdue}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${t.dueSoon > 0 ? "text-amber-700 font-semibold" : "text-gray-400"}`}>{t.dueSoon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <h3 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">By Sales Person</h3>
          <div className="max-h-[280px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b border-gray-100">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Sales Person</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Buyers</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Done</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Orders</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.bySalesPerson.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">No data</td></tr>
                ) : data.bySalesPerson.map((r) => (
                  <tr key={r.salesPerson} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-800 truncate max-w-[160px]" title={r.salesPerson}>{r.salesPerson}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.monitoredBuyers}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-green-700">{r.meetingsDone}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">{r.orderConfirmed}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.overdue > 0 ? "text-red-600 font-bold" : "text-gray-400"}`}>{r.overdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent meeting log */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Recent Meeting Log <span className="text-xs text-gray-400 font-normal">({data.recent.length} most recent)</span></h3>
          {outcomeFilter && (
            <span className="text-xs text-gray-500">Filtered by <strong>{OUTCOME_META[outcomeFilter]?.label ?? outcomeFilter}</strong></span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Date</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Buyer</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Tier</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Outcome</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Output / Notes</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pageRows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">No meetings logged yet.</td></tr>
              ) : pageRows.map((r) => {
                const o = OUTCOME_META[r.outcome] ?? OUTCOME_META.OTHER
                return (
                  <tr key={r.historyId} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                      {new Date(r.meetingDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-gray-800 truncate max-w-[200px]">{r.buyerName}</p>
                      <p className="text-[10px] text-gray-400">{r.country}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <TierBadge tier={r.tier as BuyerTier} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap"
                        style={{ backgroundColor: `${o.color}20`, color: o.color, borderColor: `${o.color}40` }}
                      >
                        {o.emoji} {o.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-700 max-w-[320px]">
                      <p className="line-clamp-2 whitespace-pre-wrap">{r.notes || <span className="text-gray-300">—</span>}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.completedBy}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {data.recent.length > tablePageSize && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-500 tabular-nums">
              Showing <strong>{(safePage - 1) * tablePageSize + 1}–{Math.min(safePage * tablePageSize, data.recent.length)}</strong> of <strong>{data.recent.length}</strong>
            </span>
            <div className="flex items-center gap-2">
              <select
                value={tablePageSize}
                onChange={(e) => setTablePageSize(parseInt(e.target.value, 10))}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
              >
                {[10, 25, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
              </select>
              <button
                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
              >← Prev</button>
              <span className="text-xs text-gray-600 tabular-nums">Page <strong>{safePage}</strong> / {totalPages}</span>
              <button
                onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
