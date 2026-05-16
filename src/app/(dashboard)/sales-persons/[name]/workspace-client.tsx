"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { PageHeader } from "@/components/ui/page-header"
import {
  StatusBadge,
  GapCell,
  AchievementBar,
  SegmentTag,
} from "@/components/ui/status-badge"
import { formatNumber } from "@/lib/utils"
import type { PerformanceStatus, BuyerSegment, BuyerTier, PIRecord } from "@/types"

// ─── Types ────────────────────────────────────────────────────────────────────

interface BuyerRow {
  name: string; code: string; actual: number; target: number
  segment: BuyerSegment; isKeyAccount: boolean; country: string
  tier: BuyerTier; achievementPct: number; status: PerformanceStatus
}
interface CountryRow {
  country: string; actual: number; target: number
  achievementPct: number; status: PerformanceStatus
}
interface SalesPersonData {
  salesPerson: {
    name: string
    performance: {
      target: number; actual: number; prevActual: number
      targetDue: number; gap: number; achievementPct: number; status: PerformanceStatus
    }
  }
  summary: {
    totalBuyers: number
    tier1Count: number; tier2Count: number; tier3Count: number; othersCount: number
  }
  buyers: BuyerRow[]
  countries: CountryRow[]
  piHistory: PIRecord[]
  meta: { currentFY: string; currentWeek: number }
}

interface Props { salesPersonName: string; userRole: string; userName: string }

// ─── Pagination helper ────────────────────────────────────────────────────────

function Pager({ page, total, pageSize = 10, onPage }: {
  page: number; total: number; pageSize?: number; onPage: (p: number) => void
}) {
  const pages = Math.ceil(total / pageSize)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/60">
      <button
        onClick={() => onPage(page - 1)} disabled={page === 1}
        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed font-medium"
      >← Prev</button>
      <span className="text-xs text-gray-500">
        Page <span className="font-semibold text-gray-700">{page}</span> of {pages}
        <span className="text-gray-400 ml-1">({total} records)</span>
      </span>
      <button
        onClick={() => onPage(page + 1)} disabled={page >= pages}
        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed font-medium"
      >Next →</button>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color: string
}) {
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-1 shadow-sm ${color}`}>
      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-black text-gray-900 leading-none">{value}</span>
      {sub && <span className="text-xs text-gray-400 font-medium mt-0.5">{sub}</span>}
    </div>
  )
}

// ─── Tier Summary Cards ────────────────────────────────────────────────────────

function TierCards({ summary }: { summary: SalesPersonData["summary"] }) {
  const tiers = [
    {
      label: "Tier 1", count: summary.tier1Count,
      bg: "bg-amber-50 border-amber-200",
      dot: "bg-amber-400", text: "text-amber-700",
      badge: "T1",
    },
    {
      label: "Tier 2", count: summary.tier2Count,
      bg: "bg-blue-50 border-blue-200",
      dot: "bg-blue-400", text: "text-blue-700",
      badge: "T2",
    },
    {
      label: "Tier 3", count: summary.tier3Count,
      bg: "bg-emerald-50 border-emerald-200",
      dot: "bg-emerald-400", text: "text-emerald-700",
      badge: "T3",
    },
    {
      label: "Others", count: summary.othersCount,
      bg: "bg-gray-50 border-gray-200",
      dot: "bg-gray-400", text: "text-gray-600",
      badge: "OT",
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {tiers.map((t) => (
        <div key={t.label}
          className={`rounded-2xl border ${t.bg} p-4 flex items-center gap-3 shadow-sm`}
        >
          <div className={`w-10 h-10 rounded-xl ${t.dot} flex items-center justify-center flex-shrink-0`}>
            <span className="text-white text-xs font-black">{t.badge}</span>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">{t.label}</p>
            <p className={`text-2xl font-black leading-tight ${t.text}`}>{t.count}</p>
            <p className="text-[10px] text-gray-400">buyers</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Buyers Tab ───────────────────────────────────────────────────────────────

function BuyersTab({ buyers, week }: { buyers: BuyerRow[]; week: number }) {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const PAGE = 10
  const sliced = buyers.slice((page - 1) * PAGE, page * PAGE)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-8">#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Buyer Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Country</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tier</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Segment</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[130px]">Achievement</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sliced.map((b, i) => (
              <tr key={b.code}
                onClick={() => router.push(`/buyers/${encodeURIComponent(b.code)}`)}
                className="hover:bg-green-50/40 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">{(page - 1) * PAGE + i + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <SegmentTag segment={b.segment} isKeyAccount={b.isKeyAccount} />
                    <span className="font-semibold text-gray-800 hover:text-green-700 text-sm">{b.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">{b.country}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${
                    b.tier === "TIER1" ? "bg-amber-100 text-amber-800 border-amber-200" :
                    b.tier === "TIER2" ? "bg-blue-100 text-blue-800 border-blue-200" :
                    b.tier === "TIER3" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                    "bg-gray-100 text-gray-500 border-gray-200"
                  }`}>
                    {b.tier === "TIER1" ? "T1" : b.tier === "TIER2" ? "T2" : b.tier === "TIER3" ? "T3" : "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    b.segment === "VIP" ? "bg-violet-100 text-violet-700" :
                    b.segment === "STRATEGIC" ? "bg-orange-100 text-orange-700" :
                    b.segment === "GROWTH" ? "bg-blue-100 text-blue-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{b.segment}</span>
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-gray-500 text-sm">{formatNumber(b.target, 0)}</td>
                <td className="px-4 py-3 text-center tabular-nums font-bold text-gray-900 text-sm">{formatNumber(b.actual)}</td>
                <td className="px-4 py-3">
                  <AchievementBar pct={b.achievementPct} status={b.status} />
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={b.status} />
                </td>
              </tr>
            ))}
            {buyers.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">No buyers found</td></tr>
            )}
          </tbody>
          {buyers.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-sm">
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-gray-700 text-xs uppercase tracking-wide" colSpan={4}>
                  Total ({buyers.length} buyers)
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-gray-600">
                  {formatNumber(buyers.reduce((s, b) => s + b.target, 0), 0)}
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-gray-900">
                  {formatNumber(buyers.reduce((s, b) => s + b.actual, 0))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <Pager page={page} total={buyers.length} pageSize={PAGE} onPage={setPage} />
    </div>
  )
}

