"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { StatusBadge, AchievementBar } from "@/components/ui/status-badge"
import { SummaryCard } from "@/components/ui/page-header"
import { formatNumber } from "@/lib/utils"
import type { PerformanceStatus, UserRole } from "@/types"

interface CountryRow {
  country:             string
  target:              number
  actual:              number
  prevActual:          number
  targetDue:           number
  gap:                 number
  achievementPct:      number
  status:              PerformanceStatus
  growthPct:           number | null
  activeSalesPersons:  number
  activeBuyers:        number
  planned2026:         number
  actual2025:          number
  isDreamMarket:       boolean
  hasManualStrategy:   boolean
  dreamRank:           number
}

interface CountriesResponse {
  countries: CountryRow[]
  summary: {
    totalCountries: number; activeCountries: number
    totalTarget: number; totalActual: number
    dreamMarketCount?: number
    dreamMarketTarget?: number
    dreamMarketActual?: number
  }
  meta: { currentFY: string; currentWeek: number }
}

interface Props { userRole?: UserRole; salesPerson?: string }

function GrowthBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-400 text-xs">–</span>
  const pos = pct >= 0
  return (
    <span className={`text-xs font-semibold ${pos ? "text-green-600" : "text-red-500"}`}>
      {pos ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  )
}

const PAGE_SIZE = 10

export function CountriesClient({ userRole, salesPerson }: Props) {
  const router = useRouter()
  const [data,    setData]    = useState<CountriesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState("")
  const [search,  setSearch]  = useState("")
  const [onlyDream, setOnlyDream] = useState(false)
  const [page,    setPage]    = useState(1)

  useEffect(() => {
    fetch("/api/countries")
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setError("Failed to load country data."))
      .finally(() => setLoading(false))
  }, [])

  const filtered = (data?.countries ?? []).filter((c) => {
    if (search && !c.country.toLowerCase().includes(search.toLowerCase())) return false
    if (onlyDream && !c.isDreamMarket) return false
    return true
  })

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage    = Math.min(page, totalPages)
  const paginated   = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [search, onlyDream])

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
      ))}
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-600 text-sm">{error}</div>
  )

  return (
    <div className="space-y-4">
      {/* Summary */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryCard label="Total Countries" value={data.summary.totalCountries}                 color="bg-white border-gray-200" />
          <SummaryCard label="Active Countries" value={data.summary.activeCountries}               color="bg-green-50 border-green-200" />
          <SummaryCard label="🌟 Dream Markets" value={data.summary.dreamMarketCount ?? 0}
                       sub={data.summary.dreamMarketTarget ? `${formatNumber(data.summary.dreamMarketTarget, 0)} ctrs target` : "top 10 markets"}
                       color="bg-yellow-50 border-yellow-300" />
          <SummaryCard label="Total Target"     value={formatNumber(data.summary.totalTarget, 0)} sub="containers" color="bg-blue-50 border-blue-200" />
          <SummaryCard label="Total Actual"     value={formatNumber(data.summary.totalActual, 0)} sub={`FY ${data.meta.currentFY}`} color="bg-teal-50 border-teal-200" />
        </div>
      )}

      {/* Search + Dream Market filter + pagination info */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text" placeholder="Search country…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 sm:max-w-xs text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <button
          onClick={() => setOnlyDream(!onlyDream)}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
            onlyDream
              ? "bg-yellow-100 text-yellow-800 border-yellow-300 ring-2 ring-yellow-400"
              : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
          }`}
        >
          🌟 Dream Markets only
        </button>
      </div>

      {/* Desktop table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
                {["Country","Target","Actual","Achievement","Gap","Growth","Buyers","SPs","Status"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map((c, i) => (
                <tr
                  key={c.country}
                  className="hover:bg-green-50 cursor-pointer transition-colors"
                  onClick={() => router.push(`/countries/${encodeURIComponent(c.country)}`)}
                >
                  <td className="px-3 py-3 text-gray-400 tabular-nums">{(safePage - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800 hover:text-green-700 hover:underline">
                    {c.isDreamMarket && (
                      <span
                        title={c.hasManualStrategy ? "Manually marked as Dream Market" : `Auto-classified — top ${c.dreamRank || 10}`}
                        className="inline-flex items-center mr-1.5 text-yellow-600"
                      >🌟</span>
                    )}
                    {c.country}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-700">{formatNumber(c.target, 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{formatNumber(c.actual, 0)}</td>
                  <td className="px-4 py-3 min-w-[110px]"><AchievementBar pct={c.achievementPct} status={c.status} /></td>
                  <td className={`px-4 py-3 text-right text-xs font-semibold tabular-nums ${c.gap >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {c.gap >= 0 ? "+" : ""}{formatNumber(c.gap, 0)}
                  </td>
                  <td className="px-4 py-3"><GrowthBadge pct={c.growthPct} /></td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">{c.activeBuyers}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">{c.activeSalesPersons}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (() => {
              const totals = filtered.reduce(
                (acc, r) => ({
                  target:        acc.target        + r.target,
                  actual:        acc.actual        + r.actual,
                  gap:           acc.gap           + r.gap,
                  activeBuyers:  acc.activeBuyers  + r.activeBuyers,
                  activeSPs:     acc.activeSPs     + r.activeSalesPersons,
                }), { target: 0, actual: 0, gap: 0, activeBuyers: 0, activeSPs: 0 }
              )
              return (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                    <td className="px-3 py-3" />
                    <td className="px-4 py-3 text-gray-800 uppercase text-xs tracking-wide">
                      Grand Total ({filtered.length})
                    </td>
                    <td className="px-4 py-3 text-right text-gray-800 tabular-nums">{formatNumber(totals.target, 0)}</td>
                    <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{formatNumber(totals.actual, 0)}</td>
                    <td className="px-4 py-3" />
                    <td className={`px-4 py-3 text-right tabular-nums ${totals.gap >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {(totals.gap >= 0 ? "+" : "") + formatNumber(totals.gap, 0)}
                    </td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-center text-xs text-gray-600">{totals.activeBuyers}</td>
                    <td className="px-4 py-3 text-center text-xs text-gray-600">{totals.activeSPs}</td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              )
            })()}
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-100">
          {paginated.map((c) => (
            <div
              key={c.country}
              className="p-4 space-y-2 cursor-pointer active:bg-gray-50"
              onClick={() => router.push(`/countries/${encodeURIComponent(c.country)}`)}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-800">
                  {c.isDreamMarket && <span className="text-yellow-600 mr-1">🌟</span>}
                  {c.country}
                </p>
                <StatusBadge status={c.status} />
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Target: <strong className="text-gray-700">{formatNumber(c.target, 0)}</strong></span>
                <span>Actual: <strong className="text-gray-900">{formatNumber(c.actual, 0)}</strong></span>
                <GrowthBadge pct={c.growthPct} />
              </div>
              <AchievementBar pct={c.achievementPct} status={c.status} />
              <p className="text-xs text-gray-400">{c.activeBuyers} buyers · {c.activeSalesPersons} SPs</p>
            </div>
          ))}
        </div>
      </div>
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 py-2">
          <p className="text-xs text-gray-500">
            Page {safePage} / {totalPages} &nbsp;·&nbsp; {filtered.length} countries
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
