"use client"

import { useState, useEffect, useCallback } from "react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart, Legend,
} from "recharts"
import { SummaryCard } from "@/components/ui/page-header"
import { formatNumber } from "@/lib/utils"
import type { LeadActivity, ActivityType, UserRole } from "@/types"

interface LeadLagResponse {
  leadMeasures: {
    CALL: number; WHATSAPP: number; EMAIL: number
    SAMPLE_SENT: number; VISIT: number; MEETING: number
    FOLLOW_UP: number; ORDER_PLACED: number; DEMO: number; OTHER: number
    total: number
    outcomes: { POSITIVE: number; NEUTRAL: number; NEGATIVE: number }
  }
  lagMeasures: {
    containers: number; target: number; targetDue: number; targetAchPct: number
    ordersClosed: number; gap: number
  }
  byWeek:           { fyWeek: number; label: string; leadCount: number; lagContainers: number }[]
  spLeaderboard:    { salesPerson: string; leadCount: number; lagContainers: number; ratio: number }[]
  recentActivities: LeadActivity[]
  filterOptions: {
    salesPersons: string[]
    countries:    string[]
    cycles:       { cycle: number; name: string }[]
  }
  meta: { currentFY: string; currentWeek: number; currentCycle: number }
}

interface Props { userRole?: UserRole; salesPerson?: string }

const ACTIVITY_LABELS: Record<ActivityType, { label: string; icon: string; color: string }> = {
  CALL:         { label: "Calls",       icon: "📞", color: "bg-blue-50 border-blue-200" },
  WHATSAPP:     { label: "WhatsApp",    icon: "💬", color: "bg-green-50 border-green-200" },
  EMAIL:        { label: "Emails",      icon: "✉️",  color: "bg-indigo-50 border-indigo-200" },
  SAMPLE_SENT:  { label: "Samples",     icon: "📦", color: "bg-amber-50 border-amber-200" },
  VISIT:        { label: "Visits",      icon: "🚶", color: "bg-purple-50 border-purple-200" },
  MEETING:      { label: "Meetings",    icon: "🤝", color: "bg-teal-50 border-teal-200" },
  FOLLOW_UP:    { label: "Follow-ups",  icon: "🔁", color: "bg-cyan-50 border-cyan-200" },
  ORDER_PLACED: { label: "Orders",      icon: "🎯", color: "bg-emerald-50 border-emerald-200" },
  DEMO:         { label: "Demos",       icon: "🎬", color: "bg-rose-50 border-rose-200" },
  OTHER:        { label: "Other",       icon: "•",  color: "bg-gray-50 border-gray-200" },
}

const SHOW_TYPES: ActivityType[] = [
  "CALL", "WHATSAPP", "EMAIL", "SAMPLE_SENT", "VISIT", "MEETING", "FOLLOW_UP",
]

