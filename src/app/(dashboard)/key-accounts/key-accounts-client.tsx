"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { SummaryCard } from "@/components/ui/page-header"
import { segmentBg, segmentLabel, formatNumber } from "@/lib/utils"
import type { ResolvedBuyer, UserRole } from "@/types"

interface KeyAccountRow extends ResolvedBuyer {
  meetingTarget:     number
  meetingActual:     number
  meetingCompliant:  boolean
  meetingsRemaining: number
  openTasks:         number
  inProgressTasks:   number
  overdueTasks:      number
  doneTasks:         number
  lastActivityDate:  string
}

interface KeyAccountsResponse {
  buyers: KeyAccountRow[]
  summary: {
    vipCount: number; strategicCount: number; totalKeyAccounts: number
    compliantBuyers: number; meetingShortfall: number
    totalOpenTasks: number; totalOverdueTasks: number
    monthLabel: string
  }
  filterOptions: { salesPersons: string[]; countries: string[] }
  meta: { currentFY: string; currentWeek: number }
}

interface Props { userRole?: UserRole; salesPerson?: string }

// ── Meeting compliance pill ──────────────────────────────────────────────────
function MeetingPill({ actual, target }: { actual: number; target: number }) {
  if (target === 0) return <span className="text-xs text-gray-400">–</span>
  const pct = (actual / target) * 100
  const color = pct >= 100
    ? "bg-green-100 text-green-800 border-green-200"
    : pct >= 50
    ? "bg-amber-100 text-amber-800 border-amber-200"
    : "bg-red-100 text-red-700 border-red-200"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
      {actual}/{target} mtgs
    </span>
  )
}

