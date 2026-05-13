"use client"

import { useState } from "react"
import {
  MEETING_OUTCOMES,
  OUTCOME_LABEL,
  OUTCOME_BADGE,
  OUTCOME_EMOJI,
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
  const [form,   setForm]   = useState({
    meetingDate: todayISO(),
    outcome:     "FOLLOW_UP" as typeof MEETING_OUTCOMES[number],
    notes:       "",
  })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState("")
  const [nextDue, setNextDue] = useState("")

  const overdue = initial.daysRemaining < 0
  const accent  = overdue ? "border-red-400 bg-red-50" : "border-amber-400 bg-amber-50"
  const statusText = overdue
    ? `⚠️ Overdue by ${Math.abs(initial.daysRemaining)} days`
    : initial.daysRemaining === 0
      ? "🔔 Due Today"
      : `⏰ Due in ${initial.daysRemaining} days`

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
          meetingDate: form.meetingDate,
          outcome:     form.outcome,
          notes:       form.notes,
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

  if (stage === "done") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-green-200 overflow-hidden">
          <div className="bg-green-600 px-6 py-5 text-white text-center">
            <div className="text-4xl mb-2">✓</div>
            <h1 className="text-xl font-bold">Meeting Recorded!</h1>
            <p className="text-sm text-green-100 mt-1">
              {initial.buyerName} — {OUTCOME_EMOJI[form.outcome]} {OUTCOME_LABEL[form.outcome]}
            </p>
          </div>
          <div className="p-6 space-y-4 text-center">
            {nextDue && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">Next Meeting Due</p>
                <p className="text-lg font-bold text-blue-900">{formatDate(nextDue)}</p>
              </div>
            )}
            {form.notes && (
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-left">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Your Notes</p>
                <p className="text-sm text-gray-700 leading-relaxed">{form.notes}</p>
              </div>
            )}
            <p className="text-xs text-gray-400">
              You can close this tab now. The meeting has been saved.
            </p>
            <p className="text-xs text-gray-300">Shazia Rice · 80/20 Key Account System</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="text-center">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
            Shazia Rice · 80/20 Key Account System
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Mark Meeting as Done</h1>
        </div>

        {/* Meeting card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className={`px-5 py-4 border-b ${accent}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{initial.buyerName}</h2>
                <p className="text-sm text-gray-500">{initial.country}</p>
              </div>
              <span className="text-xs font-semibold bg-white border border-gray-200 px-2 py-1 rounded-full text-gray-700">
                {TIER_LABEL[initial.tier] ?? initial.tier}
              </span>
            </div>
            <p className="text-sm font-semibold mt-2 text-gray-800">{statusText}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Scheduled: <strong>{formatDate(initial.nextDueDate)}</strong>
            </p>
          </div>

          {/* Performance */}
          <div className="px-5 py-3 grid grid-cols-3 gap-3 border-b border-gray-100 text-center">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Target</p>
              <p className="text-base font-bold text-gray-900">{fmt(initial.target)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Actual</p>
              <p className="text-base font-bold text-gray-900">{fmt(initial.actual)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">ACH%</p>
              <p className={`text-base font-bold ${
                initial.achievementPct >= 100 ? "text-green-600"
                : initial.achievementPct >= 70  ? "text-amber-600"
                : "text-red-600"
              }`}>{initial.achievementPct}%</p>
            </div>
          </div>

          <div className="px-5 py-3 text-xs text-gray-500 grid grid-cols-2 gap-1">
            <span>Responsible: <strong className="text-gray-700">{initial.responsiblePerson || "—"}</strong></span>
            <span>Coordinator: <strong className="text-gray-700">{initial.salesCoordinator || "—"}</strong></span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-5">

          {/* Date */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Meeting Date
            </label>
            <input
              type="date"
              required
              value={form.meetingDate}
              max={todayISO()}
              onChange={(e) => setForm((f) => ({ ...f, meetingDate: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Outcome */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Outcome <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {MEETING_OUTCOMES.map((o) => (
                <button
                  type="button"
                  key={o}
                  onClick={() => setForm((f) => ({ ...f, outcome: o }))}
                  className={`text-left text-xs px-3 py-2.5 rounded-xl border transition-all ${
                    form.outcome === o
                      ? `${OUTCOME_BADGE[o]} ring-2 ring-offset-1 ring-green-400 font-bold`
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span className="mr-1">{OUTCOME_EMOJI[o]}</span>
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Meeting Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="e.g. Discussed pricing for Q3. Buyer confirmed 3 containers. PI to be sent by Friday."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 text-sm font-bold rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
          >
            {saving ? "Saving…" : "✓ Confirm — Meeting Done"}
          </button>

          <p className="text-[11px] text-gray-400 text-center">
            This link is single-use and valid for 7 days.
          </p>
        </form>
      </div>
    </div>
  )
}