// ─── Order History Tab ────────────────────────────────────────────────────────

function OrderHistoryTab({ piHistory }: { piHistory: PIRecord[] }) {
  const [page, setPage] = useState(1)
  const PAGE = 10
  const sliced = piHistory.slice((page - 1) * PAGE, page * PAGE)

  function formatPIDate(d: string) {
    try {
      return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    } catch { return d }
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-8">#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">PI No.</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Buyer</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Country</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Variety</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty (MT)</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Containers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sliced.map((pi, i) => (
              <tr key={`${pi.piNumber}-${i}`} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">{(page - 1) * PAGE + i + 1}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500 font-medium">{pi.piNumber || "—"}</td>
                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatPIDate(pi.piDate)}</td>
                <td className="px-4 py-3 font-semibold text-gray-800 text-sm">{pi.buyerCompanyName}</td>
                <td className="px-4 py-3">
                  <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">{pi.countries}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    pi.varieties === "BASMATI" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"
                  }`}>{pi.varieties || "—"}</span>
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-gray-600 font-medium">{pi.qtyMTs?.toFixed(1) ?? "—"}</td>
                <td className="px-4 py-3 text-center tabular-nums font-bold text-gray-900">{pi.totalContainers}</td>
              </tr>
            ))}
            {piHistory.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">No orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={piHistory.length} pageSize={PAGE} onPage={setPage} />
    </div>
  )
}

// ─── Market Distribution Tab ──────────────────────────────────────────────────

function MarketTab({ countries }: { countries: CountryRow[] }) {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const PAGE = 10
  const sliced = countries.slice((page - 1) * PAGE, page * PAGE)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-8">#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Country</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[140px]">Achievement</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sliced.map((c, i) => (
              <tr key={c.country}
                onClick={() => router.push(`/countries/${encodeURIComponent(c.country)}`)}
                className="hover:bg-green-50/40 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">{(page - 1) * PAGE + i + 1}</td>
                <td className="px-4 py-3 font-semibold text-gray-800 text-sm hover:text-green-700">{c.country}</td>
                <td className="px-4 py-3 text-center tabular-nums text-gray-500 text-sm font-medium">{formatNumber(c.target, 0)}</td>
                <td className="px-4 py-3 text-center tabular-nums font-bold text-gray-900 text-sm">{formatNumber(c.actual)}</td>
                <td className="px-4 py-3">
                  <AchievementBar pct={c.achievementPct} status={c.status} />
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={c.status} />
                </td>
              </tr>
            ))}
            {countries.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">No country data found</td></tr>
            )}
          </tbody>
          {countries.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-sm">
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-gray-700 text-xs uppercase tracking-wide">Total ({countries.length})</td>
                <td className="px-4 py-3 text-center tabular-nums text-gray-600">
                  {formatNumber(countries.reduce((s, c) => s + c.target, 0), 0)}
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-gray-900">
                  {formatNumber(countries.reduce((s, c) => s + c.actual, 0))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <Pager page={page} total={countries.length} pageSize={PAGE} onPage={setPage} />
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function SalesPersonWorkspaceClient({ salesPersonName }: Props) {
  const router = useRouter()
  const [data, setData] = useState<SalesPersonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<"buyers" | "history" | "countries">("buyers")

  useEffect(() => {
    fetch(`/api/sales-persons/${encodeURIComponent(salesPersonName)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load workspace")
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [salesPersonName])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-400">Loading workspace…</p>
      </div>
    </div>
  )
  if (error || !data) return (
    <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl text-sm">
      {error || "Data not found"}
    </div>
  )

  const { salesPerson, summary, buyers, countries, piHistory, meta } = data
  const perf = salesPerson.performance

  const TABS = [
    { id: "buyers",    label: "Client Portfolio",   icon: "👤", count: buyers.length },
    { id: "history",   label: "Order History",      icon: "📋", count: piHistory.length },
    { id: "countries", label: "Market Distribution",icon: "🌍", count: countries.length },
  ] as const

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors flex-shrink-0"
        >←</button>
        <div>
          <h1 className="text-2xl font-black text-gray-900">{salesPerson.name}</h1>
          <p className="text-sm text-gray-400 font-medium">
            Sales Person Workspace · FY {meta.currentFY} · Week {meta.currentWeek}
          </p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard label="Annual Target"  value={formatNumber(perf.target, 0)}    sub="containers"               color="bg-white border-gray-200" />
        <KpiCard label="Actual Sales"   value={formatNumber(perf.actual)}        sub={`${perf.achievementPct}% achieved`} color="bg-green-50 border-green-200" />
        <KpiCard label="Target Due"     value={formatNumber(perf.targetDue)}     sub={`till W${meta.currentWeek}`}        color="bg-blue-50 border-blue-200" />
        <div className="rounded-2xl border bg-white border-gray-200 p-4 shadow-sm flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Gap to Target</span>
          <GapCell gap={perf.gap} className="text-2xl font-black" />
          <StatusBadge status={perf.status} />
        </div>
        <KpiCard label="Prev Year"      value={formatNumber(perf.prevActual)}   sub="historical"               color="bg-gray-50 border-gray-200" />
      </div>

      {/* Tier Summary */}
      <TierCards summary={summary} />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium flex items-center gap-1.5 transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              tab === t.id ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {tab === "buyers"    && <BuyersTab      buyers={buyers}       week={meta.currentWeek} />}
        {tab === "history"   && <OrderHistoryTab piHistory={piHistory} />}
        {tab === "countries" && <MarketTab       countries={countries} />}
      </div>
    </div>
  )
}
