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
  pis?: number; isNew?: boolean
}
interface CountryRow {
  country: string; actual: number; target: number
  achievementPct: number; status: PerformanceStatus
  nbd?: number; crr?: number; pis?: number; buyers?: number
}
interface OrderMix {
  pis: number; mts: number; countries: number
  nbdCtrs: number; nbdPIs: number; nbdBuyers: number
  crrCtrs: number; crrPIs: number; crrBuyers: number
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
  mix?: OrderMix
  view?: "pi" | "owner"
  buyers: BuyerRow[]
  countries: CountryRow[]
  piHistory: PIRecord[]
  meta: { currentFY: string; currentWeek: number }
}

interface Props { salesPersonName: string; userRole: string; userName: string; view?: string }

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
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">NBD / CRR</th>
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
                <td className="px-4 py-3 text-center">
                  {b.actual > 0 ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${b.isNew ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                      {b.isNew ? "NBD" : "CRR"}
                    </span>
                  ) : <span className="text-xs text-gray-300">—</span>}
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
              <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400 text-sm">No buyers found</td></tr>
            )}
          </tbody>
          {buyers.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-sm">
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-gray-700 text-xs uppercase tracking-wide" colSpan={5}>
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
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">NBD</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">CRR</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">PIs</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Buyers</th>
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
                <td className="px-4 py-3 text-center tabular-nums text-green-700 font-semibold text-sm">{formatNumber(c.nbd ?? 0)}</td>
                <td className="px-4 py-3 text-center tabular-nums text-blue-700 font-semibold text-sm">{formatNumber(c.crr ?? 0)}</td>
                <td className="px-4 py-3 text-center tabular-nums text-gray-600 text-sm">{c.pis ?? 0}</td>
                <td className="px-4 py-3 text-center tabular-nums text-gray-600 text-sm">{c.buyers ?? 0}</td>
                <td className="px-4 py-3">
                  <AchievementBar pct={c.achievementPct} status={c.status} />
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={c.status} />
                </td>
              </tr>
            ))}
            {countries.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400 text-sm">No country data found</td></tr>
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
                <td className="px-4 py-3 text-center tabular-nums text-green-700">{formatNumber(countries.reduce((s, c) => s + (c.nbd ?? 0), 0))}</td>
                <td className="px-4 py-3 text-center tabular-nums text-blue-700">{formatNumber(countries.reduce((s, c) => s + (c.crr ?? 0), 0))}</td>
                <td className="px-4 py-3 text-center tabular-nums text-gray-600">{countries.reduce((s, c) => s + (c.pis ?? 0), 0)}</td>
                <td className="px-4 py-3 text-center tabular-nums text-gray-600">{countries.reduce((s, c) => s + (c.buyers ?? 0), 0)}</td>
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

export function SalesPersonWorkspaceClient({ salesPersonName, view }: Props) {
  const router = useRouter()
  const [data, setData] = useState<SalesPersonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<"buyers" | "history" | "countries">("buyers")

  useEffect(() => {
    fetch(`/api/sales-persons/${encodeURIComponent(salesPersonName)}${view === "owner" ? "?view=owner" : ""}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load workspace")
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [salesPersonName, view])

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

  const { salesPerson, summary, buyers, countries, piHistory, meta, mix } = data
  const perf = salesPerson.performance

  const TABS = [
    { id: "buyers",    label: "Client Portfolio",   icon: "👤", count: buyers.length },
    { id: "history",   label: "Order History",      icon: "📋", count: piHistory.length },
    { id: "countries", label: "Market Distribution",icon: "🌍", count: countries.length },
  ] as const

  const isOwnerView = data.view === "owner"
  const goBack = () => {
    // Go to the page we came from; if the workspace was opened directly (new tab,
    // shared link) fall back to the matching Target vs Actual tab.
    const sameSite = document.referrer.startsWith(window.location.origin)
    if (sameSite && window.history.length > 1) router.back()
    else router.push(`/targets?tab=${isOwnerView ? "salesperson" : "pisales"}`)
  }
  const pacePct = perf.targetDue > 0 ? Math.round((perf.actual / perf.targetDue) * 100) : 0
  const barPct  = Math.max(0, Math.min(100, pacePct))
  const mixTot  = mix ? mix.nbdCtrs + mix.crrCtrs : 0
  const nbdPct  = mix && mixTot > 0 ? Math.round((mix.nbdCtrs / mixTot) * 100) : 0
  const tiers   = [
    { k: "T1", n: summary.tier1Count, c: "bg-amber-100 text-amber-800" },
    { k: "T2", n: summary.tier2Count, c: "bg-blue-100 text-blue-800" },
    { k: "T3", n: summary.tier3Count, c: "bg-emerald-100 text-emerald-800" },
    { k: "Others", n: summary.othersCount, c: "bg-gray-100 text-gray-600" },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <button
            onClick={goBack}
            title="Back"
            className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors flex-shrink-0"
          >←</button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">{salesPerson.name}</h1>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${isOwnerView ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"}`}>
                {isOwnerView ? "Responsible Person" : "Sales Person (PI)"}
              </span>
              <StatusBadge status={perf.status} />
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              FY {meta.currentFY} · Week {meta.currentWeek} ·{" "}
              {isOwnerView ? "all orders of the buyers this person is responsible for" : "orders booked by this person on the PI"}
            </p>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span><b className="text-gray-900 text-sm">{formatNumber(perf.actual)}</b> of {formatNumber(perf.targetDue)} due till W{meta.currentWeek}</span>
                <span className="font-semibold text-gray-700">{perf.targetDue > 0 ? `${pacePct}% of pace` : "no target"}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barPct >= 100 ? "bg-green-500" : barPct >= 70 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${barPct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard label="Annual Target" value={formatNumber(perf.target, 0)} sub="containers"                      color="bg-white border-gray-200" />
        <KpiCard label="Target Due"    value={formatNumber(perf.targetDue)} sub={`till W${meta.currentWeek}`}       color="bg-white border-gray-200" />
        <KpiCard label="Actual"        value={formatNumber(perf.actual)}    sub={`${perf.achievementPct}% of year`} color="bg-green-50 border-green-200" />
        <div className="rounded-2xl border bg-white border-gray-200 p-4 shadow-sm flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Gap to Due</span>
          <GapCell gap={perf.gap} className="text-2xl font-black" />
          <span className="text-xs text-gray-400">containers</span>
        </div>
        <KpiCard label="Prev Year"     value={formatNumber(perf.prevActual)} sub="full year"                       color="bg-white border-gray-200" />
      </div>

      {/* Order mix — NBD vs CRR, PIs, countries, tiers */}
      {mix && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2 text-sm">
            <span className="font-semibold text-gray-800">Order mix this FY</span>
            <span className="text-xs text-gray-500">
              <b className="text-gray-800">{mix.pis}</b> PIs · <b className="text-gray-800">{formatNumber(mix.mts, 0)}</b> MT · <b className="text-gray-800">{mix.countries}</b> countries
            </span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
            <div className="h-full bg-green-500" style={{ width: `${nbdPct}%` }} title={`NBD ${nbdPct}%`} />
            <div className="h-full bg-blue-500" style={{ width: `${mixTot > 0 ? 100 - nbdPct : 0}%` }} title={`CRR ${100 - nbdPct}%`} />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
              <div>
                <div className="text-xs text-gray-500">NBD · new buyers</div>
                <div><b className="text-lg text-gray-900">{formatNumber(mix.nbdCtrs)}</b> <span className="text-xs text-gray-500">ctrs · {mix.nbdPIs} PIs · {mix.nbdBuyers} buyers</span></div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <div>
                <div className="text-xs text-gray-500">CRR · repeat buyers</div>
                <div><b className="text-lg text-gray-900">{formatNumber(mix.crrCtrs)}</b> <span className="text-xs text-gray-500">ctrs · {mix.crrPIs} PIs · {mix.crrBuyers} buyers</span></div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-500">Buyers by tier:</span>
            {tiers.map((t) => (
              <span key={t.k} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.c}`}>{t.k} · {t.n}</span>
            ))}
          </div>
        </div>
      )}

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