export function KeyAccountsClient({ userRole, salesPerson }: Props) {
  const router = useRouter()
  const [data,    setData]    = useState<KeyAccountsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState("")
  const [filterSegment, setFilterSegment] = useState<"ALL" | "VIP" | "STRATEGIC">("ALL")
  const [filterSP,      setFilterSP]      = useState(salesPerson ?? "")
  const [filterCountry, setFilterCountry] = useState("")
  const [showOnlyGap,   setShowOnlyGap]   = useState(false)
  const isSP = userRole === "SALES_PERSON"

  const fetchData = useCallback(async () => {
    setLoading(true); setError("")
    const params = new URLSearchParams()
    if (filterSP)      params.set("salesPerson", filterSP)
    if (filterCountry) params.set("country",     filterCountry)
    try {
      const res = await fetch(`/api/key-accounts?${params}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch { setError("Failed to load key account data.") }
    finally { setLoading(false) }
  }, [filterSP, filterCountry])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
      ))}
    </div>
  )
  if (error || !data) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-600 text-sm">{error}</div>
  )

  const filtered = data.buyers.filter((b) => {
    if (filterSegment !== "ALL" && b.segment !== filterSegment) return false
    if (showOnlyGap && b.meetingCompliant && b.overdueTasks === 0) return false
    return true
  })

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="VIP"        value={data.summary.vipCount}        sub="top 20 by target" color="bg-yellow-50 border-yellow-200" />
        <SummaryCard label="Strategic"  value={data.summary.strategicCount}  sub="ranks 21–50"      color="bg-orange-50 border-orange-200" />
        <SummaryCard label="Meeting Compliant"
                     value={`${data.summary.compliantBuyers} / ${data.summary.totalKeyAccounts}`}
                     sub={`${data.summary.monthLabel}`}
                     color={data.summary.meetingShortfall === 0 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"} />
        <SummaryCard label="Overdue Tasks"
                     value={data.summary.totalOverdueTasks}
                     sub={`${data.summary.totalOpenTasks} open`}
                     color={data.summary.totalOverdueTasks > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1.5">
          {(["ALL", "VIP", "STRATEGIC"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterSegment(s)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                filterSegment === s
                  ? s === "VIP" ? "bg-yellow-100 text-yellow-800 border-yellow-300 ring-2 ring-yellow-400"
                  : s === "STRATEGIC" ? "bg-orange-100 text-orange-800 border-orange-200 ring-2 ring-orange-300"
                  : "bg-gray-800 text-white border-gray-800"
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {s === "ALL" ? "All" : s === "VIP" ? "★ VIP" : "Strategic"}
            </button>
          ))}
        </div>
        <div className="w-px bg-gray-200 self-stretch" />
        {!isSP && (
          <select
            value={filterSP} onChange={(e) => setFilterSP(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
          >
            <option value="">All sales persons</option>
            {data.filterOptions.salesPersons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select
          value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
        >
          <option value="">All countries</option>
          {data.filterOptions.countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox" checked={showOnlyGap}
            onChange={(e) => setShowOnlyGap(e.target.checked)}
          />
          Only buyers with gaps
        </label>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
          {filtered.length} key accounts {filterSegment !== "ALL" && `(${filterSegment.replace("_", " ")})`}
        </div>

        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Buyer</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Country</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Segment</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Meetings</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tasks</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Last Activity</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Owner</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Achievement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((b, i) => (
                <tr
                  key={b.canonicalBuyerCode}
                  onClick={() => router.push(`/buyers/${encodeURIComponent(b.canonicalBuyerCode)}`)}
                  className="hover:bg-green-50 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2.5 text-gray-400 tabular-nums text-center">{i + 1}</td>
                  <td className="px-3 py-2.5 max-w-[220px]">
                    <div className="font-medium text-gray-800 truncate hover:text-green-700">
                      {b.isKeyAccount && <span className="text-violet-500 mr-1">★</span>}
                      {b.canonicalBuyerName}
                    </div>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">{b.buyerCode}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-left">{b.country}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${segmentBg(b.segment)}`}>
                      {segmentLabel(b.segment)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <MeetingPill actual={b.meetingActual} target={b.meetingTarget} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex flex-col gap-0.5 text-xs">
                      {b.overdueTasks > 0 && (
                        <span className="text-red-600 font-bold">⚠ {b.overdueTasks} overdue</span>
                      )}
                      <span className="text-gray-600">{b.openTasks + b.inProgressTasks} active</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 text-center">
                    {b.lastActivityDate || <span className="text-gray-300 italic">none</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-left">{b.primaryOwner || "–"}</td>
                  <td className="px-3 py-2.5 text-xs text-center">
                    <span className="font-bold text-gray-900">{b.achievementPct}%</span>
                    <span className="text-gray-400 ml-1">({formatNumber(b.actual, 0)})</span>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (() => {
              const t = filtered.reduce(
                (acc, r) => ({
                  meetingTarget: acc.meetingTarget + r.meetingTarget,
                  meetingActual: acc.meetingActual + r.meetingActual,
                  open:          acc.open          + r.openTasks + r.inProgressTasks,
                  overdue:       acc.overdue       + r.overdueTasks,
                }), { meetingTarget: 0, meetingActual: 0, open: 0, overdue: 0 }
              )
              return (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 text-gray-800 uppercase text-xs tracking-wide" colSpan={3}>
                      Grand Total ({filtered.length})
                    </td>
                    <td className="px-3 py-3 text-xs">{t.meetingActual}/{t.meetingTarget} mtgs</td>
                    <td className="px-3 py-3 text-xs">
                      {t.overdue > 0 && <span className="text-red-600 font-bold">{t.overdue} overdue</span>}
                      {t.overdue === 0 && t.open > 0 && <span className="text-gray-600">{t.open} active</span>}
                    </td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3" />
                  </tr>
                </tfoot>
              )
            })()}
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-100">
          {filtered.map((b) => (
            <div
              key={b.canonicalBuyerCode}
              onClick={() => router.push(`/buyers/${encodeURIComponent(b.canonicalBuyerCode)}`)}
              className="p-3 space-y-2 cursor-pointer active:bg-gray-50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">
                    {b.isKeyAccount && <span className="text-violet-500 mr-1">★</span>}
                    {b.canonicalBuyerName}
                  </p>
                  <p className="text-xs text-gray-400">{b.country} · {b.primaryOwner}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border flex-shrink-0 ${segmentBg(b.segment)}`}>
                  {segmentLabel(b.segment)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <MeetingPill actual={b.meetingActual} target={b.meetingTarget} />
                <span className="text-gray-500">
                  {b.overdueTasks > 0 && <span className="text-red-600 font-bold mr-2">⚠ {b.overdueTasks}</span>}
                  <span>{b.openTasks + b.inProgressTasks} tasks</span>
                </span>
                <span className="font-semibold text-gray-700">{b.achievementPct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Helpful legend */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 space-y-1">
        <p className="font-semibold">Meeting compliance rules:</p>
        <p>★ VIP — minimum <strong>2 meetings</strong> per month</p>
        <p>Strategic — minimum <strong>1 meeting</strong> per month</p>
        <p className="text-blue-600 mt-1">Click any buyer row to open their workspace and log activities or assign tasks.</p>
      </div>
    </div>
  )
}
