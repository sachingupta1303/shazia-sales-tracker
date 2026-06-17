"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { FilterBar, type FilterState } from "@/components/ui/filter-bar"
import { StatusBadge, TierBadge, GapCell, AchievementBar, SegmentTag } from "@/components/ui/status-badge"
import { SummaryCard } from "@/components/ui/page-header"
import { formatNumber } from "@/lib/utils"
import type { UserRole, CountryPerformance, BuyerPerformance, SalesPersonPerformance } from "@/types"

// ── Total helpers ────────────────────────────────────────────────────────────
function sumField<T>(rows: T[], field: keyof T): number {
  return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0)
}

// ── 3-state status (pace-adjusted: achievement % = actual ÷ due-till-now) ───────
//   Achieved ≥ 100% · On Track 70–99% · Critical < 70% · No Target (no target set)
type St3 = "ACHIEVED" | "ON_TRACK" | "CRITICAL" | "NO_TARGET"
function deriveStatus3(r: { target: number; achievementPercent: number }): St3 {
  if (!r.target || r.target <= 0) return "NO_TARGET"
  const p = r.achievementPercent
  if (p >= 100) return "ACHIEVED"
  if (p >= 70)  return "ON_TRACK"
  return "CRITICAL"
}
const ST3_STYLE: Record<St3, string> = {
  ACHIEVED:  "bg-green-100 text-green-700",
  ON_TRACK:  "bg-amber-100 text-amber-700",
  CRITICAL:  "bg-red-100 text-red-600",
  NO_TARGET: "bg-gray-100 text-gray-500",
}
const ST3_LABEL: Record<St3, string> = {
  ACHIEVED: "✓ Achieved", ON_TRACK: "On Track", CRITICAL: "✕ Critical", NO_TARGET: "No Target",
}
function StatusBadge3({ row }: { row: { target: number; achievementPercent: number } }) {
  const s = deriveStatus3(row)
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${ST3_STYLE[s]}`}>{ST3_LABEL[s]}</span>
}

type Tab = "country" | "buyer" | "salesperson"

interface Props { userRole?: UserRole; salesPerson?: string }

// ── Tab Button ────────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active ? "bg-green-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  )
}

// ── Country Table ─────────────────────────────────────────────────────────────
function CountryTable({ rows, week }: { rows: CountryPerformance[]; week: number }) {
  const router = useRouter()
  const totalGap = sumField(rows, "gap")
  const [page, setPage] = useState(1)
  const paginatedRows = rows.slice((page - 1) * 10, page * 10)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Country</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prev Year</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Due W{week}</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gap</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Achievement</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Buyers</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {paginatedRows.map((r, i) => (
            <tr
              key={r.country}
              onClick={() => router.push(`/countries/${encodeURIComponent(r.country)}`)}
              className="hover:bg-green-50 cursor-pointer transition-colors"
            >
              <td className="px-3 py-3 text-gray-400 tabular-nums text-center">{(page - 1) * 10 + i + 1}</td>
              <td className="px-4 py-3 font-semibold text-gray-800 hover:text-green-700 hover:underline">
                <div className="flex items-center gap-1.5">
                  {r.isDreamMarket && <span className="text-amber-500 font-bold" title="Dream Market">🌟</span>}
                  <span>{r.country}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-gray-500 tabular-nums text-center">{formatNumber(r.previousYear)}</td>
              <td className="px-4 py-3 text-gray-700 tabular-nums text-center font-medium">{formatNumber(r.target, 0)}</td>
              <td className="px-4 py-3 text-gray-600 tabular-nums text-center">{formatNumber(r.targetDue)}</td>
              <td className="px-4 py-3 font-bold text-gray-900 tabular-nums text-center">{formatNumber(r.actual)}</td>
              <td className="px-4 py-3 text-center"><GapCell gap={r.gap} /></td>
              <td className="px-4 py-3 min-w-[120px]"><AchievementBar pct={r.achievementPercent} status={r.status} /></td>
              <td className="px-4 py-3 text-center text-gray-500 text-xs">{r.activeBuyers}/{r.totalBuyers}</td>
              <td className="px-4 py-3 text-center"><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
              <td className="px-3 py-3" />
              <td className="px-4 py-3 text-gray-800 uppercase text-xs tracking-wide">Grand Total</td>
              <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatNumber(sumField(rows, "previousYear"))}</td>
              <td className="px-4 py-3 text-right text-gray-800 tabular-nums">{formatNumber(sumField(rows, "target"), 0)}</td>
              <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatNumber(sumField(rows, "targetDue"))}</td>
              <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{formatNumber(sumField(rows, "actual"))}</td>
              <td className={`px-4 py-3 text-right tabular-nums ${totalGap >= 0 ? "text-green-700" : "text-red-700"}`}>
                {(totalGap >= 0 ? "+" : "") + formatNumber(totalGap)}
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-center text-xs text-gray-500">
                {sumField(rows, "activeBuyers")}/{sumField(rows, "totalBuyers")}
              </td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        )}
      </table>
      {rows.length > 10 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
          >← Prev</button>
          <span className="text-xs text-gray-500">
            Page {page} of {Math.ceil(rows.length / 10)}
          </span>
          <button
            onClick={() => setPage(p => Math.min(Math.ceil(rows.length / 10), p + 1))}
            disabled={page === Math.ceil(rows.length / 10)}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
          >Next →</button>
        </div>
      )}
    </div>
  )
}

// ── Buyer Table ───────────────────────────────────────────────────────────────
function BuyerTable({ rows, week, showSP }: { rows: BuyerPerformance[]; week: number; showSP: boolean }) {
  const router = useRouter()
  const totalGap = sumField(rows, "gap")
  const [page, setPage] = useState(1)
  const paginatedRows = rows.slice((page - 1) * 10, page * 10)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[150px]">Buyer</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Country</th>
            {showSP && <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sales Person</th>}
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tier</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Prev Year</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Target</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Due W{week}</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Actual</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gap</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Achievement</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {paginatedRows.map((r, i) => (
            <tr
              key={`${r.buyerCode}-${i}`}
              onClick={() => router.push(`/buyers/${encodeURIComponent(r.buyerCode || r.buyerName)}`)}
              className="hover:bg-green-50 cursor-pointer transition-colors"
            >
              <td className="px-3 py-3 text-gray-400 tabular-nums text-center">{(page - 1) * 10 + i + 1}</td>
              <td className="px-4 py-3 text-gray-800 text-left">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 hover:text-green-700 font-bold">
                    <SegmentTag segment={r.segment} isKeyAccount={r.isKeyAccount} />
                    <span className="truncate">{r.buyerName}</span>
                  </div>
                </div>
                {r.lastOrderDate && (
                  <div className="text-[10px] text-gray-400 font-normal">Last: {r.lastOrderDate}</div>
                )}
              </td>
              <td className="px-4 py-3 text-left">
                <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{r.country}</span>
              </td>
              {showSP && (
                <td className="px-4 py-3 text-gray-600 text-xs text-left">
                  <a 
                    href={`/sales-persons/${encodeURIComponent(r.salesPerson)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-green-700 hover:underline"
                  >
                    {r.salesPerson}
                  </a>
                </td>
              )}
              <td className="px-4 py-3 text-center"><TierBadge tier={r.tier} /></td>
              <td className="px-4 py-3 text-gray-500 tabular-nums text-center">{formatNumber(r.previousYear)}</td>
              <td className="px-4 py-3 text-gray-700 tabular-nums text-center font-medium">{formatNumber(r.target, 0)}</td>
              <td className="px-4 py-3 text-gray-600 tabular-nums text-center">{formatNumber(r.targetDue)}</td>
              <td className="px-4 py-3 font-bold text-gray-900 tabular-nums text-center">{formatNumber(r.actual)}</td>
              <td className="px-4 py-3 text-center"><GapCell gap={r.gap} /></td>
              <td className="px-4 py-3 min-w-[120px]"><AchievementBar pct={r.achievementPercent} status={r.status} /></td>
              <td className="px-4 py-3 text-center"><StatusBadge3 row={r} /></td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
              <td className="px-3 py-3" />
              <td className="px-4 py-3 text-gray-800 uppercase text-xs tracking-wide" colSpan={showSP ? 4 : 3}>
                Grand Total ({rows.length} buyers)
              </td>
              <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatNumber(sumField(rows, "previousYear"))}</td>
              <td className="px-4 py-3 text-right text-gray-800 tabular-nums">{formatNumber(sumField(rows, "target"), 0)}</td>
              <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatNumber(sumField(rows, "targetDue"))}</td>
              <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{formatNumber(sumField(rows, "actual"))}</td>
              <td className={`px-4 py-3 text-right tabular-nums ${totalGap >= 0 ? "text-green-700" : "text-red-700"}`}>
                {(totalGap >= 0 ? "+" : "") + formatNumber(totalGap)}
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        )}
      </table>
      {rows.length > 10 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
          >← Prev</button>
          <span className="text-xs text-gray-500">
            Page {page} of {Math.ceil(rows.length / 10)}
          </span>
          <button
            onClick={() => setPage(p => Math.min(Math.ceil(rows.length / 10), p + 1))}
            disabled={page === Math.ceil(rows.length / 10)}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
          >Next →</button>
        </div>
      )}
    </div>
  )
}

