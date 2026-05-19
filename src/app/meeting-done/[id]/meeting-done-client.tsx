"use client"

import { useState } from "react"
import {
  TIER_LABEL,
  formatDate,
  todayISO,
} from "@/lib/8020-utils"
import type { MeetingSchedule } from "@/types"

function fmt(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
}

export function MeetingDoneClient({
  meeting: initial,
  token,
}: {
  meeting: MeetingSchedule
  token:   string
}) {
  const [stage,  setStage]  = useState<"form" | "done">("form")
  const [notes,  setNotes]  = useState(initial.meetingRemarks ?? "")
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState("")
  const [nextDue, setNextDue] = useState("")

  const overdue    = initial.daysRemaining < 0
  const statusText = overdue
    ? `Overdue by ${Math.abs(initial.daysRemaining)} day${Math.abs(initial.daysRemaining) === 1 ? "" : "s"}`
    : initial.daysRemaining === 0
      ? "Due Today"
      : `Due in ${initial.daysRemaining} day${initial.daysRemaining === 1 ? "" : "s"}`
  const statusColor = overdue ? "text-red-600" : "text-amber-600"
  const statusBg    = overdue ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"

  const tierLabel = TIER_LABEL[initial.tier] ?? initial.tier
  const tierColor = initial.tier === "TIER1"
    ? "bg-purple-100 text-purple-700"
    : initial.tier === "TIER2"
      ? "bg-blue-100 text-blue-700"
      : "bg-gray-100 text-gray-600"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/8020/meetings/complete-token", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          meetingId:   initial.id,
          token,
          meetingDate: todayISO(),
          outcome:     "FOLLOW_UP",
          notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`)
        return
      }
      setNextDue(data.meeting?.nextDueDate ?? "")
      setStage("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  /* ── Success screen ─────────────────────────────────────────────────────── */
  if (stage === "done") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

          {/* Green header */}
          <div className="bg-green-600 px-6 py-5">
            <p className="text-white/70 text-xs font-bold uppercase tracking-wider">80/20 Key Account · Done</p>
            <h1 className="text-white text-xl font-bold mt-1">✓ Meeting Recorded!</h1>
            <p className="text-white/80 text-sm mt-0.5">{initial.buyerName} · {initial.country}</p>
          </div>

          <div className="p-6 space-y-4">
            {nextDue && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-green-600 font-bold uppercase tracking-wide mb-1">Next Meeting Due</p>
                <p className="text-base font-bold text-green-900">{formatDate(nextDue)}</p>
              </div>
            )}
            {notes && (
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-1">Remarks Saved</p>
                <p className="text-sm text-gray-700 leading-relaxed">{notes}</p>
              </div>
            )}
            <p className="text-xs text-center text-gray-400">You can close this tab. Meeting has been recorded.</p>
            <p className="text-xs text-center text-gray-300">Shazia Rice · 80/20 Key Account System</p>
          </div>
        </div>
      </div>
    )
  }

  /* ── Form screen ─────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

        {/* Green header */}
        <div className="bg-green-600 px-6 py-5">
          <p className="text-white/70 text-xs font-bold uppercase tracking-wider">80/20 Key Account · Mark Done</p>
          <h1 className="text-white text-xl font-bold mt-1">✓ Mark Meeting as Done</h1>
          <p className="text-white/80 text-sm mt-0.5">{initial.buyerName} · {initial.country}</p>
        </div>

        <div className="p-6 space-y-5">

          {/* Buyer info */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Tier</span>
              <span className={`font-bold text-xs px-2.5 py-1 rounded-full ${tierColor}`}>{tierLabel}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Scheduled Date</span>
              <span className={`font-semibold ${statusColor}`}>{formatDate(initial.nextDueDate)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Status</span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${statusBg}`}>{statusText}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Responsible</span>
              <span className="font-semibold text-gray-800">{initial.responsiblePerson || "—"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Coordinator</span>
              <span className="font-semibold text-gray-800">{initial.salesCoordinator || "—"}</span>
            </div>
          </div>

          {/* Performance */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-50 rounded-xl py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Target</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{fmt(initial.target)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Actual</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{fmt(initial.actual)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">ACH%</p>
              <p className={`text-base font-bold mt-0.5 ${
                initial.achievementPct >= 100 ? "text-green-600"
                : initial.achievementPct >= 70  ? "text-amber-600"
                : "text-red-600"
              }`}>{initial.achievementPct}%</p>
            </div>
          </div>

          {/* Remarks */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                Remarks / Notes <span className="normal-case font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Meeting done. Discussed Q3 pricing. Buyer confirmed 3 containers..."
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-50"
              style={{ background: saving ? "#16a34a99" : "#16a34a" }}
            >
              {saving ? "Saving…" : "✓ Mark as Done & Save"}
            </button>

            <p className="text-xs text-center text-gray-400">
              No login required. You can use this link multiple times to update remarks.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
