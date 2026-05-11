"use client"

import { useState, useEffect, useCallback } from "react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts"
import { SummaryCard } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { cycleScoreColor, formatNumber } from "@/lib/utils"
import type { CycleProgress, WeeklyBar, WeeklyReview, PendingReview, UserRole } from "@/types"

// ── Types ────────────────────────────────────────────────────────────────────

interface ExecutionResponse {
  currentFY:            string
  currentWeek:          number
  currentCycle:         number
  weekInCurrentCycle:   number
  summary: { totalTarget: number; totalActual: number; targetDue: number; gap: number; achievementPct: number }
  cycles:               CycleProgress[]
  weeklyBars:           WeeklyBar[]
  reviews:              WeeklyReview[]
  filterOptions:        { salesPersons: string[] }
}

interface Props { userRole?: UserRole; salesPerson?: string }

// ── Cycle Score Badge ─────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: CycleProgress["score"] }) {
  const label = score === "IN_PROGRESS" ? "In Progress"
    : score === "GREEN" ? "On Track" : score === "AMBER" ? "Warning" : "Off Track"
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cycleScoreColor(score)}`}>
      {label}
    </span>
  )
}

// ── Weekly Scorecard grid ─────────────────────────────────────────────────────
function WeeklyScorecardGrid({
  cycle, currentWeek,
}: { cycle: CycleProgress; currentWeek: number }) {
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const w    = cycle.startWeek + i
    const data = cycle.weeks.find((x) => x.fyWeek === w)
    return { week: w, data, isCurrent: w === currentWeek, isFuture: w > currentWeek }
  })

  return (
    <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 mt-3">
      {weeks.map(({ week, data, isCurrent, isFuture }) => {
        const actual     = data?.actualContainers ?? 0
        const hasOrder   = actual > 0
        const bg = isCurrent
          ? "bg-green-600 text-white ring-2 ring-green-300"
          : isFuture
          ? "bg-gray-50 text-gray-300 border border-dashed border-gray-200"
          : hasOrder
          ? "bg-green-100 text-green-800 border border-green-200"
          : "bg-red-50 text-red-400 border border-red-100"

        return (
          <div key={week} className={`rounded-lg p-2 text-center ${bg}`}>
            <p className={`text-xs font-semibold ${isCurrent ? "text-green-100" : "text-gray-400"}`}>W{week}</p>
            <p className="text-sm font-bold mt-0.5">{isFuture ? "–" : actual}</p>
          </div>
        )
      })}
    </div>
  )
}

// ── Weekly Review Form ────────────────────────────────────────────────────────
function ReviewForm({
  currentWeek, fy, salesPerson, onSaved,
}: { currentWeek: number; fy: string; salesPerson: string; onSaved: () => void }) {
  const [saving,  setSaving]  = useState(false)
  const [open,    setOpen]    = useState(false)
  const [form, setForm] = useState({
    wins: "", blockers: "", nextWeekFocus: "", openPIs: 0,
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, salesPerson, fyWeek: currentWeek }),
      })
      setForm({ wins: "", blockers: "", nextWeekFocus: "", openPIs: 0 })
      setOpen(false)
      onSaved()
    } finally { setSaving(false) }
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors"
    >
      + Log W{currentWeek} Review
    </button>
  )

  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-green-800">Week {currentWeek} Review · {fy}</h3>
        <button onClick={() => setOpen(false)} className="text-green-600 hover:text-green-800 text-sm">✕ Cancel</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">✅ Wins this week</label>
          <textarea
            rows={2} value={form.wins}
            onChange={(e) => setForm({ ...form, wins: e.target.value })}
            className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
            placeholder="Orders placed, milestones hit, new buyers…"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">🚧 Blockers</label>
          <textarea
            rows={2} value={form.blockers}
            onChange={(e) => setForm({ ...form, blockers: e.target.value })}
            className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
            placeholder="Delayed docs, no response, payment hold…"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">🎯 Next week focus</label>
          <textarea
            rows={2} value={form.nextWeekFocus}
            onChange={(e) => setForm({ ...form, nextWeekFocus: e.target.value })}
            className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
            placeholder="Top 3 buyers to chase, samples to send…"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">📋 Open PIs</label>
          <input
            type="number" min={0} value={form.openPIs}
            onChange={(e) => setForm({ ...form, openPIs: Number(e.target.value) })}
            className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
      </div>
      <button
        onClick={handleSave} disabled={saving}
        className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving…" : "Save Review"}
      </button>
    </div>
  )
}

// ── Review card ───────────────────────────────────────────────────────────────
function ReviewCard({ review }: { review: WeeklyReview }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          W{review.fyWeek} · {review.reviewDate}
        </span>
        <span className="text-xs text-gray-400">{review.salesPerson}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <p className="text-xs text-gray-400">Target</p>
          <p className="font-semibold">{review.targetContainers} ctrs</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Actual</p>
          <p className="font-semibold">{review.actualContainers} ctrs</p>
        </div>
      </div>
      {review.wins && (
        <p className="text-xs text-gray-600">✅ {review.wins}</p>
      )}
      {review.blockers && (
        <p className="text-xs text-gray-600">🚧 {review.blockers}</p>
      )}
      {review.nextWeekFocus && (
        <p className="text-xs text-gray-600">🎯 {review.nextWeekFocus}</p>
      )}
    </div>
  )
}

// ── Pending Reviews Banner ────────────────────────────────────────────────────
function PendingReviewsBanner({ isSP }: { isSP: boolean }) {
  const [pending, setPending] = useState<PendingReview[]>([])
  const [summary, setSummary] = useState<{ totalPending: number; peopleAffected: number; bySalesPerson?: Record<string, number> }>({ totalPending: 0, peopleAffected: 0 })
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    fetch("/api/reviews/pending")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) { setPending(d.pending); setSummary(d.summary) } })
      .catch(() => {})
  }, [])

  if (summary.totalPending === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className="text-xl flex-shrink-0">⏰</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              {isSP
                ? `${summary.totalPending} weekly review${summary.totalPending > 1 ? "s" : ""} pending for you`
                : `${summary.totalPending} pending weekly review${summary.totalPending > 1 ? "s" : ""} across ${summary.peopleAffected} sales ${summary.peopleAffected > 1 ? "people" : "person"}`}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {isSP ? "Use the form below to log past weeks" : "Reviews show wins, blockers, and next week's focus"}
            </p>
          </div>
        </div>
        <button onClick={() => setCollapsed(!collapsed)} className="text-xs text-amber-700 hover:text-amber-900 flex-shrink-0">
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {!collapsed && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
          {pending.slice(0, 24).map((p) => (
            <div key={`${p.salesPerson}-${p.fyWeek}`} className="bg-white border border-amber-200 rounded-lg px-2 py-1.5 text-xs">
              <p className="font-semibold text-gray-800 truncate">W{p.fyWeek}{p.weeksOverdue > 1 && <span className="text-red-600 ml-1">({p.weeksOverdue}w late)</span>}</p>
              {!isSP && <p className="text-gray-500 truncate">{p.salesPerson}</p>}
              <p className="text-gray-400 text-[10px]">{p.fyMonthName}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function ExecutionClient({ userRole, salesPerson }: Props) {
  const [data,       setData]       = useState<ExecutionResponse | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState("")
  const [expandedCycle, setExpanded] = useState<number | null>(null)
  const [spFilter,   setSpFilter]   = useState(salesPerson ?? "")

  const isSP = userRole === "SALES_PERSON"

  const fetchData = useCallback(async (sp: string) => {
    setLoading(true); setError("")
    const params = new URLSearchParams()
    if (sp) params.set("salesPerson", sp)
    try {
      const res = await fetch(`/api/execution?${params}`)
      if (!res.ok) throw new Error("Failed")
      const d = await res.json() as ExecutionResponse
      setData(d)
      setExpanded(d.currentCycle)
    } catch { setError("Failed to load execution data.") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData(spFilter) }, [fetchData, spFilter])

  if (loading) return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
      ))}
    </div>
  )
  if (error || !data) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-600 text-sm">{error}</div>
  )

  const { summary, cycles, weeklyBars, reviews, currentWeek, currentCycle, weekInCurrentCycle } = data

  return (
    <div className="space-y-5">
      <PendingReviewsBanner isSP={isSP} />

      {/* SP filter (managers/directors only) */}
      {!isSP && data.filterOptions.salesPersons.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">Sales Person:</span>
          <select
            value={spFilter}
            onChange={(e) => { setSpFilter(e.target.value); fetchData(e.target.value) }}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            <option value="">All</option>
            {data.filterOptions.salesPersons.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {/* FY Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="FY Target"    value={formatNumber(summary.totalTarget, 0)}  sub="containers" color="bg-gray-50 border-gray-200" />
        <SummaryCard label="Actual"       value={formatNumber(summary.totalActual, 0)}  sub="to date"    color="bg-green-50 border-green-200" />
        <SummaryCard label="Target Due"   value={formatNumber(summary.targetDue, 0)}    sub={`by W${currentWeek}`} color="bg-blue-50 border-blue-200" />
        <SummaryCard
          label="Gap"
          value={`${summary.gap >= 0 ? "+" : ""}${formatNumber(summary.gap, 0)}`}
          sub={summary.gap >= 0 ? "ahead of pace" : "behind pace"}
          color={summary.gap >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}
        />
      </div>

      {/* Progress bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-semibold text-gray-700">
              FY {data.currentFY} · W{currentWeek} · Cycle {currentCycle} W{weekInCurrentCycle}/12
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{summary.achievementPct}% of annual target achieved</p>
          </div>
          <span className={`text-lg font-bold ${summary.achievementPct >= 100 ? "text-green-600" : summary.achievementPct >= 70 ? "text-teal-600" : "text-amber-600"}`}>
            {summary.achievementPct}%
          </span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${summary.achievementPct >= 100 ? "bg-green-500" : summary.achievementPct >= 70 ? "bg-teal-400" : summary.achievementPct >= 40 ? "bg-amber-400" : "bg-red-400"}`}
            style={{ width: `${Math.min(100, summary.achievementPct)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0</span><span>{formatNumber(summary.totalTarget, 0)} ctrs</span>
        </div>
      </div>

      {/* Weekly bar chart */}
      {weeklyBars.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Weekly Container Activity · FY {data.currentFY}</h3>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={weeklyBars} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                interval={Math.floor(weeklyBars.length / 10)} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(val: unknown) => [`${Number(val)} ctrs`, "Actual"]}
              />
              <ReferenceLine y={summary.totalTarget / 52} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "Weekly avg target", position: "right", fontSize: 9, fill: "#94a3b8" }} />
              <Bar dataKey="actual" radius={[2, 2, 0, 0]}>
                {weeklyBars.map((b) => (
                  <Cell key={b.fyWeek} fill={b.actual > 0 ? "#16a34a" : "#e5e7eb"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cycle accordion */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">12-Week Cycles</h3>
        {cycles.map((cycle) => {
          const isExpanded = expandedCycle === cycle.cycle
          const isCurrent  = cycle.cycle === currentCycle

          return (
            <div key={cycle.cycle} className={`bg-white border rounded-xl overflow-hidden transition-all ${isCurrent ? "border-green-300 shadow-sm" : "border-gray-200"}`}>
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : cycle.cycle)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isCurrent ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                    C{cycle.cycle}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-800">{cycle.cycleName}</p>
                    <p className="text-xs text-gray-400">W{cycle.startWeek}–W{cycle.endWeek} · {cycle.startDate} → {cycle.endDate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-gray-900">{cycle.actualContainers} / {cycle.targetContainers.toFixed(0)}</p>
                    <p className="text-xs text-gray-400">{cycle.achievementPercent}% achieved</p>
                  </div>
                  <ScoreBadge score={cycle.score} />
                  <span className={`text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  {/* Achievement bar */}
                  <div className="mt-3 mb-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Actual: {cycle.actualContainers} ctrs</span>
                      <span>Target: {cycle.targetContainers.toFixed(0)} ctrs</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${cycle.achievementPercent >= 90 ? "bg-green-500" : cycle.achievementPercent >= 70 ? "bg-amber-400" : "bg-red-400"}`}
                        style={{ width: `${Math.min(100, cycle.achievementPercent)}%` }}
                      />
                    </div>
                  </div>
                  {/* Weekly scorecard */}
                  <WeeklyScorecardGrid cycle={cycle} currentWeek={currentWeek} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Weekly Review section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Weekly Reviews</h3>
          <ReviewForm
            currentWeek={currentWeek}
            fy={data.currentFY}
            salesPerson={spFilter || salesPerson || ""}
            onSaved={() => fetchData(spFilter)}
          />
        </div>
        {reviews.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-400 text-sm">
            No weekly reviews logged yet. Add your first W{currentWeek} review above.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {reviews.map((r) => <ReviewCard key={r.id ?? r.fyWeek} review={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}