// ── SP Table ──────────────────────────────────────────────────────────────────
function SPTable({ rows, week }: { rows: SalesPersonPerformance[]; week: number }) {
  const router = useRouter()
  const totalGap = sumField(rows, "gap")
  const [page, setPage] = useState(1)
  const paginatedRows = rows.slice((page - 1) * 10, page * 10)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sales Person</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prev Year</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Due W{week}</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gap</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Achievement</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Buyers</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {paginatedRows.map((r, i) => (
            <tr
              key={r.salesPerson}
              className="hover:bg-green-50 transition-colors group cursor-pointer"
              onClick={() => router.push(`/sales-persons/${encodeURIComponent(r.salesPerson)}`)}
            >
              <td className="px-3 py-3 text-gray-400 tabular-nums text-center">{(page - 1) * 10 + i + 1}</td>
              <td className="px-4 py-3 font-bold text-gray-800 group-hover:text-green-700">{r.salesPerson}</td>
              <td className="px-4 py-3 text-gray-500 tabular-nums text-center">{formatNumber(r.previousYear)}</td>
              <td className="px-4 py-3 text-gray-800 tabular-nums text-center font-bold">{formatNumber(r.target, 0)}</td>
              <td className="px-4 py-3 text-gray-600 tabular-nums text-center">{formatNumber(r.targetDue)}</td>
              <td className="px-4 py-3 font-black text-gray-900 tabular-nums text-center">{formatNumber(r.actual)}</td>
              <td className="px-4 py-3 text-center"><GapCell gap={r.gap} /></td>
              <td className="px-4 py-3 min-w-[120px]"><AchievementBar pct={r.achievementPercent} status={r.status} /></td>
              <td className="px-4 py-3 text-center text-gray-500 text-xs font-medium">{r.activeBuyers}</td>
              <td className="px-4 py-3 text-center"><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
              <td className="px-3 py-3" />
              <td className="px-4 py-3 text-gray-800 uppercase text-xs tracking-wide text-left">Grand Total</td>
              <td className="px-4 py-3 text-center text-gray-700 tabular-nums">{formatNumber(sumField(rows, "previousYear"))}</td>
              <td className="px-4 py-3 text-center text-gray-800 tabular-nums">{formatNumber(sumField(rows, "target"), 0)}</td>
              <td className="px-4 py-3 text-center text-gray-700 tabular-nums">{formatNumber(sumField(rows, "targetDue"))}</td>
              <td className="px-4 py-3 text-center text-gray-900 tabular-nums">{formatNumber(sumField(rows, "actual"))}</td>
              <td className={`px-4 py-3 text-center tabular-nums ${totalGap >= 0 ? "text-green-700" : "text-red-700"}`}>
                {(totalGap >= 0 ? "+" : "") + formatNumber(totalGap)}
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-center text-xs text-gray-500">{sumField(rows, "activeBuyers")}</td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        )}
      </table>
      {rows.length > 10 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
          >← Prev</button>
          <span className="text-xs text-gray-500">
            Page {page} of {Math.ceil(rows.length / 10)}
          </span>
          <button
            onClick={() => setPage(p => Math.min(Math.ceil(rows.length / 10), p + 1))}
            disabled={page === Math.ceil(rows.length / 10)}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
          >Next →</button>
        </div>
      )}
    </div>
  )
}

// ── Mobile Card ───────────────────────────────────────────────────────────────
function MobilePerformanceCard({
  title, sub, target, actual, gap, pct, status, badge,
}: {
  title: string; sub?: string; target: number; actual: number;
  gap: number; pct: number; status: any; badge?: React.ReactNode
}) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-800 text-sm">{title}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
        {badge}
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div><p className="text-gray-400">Target</p><p className="font-semibold">{formatNumber(target, 0)}</p></div>
        <div><p className="text-gray-400">Actual</p><p className="font-bold text-gray-900">{formatNumber(actual)}</p></div>
        <div><p className="text-gray-400">Gap</p><GapCell gap={gap} /></div>
      </div>
      <AchievementBar pct={pct} status={status} />
      <StatusBadge status={status} />
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function TargetsClient({ userRole, salesPerson }: Props) {
  const [tab,      setTab]     = useState<Tab>("country")
  const [filters,    setFilters]    = useState<FilterState>({})
  const [tierFilter, setTierFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("")  // "" | ACHIEVED | ON_TRACK | CRITICAL
  const [loading,  setLoading] = useState(true)
  const [error,    setError]   = useState("")
  const [options,  setOptions] = useState<{ countries: string[]; salesPersons: string[] }>({ countries: [], salesPersons: [] })

  const [countryData, setCountryData] = useState<{ rows: CountryPerformance[]; meta: any } | null>(null)
  const [buyerData,   setBuyerData]   = useState<{ rows: BuyerPerformance[];   summary: any; meta: any } | null>(null)
  const [spData,      setSPData]      = useState<{ rows: SalesPersonPerformance[]; meta: any } | null>(null)

  const isSP = userRole === "SALES_PERSON"

  const buildParams = useCallback((f: FilterState) => {
    const p = new URLSearchParams()
    if (f.country)     p.set("country",     f.country)
    if (f.salesPerson) p.set("salesPerson", f.salesPerson)
    if (f.fy)          p.set("fy",          f.fy)
    return p.toString()
  }, [])

  const fetchTab = useCallback(async (t: Tab, f: FilterState) => {
    setLoading(true); setError("")
    const qs = buildParams(f)
    try {
      if (t === "country") {
        const res = await fetch(`/api/performance/countries?${qs}`)
        const d   = await res.json()
        setCountryData(d)
        const ctrs: string[] = d.rows.map((r: any) => r.country as string)
        setOptions((o) => ({ ...o, countries: Array.from(new Set(ctrs)) }))
      } else if (t === "buyer") {
        const res = await fetch(`/api/performance/buyers?${qs}`)
        const d   = await res.json()
        setBuyerData(d)
      } else {
        const res = await fetch(`/api/performance/salesperson?${qs}`)
        const d   = await res.json()
        setSPData(d)
      }
    } catch { setError("Failed to load data.") }
    finally  { setLoading(false) }
  }, [buildParams])

  useEffect(() => { fetchTab(tab, filters) }, [tab, filters, fetchTab])

  const week = countryData?.meta?.week ?? buyerData?.meta?.week ?? spData?.meta?.week ?? 6

  // Client-side tier + status filters — applied after data loads
  const filteredBuyerRows = (buyerData?.rows ?? []).filter(
    (r) => (!tierFilter || r.tier === tierFilter)
        && (!statusFilter || deriveStatus3(r) === statusFilter)
  )

  // Summary cards always reflect the filtered rows (client-side)
  const filteredSummary = tab === "buyer" && buyerData
    ? {
        totalTarget: sumField(filteredBuyerRows, "target"),
        totalActual: sumField(filteredBuyerRows, "actual"),
        achieved:    filteredBuyerRows.filter((r) => deriveStatus3(r) === "ACHIEVED").length,
        onTrack:     filteredBuyerRows.filter((r) => deriveStatus3(r) === "ON_TRACK").length,
        critical:    filteredBuyerRows.filter((r) => deriveStatus3(r) === "CRITICAL").length,
        buyerCount:  filteredBuyerRows.length,
      }
    : null

  const tierLabel = tierFilter === "TIER1" ? "Tier 1" : tierFilter === "TIER2" ? "Tier 2" : tierFilter === "TIER3" ? "Tier 3" : tierFilter === "OTHERS" ? "Others" : "All"

  const summary = filteredSummary
    ? [
        { label: "Total Target",        value: formatNumber(filteredSummary.totalTarget, 0), color: "bg-purple-50 border-purple-200" },
        { label: "Total Actual",        value: formatNumber(filteredSummary.totalActual),    color: "bg-green-50 border-green-200"  },
        { label: "✓ Achieved",          value: filteredSummary.achieved,                     color: "bg-green-50 border-green-200"  },
        { label: "On Track",            value: filteredSummary.onTrack,                      color: "bg-amber-50 border-amber-200"  },
        { label: "✕ Critical",          value: filteredSummary.critical,                     color: "bg-red-50 border-red-200"      },
        { label: `${tierLabel} Buyers`, value: filteredSummary.buyerCount,                   color: "bg-blue-50 border-blue-200"    },
      ]
    : null

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1.5 shadow-sm w-fit">
        <TabBtn active={tab === "country"}    onClick={() => setTab("country")}>🌍 By Country</TabBtn>
        <TabBtn active={tab === "buyer"}      onClick={() => setTab("buyer")}>👤 By Buyer</TabBtn>
        {!isSP && (
          <TabBtn active={tab === "salesperson"} onClick={() => setTab("salesperson")}>👥 By Sales Person</TabBtn>
        )}
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onChange={(f) => setFilters(f)}
        options={options}
        showFY={true}
        showVariety={false}
        showSP={!isSP && tab !== "salesperson"}
      />

      {/* Buyer tab — tier filter pills */}
      {tab === "buyer" && (
        <div className="flex gap-2 flex-wrap">
          {([
            { val: "",       label: "All Tiers" },
            { val: "TIER1",  label: "Tier 1" },
            { val: "TIER2",  label: "Tier 2" },
            { val: "TIER3",  label: "Tier 3" },
            { val: "OTHERS", label: "Others" },
          ] as const).map(({ val, label }) => (
            <button
              key={val || "all"}
              onClick={() => setTierFilter(val)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                tierFilter === val
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Buyer tab — status filter pills */}
      {tab === "buyer" && (
        <div className="flex gap-2 flex-wrap">
          {([
            { val: "",         label: "All Status", active: "bg-gray-800 text-white border-gray-800" },
            { val: "ACHIEVED", label: "✓ Achieved", active: "bg-green-600 text-white border-green-600" },
            { val: "ON_TRACK", label: "On Track",   active: "bg-amber-500 text-white border-amber-500" },
            { val: "CRITICAL", label: "✕ Critical", active: "bg-red-600 text-white border-red-600" },
          ] as const).map(({ val, label, active }) => (
            <button
              key={val || "allstatus"}
              onClick={() => setStatusFilter(val)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                statusFilter === val ? active : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Summary cards (buyer tab) */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {summary.map((s) => <SummaryCard key={s.label} {...s} />)}
        </div>
      )}

      {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">{error}</div>}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">
            {loading ? "Loading…" : (
              tab === "country" ? `${countryData?.rows.length ?? 0} countries` :
              tab === "buyer"   ? `${filteredBuyerRows.length} buyers`    :
                                  `${spData?.rows.length     ?? 0} sales persons`
            )}
          </span>
          <span className="text-xs text-gray-400">FY Week {week}</span>
        </div>

        {/* Desktop tables */}
        {!loading && (
          <>
            {tab === "country"    && countryData && <div className="hidden md:block"><CountryTable rows={countryData.rows} week={week} /></div>}
            {tab === "buyer"      && buyerData   && <div className="hidden md:block"><BuyerTable   rows={filteredBuyerRows} week={week} showSP={!isSP} /></div>}
            {tab === "salesperson"&& spData       && <div className="hidden md:block"><SPTable      rows={spData.rows}      week={week} /></div>}
          </>
        )}

        {/* Mobile cards */}
        {!loading && (
          <div className="md:hidden divide-y divide-gray-100">
            {tab === "country" && countryData?.rows.map((r) => (
              <MobilePerformanceCard key={r.country} title={r.country}
                sub={`${r.activeBuyers} active buyers`}
                target={r.target} actual={r.actual} gap={r.gap}
                pct={r.achievementPercent} status={r.status} />
            ))}
            {tab === "buyer" && filteredBuyerRows.map((r, i) => (
              <MobilePerformanceCard key={i} title={r.buyerName}
                sub={`${r.country} · ${r.salesPerson}`}
                target={r.target} actual={r.actual} gap={r.gap}
                pct={r.achievementPercent} status={r.status}
                badge={<TierBadge tier={r.tier} />} />
            ))}
            {tab === "salesperson" && spData?.rows.map((r) => (
              <MobilePerformanceCard key={r.salesPerson} title={r.salesPerson}
                sub={`${r.activeBuyers} active buyers`}
                target={r.target} actual={r.actual} gap={r.gap}
                pct={r.achievementPercent} status={r.status} />
            ))}
          </div>
        )}

        {loading && (
          <div className="p-8 text-center text-gray-400 text-sm animate-pulse">Loading performance data…</div>
        )}
      </div>
    </div>
  )
}