export function LeadLagClient({ userRole, salesPerson }: Props) {
  const [data,    setData]    = useState<LeadLagResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState("")
  const isSP = userRole === "SALES_PERSON"

  const [filters, setFilters] = useState({
    salesPerson: salesPerson ?? "",
    country:     "",
    cycle:       "",
    fyWeek:      "",
  })

  const fetchData = useCallback(async () => {
    setLoading(true); setError("")
    const params = new URLSearchParams()
    if (filters.salesPerson) params.set("salesPerson", filters.salesPerson)
    if (filters.country)     params.set("country",     filters.country)
    if (filters.cycle)       params.set("cycle",       filters.cycle)
    if (filters.fyWeek)      params.set("fyWeek",      filters.fyWeek)
    try {
      const res = await fetch(`/api/lead-lag?${params}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch { setError("Failed to load lead/lag data.") }
    finally { setLoading(false) }
  }, [filters])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
      ))}
    </div>
  )
  if (error || !data) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-600 text-sm">{error}</div>
  )

  const ratio = data.leadMeasures.total > 0
    ? Math.round((data.lagMeasures.containers / data.leadMeasures.total) * 10) / 10
    : 0

  return (
    <div className="space-y-4">
      {/* ── Filter Bar ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
        {!isSP && (
          <select
            value={filters.salesPerson}
            onChange={(e) => setFilters({ ...filters, salesPerson: e.target.value })}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            <option value="">All sales persons</option>
            {data.filterOptions.salesPersons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select
          value={filters.country}
          onChange={(e) => setFilters({ ...filters, country: e.target.value })}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          <option value="">All countries</option>
          {data.filterOptions.countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filters.cycle}
          onChange={(e) => setFilters({ ...filters, cycle: e.target.value, fyWeek: "" })}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          <option value="">All cycles</option>
          {data.filterOptions.cycles.map((c) => <option key={c.cycle} value={c.cycle}>{c.name}</option>)}
        </select>
        <input
          type="number" min={1} max={52} placeholder="Week #" value={filters.fyWeek}
          onChange={(e) => setFilters({ ...filters, fyWeek: e.target.value, cycle: "" })}
          className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        {(filters.salesPerson || filters.country || filters.cycle || filters.fyWeek) && (
          <button
            onClick={() => setFilters({ salesPerson: salesPerson ?? "", country: "", cycle: "", fyWeek: "" })}
            className="text-xs text-gray-500 hover:text-gray-700 underline ml-auto"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Lead vs Lag Summary ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Lead measures */}
        <div className="bg-white border border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-blue-600 font-semibold">Lead Measures</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{data.leadMeasures.total} <span className="text-sm font-normal text-gray-500">activities</span></p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">✅ {data.leadMeasures.outcomes.POSITIVE} positive</p>
              <p className="text-xs text-gray-400">⚠️ {data.leadMeasures.outcomes.NEGATIVE} negative</p>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
            {SHOW_TYPES.map((t) => {
              const count = data.leadMeasures[t] ?? 0
              const def   = ACTIVITY_LABELS[t]
              return (
                <div key={t} className={`rounded-lg border p-2 text-center ${def.color}`}>
                  <p className="text-base">{def.icon}</p>
                  <p className="text-base font-bold text-gray-900">{count}</p>
                  <p className="text-[10px] text-gray-500 truncate">{def.label}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Lag measures */}
        <div className="bg-white border border-green-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-green-600 font-semibold">Lag Measures</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{formatNumber(data.lagMeasures.containers, 0)} <span className="text-sm font-normal text-gray-500">containers</span></p>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${data.lagMeasures.targetAchPct >= 70 ? "text-green-600" : data.lagMeasures.targetAchPct >= 40 ? "text-amber-600" : "text-red-600"}`}>
                {data.lagMeasures.targetAchPct}%
              </p>
              <p className="text-xs text-gray-400">of target</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg border border-gray-200 p-2 text-center">
              <p className="text-base font-bold text-gray-900">{formatNumber(data.lagMeasures.target, 0)}</p>
              <p className="text-[10px] text-gray-500">Target</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-2 text-center">
              <p className="text-base font-bold text-gray-900">{formatNumber(data.lagMeasures.targetDue, 0)}</p>
              <p className="text-[10px] text-gray-500">Due</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-2 text-center">
              <p className="text-base font-bold text-gray-900">{data.lagMeasures.ordersClosed}</p>
              <p className="text-[10px] text-gray-500">Orders</p>
            </div>
            <div className={`rounded-lg border p-2 text-center ${data.lagMeasures.gap >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
              <p className={`text-base font-bold ${data.lagMeasures.gap >= 0 ? "text-green-700" : "text-red-700"}`}>
                {data.lagMeasures.gap >= 0 ? "+" : ""}{formatNumber(data.lagMeasures.gap, 0)}
              </p>
              <p className="text-[10px] text-gray-500">Gap</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Conversion ratio ───────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-gray-600">
          <span className="font-semibold text-blue-700">{data.leadMeasures.total} activities</span>
          <span className="mx-2">→</span>
          <span className="font-semibold text-green-700">{formatNumber(data.lagMeasures.containers, 0)} containers</span>
        </div>
        <div className="text-sm">
          <span className="text-gray-500">Conversion ratio:</span>
          <span className="font-bold text-gray-900 ml-1.5">{ratio} ctrs / activity</span>
        </div>
      </div>

      {/* ── Weekly trend chart ─────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Lead vs Lag · Weekly Trend</h3>
        {data.byWeek.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={data.byWeek} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar  yAxisId="left"  dataKey="leadCount"     name="Lead activities" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" dataKey="lagContainers" name="Lag containers" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data for this period</div>
        )}
      </div>

      {/* ── SP Leaderboard (manager view only) ──────────────────────────── */}
      {!isSP && data.spLeaderboard.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Sales Person Leaderboard · FY {data.meta.currentFY}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {["Sales Person","Lead Activities","Lag Containers","Ratio"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.spLeaderboard.map((sp) => (
                  <tr key={sp.salesPerson} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{sp.salesPerson}</td>
                    <td className="px-4 py-2.5 text-blue-700 font-semibold">{sp.leadCount}</td>
                    <td className="px-4 py-2.5 text-green-700 font-semibold">{formatNumber(sp.lagContainers, 0)}</td>
                    <td className="px-4 py-2.5 text-gray-700 font-semibold">{sp.ratio} <span className="text-xs text-gray-400">ctrs/act</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Recent activities ──────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Recent Activities</h3>
        </div>
        {data.recentActivities.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No activities logged yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.recentActivities.map((a) => {
              const def = ACTIVITY_LABELS[a.activityType]
              return (
                <div key={a.id} className="p-3 flex items-center gap-3">
                  <span className="text-xl flex-shrink-0">{def.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{a.buyerName}</p>
                    <p className="text-xs text-gray-500">
                      {def.label} · {a.salesPerson} · {a.country || "–"} · W{a.fyWeek}
                    </p>
                    {a.notes && <p className="text-xs text-gray-600 mt-0.5 truncate">"{a.notes}"</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      a.outcome === "POSITIVE" ? "bg-green-100 text-green-700"
                      : a.outcome === "NEGATIVE" ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-600"
                    }`}>
                      {a.outcome}
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5">{a.date}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
