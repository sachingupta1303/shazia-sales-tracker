"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  TIER_LABEL,
  TIER_BADGE,
  STATUS_BADGE,
  STATUS_LABEL,
  MEETING_OUTCOMES,
  OUTCOME_LABEL,
  OUTCOME_BADGE,
  OUTCOME_EMOJI,
  formatDate,
  todayISO,
} from "@/lib/8020-utils"
import type { AppUser, MeetingSchedule, Stats8020 } from "@/types"

// ── Types ─────────────────────────────────────────────────────────────────────

interface OthersBuyerRow {
  buyerName: string
  country: string
  responsiblePerson: string
  salesCoordinator: string
  target: number
  actual: number
  achievementPct: number
  lastOrderDate: string | null
}

interface DashboardData {
  stats: Stats8020
  dueToday: number
  totalTarget: number
  totalActual: number
  overallAchievementPct: number
  others: {
    count: number
    totalTarget: number
    totalActual: number
    achievementPct: number
    buyers: OthersBuyerRow[]
  }
}

const SHEET_ID  = "1qzzYldUVUe4WrxsR1lOHvFKOaXcLogxFmRLpMiQB6t0"
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}`

/** Convert buyer name → buyer workspace URL slug (e.g. "Suncons Trading & Co" → "raw_suncons_trading_co") */
function buyerSlug(name: string): string {
  return "raw_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_+$/g, "")
}

interface MeetingsData {
  meetings: MeetingSchedule[]
  filterOptions: { persons: string[]; countries: string[] }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent,
}: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ?? "bg-white border-gray-200"}`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${TIER_BADGE[tier] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
      {TIER_LABEL[tier] ?? tier}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_BADGE[status] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function DaysChip({ days }: { days: number }) {
  if (days < 0)   return <span className="text-xs font-bold text-red-600">{Math.abs(days)}d overdue</span>
  if (days === 0) return <span className="text-xs font-bold text-orange-600">Due today</span>
  if (days <= 5)  return <span className="text-xs font-semibold text-amber-600">In {days}d</span>
  return <span className="text-xs text-gray-500">In {days}d</span>
}

function AchievementChip({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-green-100 text-green-700 border-green-200"
              : pct >= 70  ? "bg-amber-100 text-amber-800 border-amber-200"
              : pct > 0    ? "bg-red-100 text-red-700 border-red-200"
              : "bg-gray-100 text-gray-500 border-gray-200"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border tabular-nums ${color}`}>
      {pct}%
    </span>
  )
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
}

// ── Done Modal ────────────────────────────────────────────────────────────────

function DoneModal({
  meeting, onClose, onDone,
}: {
  meeting: MeetingSchedule
  onClose: () => void
  onDone: (updated: MeetingSchedule) => void
}) {
  const [form, setForm] = useState<{
    meetingDate: string
    outcome: typeof MEETING_OUTCOMES[number]
    notes: string
  }>({ meetingDate: todayISO(), outcome: "FOLLOW_UP", notes: "" })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/8020/meetings/${meeting.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingDate: form.meetingDate,
          outcome:     form.outcome,
          notes:       form.notes,
        }),
      })

      // Try to parse JSON either way so we can surface the server's error message
      let payload: { meeting?: MeetingSchedule; error?: string } = {}
      try { payload = await res.json() } catch { /* non-JSON response */ }

      if (!res.ok || !payload.meeting) {
        const reason = payload.error ?? `Server returned ${res.status} ${res.statusText}`
        console.error("[DoneModal] save failed:", reason)
        toast.error(reason, { duration: 8000 })
        return
      }

      onDone(payload.meeting)
      toast.success(`✓ Meeting with ${meeting.buyerName} marked as done. Next due: ${payload.meeting.nextDueDate}`)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error"
      console.error("[DoneModal] network error:", err)
      toast.error(`Could not reach server: ${msg}`, { duration: 8000 })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Mark Meeting Done</h2>
            <p className="text-sm text-gray-500 mt-0.5">{meeting.buyerName} · {meeting.country}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none mt-0.5">✕</button>
        </div>

        <div className="mx-6 mb-4 flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 text-sm">
          <TierBadge tier={meeting.tier} />
          <span className="text-gray-600">Responsible: <strong>{meeting.responsiblePerson || "—"}</strong></span>
        </div>

        <form onSubmit={submit} className="px-6 pb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Meeting Date</label>
            <input
              type="date"
              value={form.meetingDate}
              max={todayISO()}
              onChange={(e) => setForm((f) => ({ ...f, meetingDate: e.target.value }))}
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Meeting Outcome <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {MEETING_OUTCOMES.map((o) => (
                <button
                  type="button"
                  key={o}
                  onClick={() => setForm((f) => ({ ...f, outcome: o }))}
                  className={`text-left text-xs px-3 py-2 rounded-xl border transition-all ${
                    form.outcome === o
                      ? `${OUTCOME_BADGE[o]} ring-2 ring-offset-1 ring-green-400 font-semibold`
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span className="mr-1.5">{OUTCOME_EMOJI[o]}</span>
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Meeting Output / Notes <span className="text-gray-400 font-normal">(what was discussed, next steps)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="e.g. Discussed Q3 pricing, buyer confirmed 5 containers, PI to be sent by Friday…"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 transition-colors">
              {saving ? "Saving…" : "✓ Confirm Done"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── History Modal ─────────────────────────────────────────────────────────────

function HistoryPanel({
  meeting, onClose, onUndo,
}: {
  meeting: MeetingSchedule
  onClose: () => void
  onUndo: (updated: MeetingSchedule) => void
}) {
  const [undoing, setUndoing] = useState(false)

  async function handleUndo() {
    if (!confirm(`Undo the most recent meeting for ${meeting.buyerName}? This will remove the latest history entry and reset the next-due date.`)) return
    setUndoing(true)
    try {
      const res = await fetch(`/api/8020/meetings/${meeting.id}/undo`, { method: "POST" })
      let payload: { meeting?: MeetingSchedule; error?: string } = {}
      try { payload = await res.json() } catch { /* */ }
      if (!res.ok || !payload.meeting) {
        toast.error(payload.error ?? `Server returned ${res.status}`, { duration: 8000 })
        return
      }
      onUndo(payload.meeting)
      toast.success(`✓ Undone. Next due reset to ${payload.meeting.nextDueDate}`)
      onClose()
    } catch (err) {
      toast.error(`Could not undo: ${err instanceof Error ? err.message : "Network error"}`, { duration: 8000 })
    } finally {
      setUndoing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-100 max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Meeting History</h2>
            <p className="text-sm text-gray-500">{meeting.buyerName} · {meeting.country}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none mt-0.5">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">
          {meeting.history.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No meetings recorded yet.</p>
          ) : (
            <ol className="relative border-l-2 border-gray-200 space-y-6 ml-2">
              {meeting.history.map((h, i) => (
                <li key={h.id} className="ml-5">
                  <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">{formatDate(h.meetingDate)}</span>
                      <div className="flex items-center gap-1.5">
                        {h.outcome && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${OUTCOME_BADGE[h.outcome] ?? OUTCOME_BADGE.OTHER}`}>
                            {OUTCOME_EMOJI[h.outcome] ?? "📝"} {OUTCOME_LABEL[h.outcome] ?? h.outcome}
                          </span>
                        )}
                        {i === 0 && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Latest</span>}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">By: {h.completedBy}</p>
                    {h.notes && <p className="text-sm text-gray-700 mt-2 leading-relaxed whitespace-pre-wrap">{h.notes}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        {meeting.history.length > 0 && (
          <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Mistakenly marked done? Undo removes the latest entry.
            </p>
            <button
              onClick={handleUndo}
              disabled={undoing}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 transition-colors disabled:opacity-60 font-medium"
            >
              {undoing ? "Undoing…" : "↶ Undo latest"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function Dashboard8020Client({ user }: { user: AppUser }) {
  const [meetData, setMeetData]   = useState<MeetingsData | null>(null)
  const [dashData, setDashData]   = useState<DashboardData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState("")
  const [doneModal, setDoneModal] = useState<MeetingSchedule | null>(null)
  const [histModal, setHistModal] = useState<MeetingSchedule | null>(null)
  const [othersOpen, setOthersOpen] = useState(false)

  // Filters
  const [filterTier,    setFilterTier]    = useState("")
  const [filterStatus,  setFilterStatus]  = useState("")
  const [filterPerson,  setFilterPerson]  = useState("")
  const [filterCountry, setFilterCountry] = useState("")
  const [search,        setSearch]        = useState("")

  // Pagination
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const fetchAll = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const params = new URLSearchParams()
      if (filterTier)    params.set("tier",    filterTier)
      if (filterPerson)  params.set("person",  filterPerson)
      if (filterCountry) params.set("country", filterCountry)

      const [dashRes, meetRes] = await Promise.all([
        fetch("/api/8020/dashboard"),
        fetch(`/api/8020/meetings?${params}`),
      ])
      if (!dashRes.ok || !meetRes.ok) throw new Error("Failed to load data")
      setDashData(await dashRes.json())
      setMeetData(await meetRes.json())
    } catch {
      setError("Failed to load 80/20 data. Check that '80/20 Buyers' sheet is accessible.")
    } finally {
      setLoading(false)
    }
  }, [filterTier, filterPerson, filterCountry])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Sync now — clears the server cache (so direct sheet edits reflect immediately), then refetches
  const syncNow = useCallback(async () => {
    setLoading(true)
    try { await fetch("/api/admin/refresh-cache", { method: "POST" }) } catch {}
    await fetchAll()
  }, [fetchAll])

  function handleMeetingDone(updated: MeetingSchedule) {
    setMeetData((prev) => prev ? {
      ...prev,
      meetings: prev.meetings.map((m) => m.id === updated.id ? updated : m),
    } : prev)
    fetch("/api/8020/dashboard").then((r) => r.json()).then(setDashData).catch(() => {})
  }

  // Client-side filters that the API doesn't handle
  const displayed = meetData?.meetings.filter((m) => {
    if (filterStatus && m.displayStatus !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !m.buyerName.toLowerCase().includes(q) &&
        !m.country.toLowerCase().includes(q) &&
        !m.responsiblePerson.toLowerCase().includes(q)
      ) return false
    }
    return true
  }) ?? []

  // Pagination — reset to page 1 whenever filters or page size change
  useEffect(() => { setPage(1) }, [filterStatus, filterTier, filterPerson, filterCountry, search, pageSize])
  const totalPages = Math.max(1, Math.ceil(displayed.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageStart  = (safePage - 1) * pageSize
  const pageEnd    = pageStart + pageSize
  const pageRows   = displayed.slice(pageStart, pageEnd)

  if (loading) return (
    <div className="p-6 space-y-4">
      <div className="h-8 w-48 bg-gray-100 rounded-lg animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
      <div className="h-96 bg-gray-100 rounded-xl animate-pulse" />
    </div>
  )

  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm space-y-2">
        <p className="font-semibold">Could not load 80/20 data</p>
        <p>{error}</p>
        <button onClick={fetchAll} className="mt-2 text-xs underline">Retry</button>
      </div>
    </div>
  )

  const { stats, dueToday, totalTarget, totalActual, overallAchievementPct, others } = dashData!

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-screen-2xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">80/20 Key Accounts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Targets &amp; tier from <strong>80/20 Buyers</strong> sheet · Actuals from <strong>PI Backend Master</strong> · Tier-1 every 15d · Tier-2 every 20d · Tier-3 every 30d
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-2 rounded-xl border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-colors flex items-center gap-1.5"
          >
            📊 Open Sheet
          </a>
          <button
            onClick={syncNow}
            title="Clear cache & reload — reflects direct Google-Sheet edits immediately"
            className="text-xs px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            ↻ Refresh (sync sheet)
          </button>
        </div>
      </div>

      {/* Stats grid — Performance + Meeting status + OTHERS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <StatCard
          label="Monitored Buyers"
          value={stats.totalMonitored}
          sub={`T1: ${stats.tier1Count} · T2: ${stats.tier2Count} · T3: ${stats.tier3Count}`}
          accent="bg-blue-50 border-blue-200"
        />
        <StatCard
          label="Total Target"
          value={fmt(totalTarget)}
          sub={`${stats.totalMonitored} monitored buyers · FY 2026-27`}
          accent="bg-violet-50 border-violet-200"
        />
        <StatCard
          label="Total Actual"
          value={fmt(totalActual)}
          sub={`${stats.totalMonitored} monitored only · confirmed PIs`}
          accent="bg-cyan-50 border-cyan-200"
        />
        <StatCard
          label="Achievement"
          value={`${overallAchievementPct}%`}
          sub={`gap: ${fmt(totalActual - totalTarget)}`}
          accent={overallAchievementPct >= 100 ? "bg-green-50 border-green-200" : overallAchievementPct >= 70 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}
        />
        <StatCard
          label="Overdue Meetings"
          value={stats.overdue}
          sub={dueToday ? `${dueToday} due today` : `${stats.dueSoon} due soon`}
          accent={stats.overdue > 0 ? "bg-red-50 border-red-300" : "bg-white border-gray-200"}
        />
        <StatCard
          label="Done This Month"
          value={stats.completedThisMonth}
          sub="meetings completed"
          accent="bg-green-50 border-green-200"
        />
        {/* OTHERS — clickable to expand */}
        <button
          onClick={() => setOthersOpen((v) => !v)}
          className={`text-left rounded-xl border p-4 transition-all ${
            othersOpen
              ? "bg-gray-800 border-gray-800 text-white"
              : "bg-gray-50 border-gray-200 hover:bg-gray-100"
          }`}
        >
          <p className={`text-xs font-semibold uppercase tracking-wide flex items-center justify-between ${othersOpen ? "text-gray-300" : "text-gray-500"}`}>
            Others
            <span className={othersOpen ? "rotate-180 transition-transform" : "transition-transform"}>▾</span>
          </p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${othersOpen ? "text-white" : "text-gray-900"}`}>{others.count}</p>
          <p className={`text-xs mt-0.5 ${othersOpen ? "text-gray-300" : "text-gray-400"}`}>
            tgt {fmt(others.totalTarget)} · act {fmt(others.totalActual)} ({others.achievementPct}%)
          </p>
        </button>
      </div>

      {/* OTHERS expandable panel */}
      {othersOpen && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
            <div>
              <p className="text-sm font-semibold text-gray-700">Non-monitored buyers ({others.count})</p>
              <p className="text-xs text-gray-500 mt-0.5">
                These buyers are in the 80/20 sheet but classified as OTHERS — not in meeting cycle, but performance is tracked.
              </p>
            </div>
            <button
              onClick={() => setOthersOpen(false)}
              className="text-xs text-gray-400 hover:text-gray-700"
            >
              Close ✕
            </button>
          </div>
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Buyer</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Country</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Responsible</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Ach %</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {others.buyers
                  .slice()
                  .sort((a, b) => b.target - a.target)
                  .map((b, i) => (
                    <tr key={`${b.buyerName}__${b.country}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs text-gray-400 text-center tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 text-gray-800 max-w-[260px] truncate">{b.buyerName}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{b.country}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 max-w-[120px] truncate">{b.responsiblePerson || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(b.target)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={b.actual > 0 ? "font-semibold text-gray-900" : "text-gray-400"}>{fmt(b.actual)}</span>
                      </td>
                      <td className="px-3 py-2 text-center"><AchievementChip pct={b.achievementPct} /></td>
                      <td className="px-3 py-2 text-center text-xs text-gray-500">{formatDate(b.lastOrderDate)}</td>
                    </tr>
                  ))}
                {others.buyers.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">No OTHERS buyers found.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold text-xs sticky bottom-0">
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-gray-800 uppercase tracking-wide" colSpan={3}>
                    Grand Total ({others.count})
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(others.totalTarget)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(others.totalActual)}</td>
                  <td className="px-3 py-2 text-center"><AchievementChip pct={others.achievementPct} /></td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex flex-wrap gap-2 items-center">
          {(["", "OVERDUE", "DUE_SOON", "UPCOMING"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                filterStatus === s
                  ? s === "OVERDUE"  ? "bg-red-600 text-white border-red-600"
                  : s === "DUE_SOON" ? "bg-amber-500 text-white border-amber-500"
                  : s === "UPCOMING" ? "bg-green-600 text-white border-green-600"
                  : "bg-gray-800 text-white border-gray-800"
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {s === "" ? "All" : STATUS_LABEL[s]}
              {s === "OVERDUE"  && stats.overdue  > 0 && <span className="ml-1.5 bg-white/30 rounded-full px-1.5">{stats.overdue}</span>}
              {s === "DUE_SOON" && stats.dueSoon  > 0 && <span className="ml-1.5 bg-white/30 rounded-full px-1.5">{stats.dueSoon}</span>}
            </button>
          ))}

          <div className="w-px h-5 bg-gray-200 self-stretch" />

          <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-green-400">
            <option value="">All Tiers</option>
            <option value="TIER1">Tier 1 ({stats.tier1Count})</option>
            <option value="TIER2">Tier 2 ({stats.tier2Count})</option>
            <option value="TIER3">Tier 3 ({stats.tier3Count})</option>
          </select>

          {meetData && (
            <>
              <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-green-400">
                <option value="">All Owners</option>
                {meetData.filterOptions.persons.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>

              <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-green-400">
                <option value="">All Countries</option>
                {meetData.filterOptions.countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </>
          )}

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search buyer…"
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-400 w-48"
          />
        </div>
      </div>

      {/* Main consolidated table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">
            {displayed.length} buyer{displayed.length !== 1 ? "s" : ""}
          </span>
          <span className="text-xs text-gray-400">Click ✓ Done to log a meeting · Sunday due dates auto-shift to Monday</span>
        </div>

        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-8">#</th>
                <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Buyer</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Tier</th>
                <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Responsible</th>
                <th className="px-2 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
                <th className="px-2 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Ach %</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Last Meeting</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Next Due</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-sm text-gray-400">
                    No buyers match the selected filters.
                  </td>
                </tr>
              )}
              {pageRows.map((m, i) => (
                <tr
                  key={m.id}
                  className={`transition-colors hover:bg-gray-50 ${
                    m.displayStatus === "OVERDUE" ? "bg-red-50/40" :
                    m.displayStatus === "DUE_SOON" ? "bg-amber-50/30" : ""
                  }`}
                >
                  <td className="px-2 py-2.5 text-gray-400 tabular-nums text-center text-xs">{pageStart + i + 1}</td>
                  <td className="px-2 py-2.5 max-w-[220px]">
                    <Link
                      href={`/buyers/${buyerSlug(m.buyerName)}`}
                      className="font-semibold text-gray-800 truncate block hover:text-green-700 hover:underline transition-colors"
                      title={`Open ${m.buyerName} workspace`}
                    >
                      {m.buyerName}
                    </Link>
                    <Link
                      href={`/countries/${m.country.toUpperCase()}`}
                      className="text-[10px] text-gray-400 mt-0.5 block hover:text-blue-600 hover:underline transition-colors"
                      title={`Open ${m.country} workspace`}
                    >
                      {m.country}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5 text-center"><TierBadge tier={m.tier} /></td>
                  <td className="px-2 py-2.5 text-xs text-gray-700 max-w-[120px] truncate">
                    <p className="truncate">{m.responsiblePerson || "—"}</p>
                    {m.salesCoordinator && <p className="text-[10px] text-gray-400 truncate">{m.salesCoordinator}</p>}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">{fmt(m.target)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    <span className={m.actual > 0 ? "font-semibold text-gray-900" : "text-gray-400"}>{fmt(m.actual)}</span>
                  </td>
                  <td className="px-2 py-2.5 text-center"><AchievementChip pct={m.achievementPct} /></td>
                  <td className="px-2 py-2.5 text-center text-xs text-gray-500">{formatDate(m.lastMeetingDate)}</td>
                  <td className="px-2 py-2.5 text-center text-xs">
                    <p className="font-medium text-gray-700">{formatDate(m.nextDueDate)}</p>
                    <DaysChip days={m.daysRemaining} />
                  </td>
                  <td className="px-2 py-2.5 text-center"><StatusBadge status={m.displayStatus} /></td>
                  <td className="px-2 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => setDoneModal(m)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                          m.displayStatus === "OVERDUE"  ? "bg-red-600 text-white hover:bg-red-700"
                          : m.displayStatus === "DUE_SOON" ? "bg-amber-500 text-white hover:bg-amber-600"
                          : "bg-green-600 text-white hover:bg-green-700"
                        }`}
                      >
                        ✓ Done
                      </button>
                      {m.history.length > 0 && (
                        <button
                          onClick={() => setHistModal(m)}
                          className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                          title="View meeting history"
                        >
                          📋 {m.history.length}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {displayed.length > 0 && (() => {
              const t = displayed.reduce(
                (acc, r) => ({
                  target: acc.target + r.target,
                  actual: acc.actual + r.actual,
                }),
                { target: 0, actual: 0 }
              )
              const pct = t.target > 0 ? Math.round((t.actual / t.target) * 100) : 0
              return (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold text-xs">
                    <td className="px-2 py-3"></td>
                    <td className="px-2 py-3 text-gray-800 uppercase tracking-wide" colSpan={3}>
                      Grand Total ({displayed.length})
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">{fmt(t.target)}</td>
                    <td className="px-2 py-3 text-right tabular-nums">{fmt(t.actual)}</td>
                    <td className="px-2 py-3 text-center"><AchievementChip pct={pct} /></td>
                    <td className="px-2 py-3" colSpan={4}></td>
                  </tr>
                </tfoot>
              )
            })()}
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-100">
          {displayed.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-400">No buyers match the filters.</div>
          )}
          {pageRows.map((m) => (
            <div key={m.id} className={`p-4 space-y-3 ${
              m.displayStatus === "OVERDUE" ? "bg-red-50/40" :
              m.displayStatus === "DUE_SOON" ? "bg-amber-50/30" : ""
            }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm">{m.buyerName}</p>
                  <p className="text-xs text-gray-400">{m.country} · {m.responsiblePerson || "—"}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <TierBadge tier={m.tier} />
                  <AchievementChip pct={m.achievementPct} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
                <span>Target: <strong className="text-gray-900 tabular-nums">{fmt(m.target)}</strong></span>
                <span>Actual: <strong className="text-gray-900 tabular-nums">{fmt(m.actual)}</strong></span>
                <span>Last: <strong>{formatDate(m.lastMeetingDate)}</strong></span>
                <span>Due: <strong>{formatDate(m.nextDueDate)}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={m.displayStatus} />
                <button
                  onClick={() => setDoneModal(m)}
                  className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-colors ${
                    m.displayStatus === "OVERDUE" ? "bg-red-600 text-white"
                    : m.displayStatus === "DUE_SOON" ? "bg-amber-500 text-white"
                    : "bg-green-600 text-white"
                  }`}
                >
                  ✓ Mark Done
                </button>
                {m.history.length > 0 && (
                  <button onClick={() => setHistModal(m)}
                    className="py-2 px-3 text-sm rounded-xl border border-gray-200 text-gray-500">
                    📋
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {displayed.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-500 tabular-nums">
              Showing <strong className="text-gray-800">{pageStart + 1}–{Math.min(pageEnd, displayed.length)}</strong> of <strong className="text-gray-800">{displayed.length}</strong>
            </span>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
              >
                {[10, 15, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n} / page</option>
                ))}
              </select>
              <button
                onClick={() => setPage(1)}
                disabled={safePage <= 1}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >« First</button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >← Prev</button>
              <span className="text-xs text-gray-600 tabular-nums px-1">
                Page <strong>{safePage}</strong> / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >Next →</button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={safePage >= totalPages}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >Last »</button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {doneModal && (
        <DoneModal meeting={doneModal} onClose={() => setDoneModal(null)} onDone={handleMeetingDone} />
      )}
      {histModal && (
        <HistoryPanel
          meeting={histModal}
          onClose={() => setHistModal(null)}
          onUndo={handleMeetingDone}
        />
      )}
    </div>
  )
}
