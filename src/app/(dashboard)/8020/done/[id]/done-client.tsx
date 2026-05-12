"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  MEETING_OUTCOMES,
  OUTCOME_LABEL,
  OUTCOME_BADGE,
  OUTCOME_EMOJI,
  TIER_LABEL,
  TIER_BADGE,
  STATUS_LABEL,
  STATUS_BADGE,
  formatDate,
  todayISO,
} from "@/lib/8020-utils"
import type { AppUser, MeetingSchedule } from "@/types"

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
}

export function MarkDonePageClient({
  meeting: initial,
  user,
}: {
  meeting: MeetingSchedule
  user: AppUser
}) {
  const [meeting, setMeeting] = useState<MeetingSchedule>(initial)
  const [stage,   setStage]   = useState<"form" | "done">(
    initial.history.length > 0 && initial.history[0].meetingDate === todayISO()
      ? "done"   // already marked done today — go straight to confirm/undo
      : "form"
  )
  const [form, setForm] = useState({
    meetingDate: todayISO(),
    outcome:     "FOLLOW_UP" as typeof MEETING_OUTCOMES[number],
    notes:       "",
  })
  const [saving, setSaving]   = useState(false)
  const [undoing, setUndoing] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/8020/meetings/${meeting.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      let payload: { meeting?: MeetingSchedule; error?: string } = {}
      try { payload = await res.json() } catch {}
      if (!res.ok || !payload.meeting) {
        toast.error(payload.error ?? `Server returned ${res.status}`, { duration: 8000 })
        return
      }
      setMeeting(payload.meeting)
      setStage("done")
      toast.success("✓ Meeting marked as done")
    } catch (err) {
      toast.error(`Could not save: ${err instanceof Error ? err.message : "Network error"}`, { duration: 8000 })
    } finally {
      setSaving(false)
    }
  }

  async function handleUndo() {
    if (!confirm("Undo this meeting? The latest history entry will be removed and the next-due date reset.")) return
    setUndoing(true)
    try {
      const res = await fetch(`/api/8020/meetings/${meeting.id}/undo`, { method: "POST" })
      let payload: { meeting?: MeetingSchedule; error?: string } = {}
      try { payload = await res.json() } catch {}
      if (!res.ok || !payload.meeting) {
        toast.error(payload.error ?? `Server returned ${res.status}`, { duration: 8000 })
        return
      }
      setMeeting(payload.meeting)
      setStage("form")
      toast.success("↶ Meeting undone — you can mark it done again below.")
    } catch (err) {
      toast.error(`Could not undo: ${err instanceof Error ? err.message : "Network error"}`, { duration: 8000 })
    } finally {
      setUndoing(false)
    }
  }

  const latestHistory = meeting.history[0]
  const overdue = meeting.daysRemaining < 0

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Back link */}
        <Link
          href="/8020"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          ← Back to 80/20 Dashboard
        </Link>

        {/* Meeting summary card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className={`px-6 py-4 ${
            overdue ? "bg-red-50 border-b border-red-200"
            : meeting.displayStatus === "DUE_SOON" ? "bg-amber-50 border-b border-amber-200"
            : "bg-green-50 border-b border-green-200"
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{meeting.buyerName}</h1>
                <p className="text-sm text-gray-600 mt-0.5">{meeting.country}</p>
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${TIER_BADGE[meeting.tier] ?? "bg-gray-100"}`}>
                {TIER_LABEL[meeting.tier] ?? meeting.tier}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3 flex-wrap text-xs">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold border ${STATUS_BADGE[meeting.displayStatus] ?? "bg-gray-100"}`}>
                {STATUS_LABEL[meeting.displayStatus] ?? meeting.displayStatus}
              </span>
              <span className="text-gray-700">
                Due: <strong>{formatDate(meeting.nextDueDate)}</strong>
                {overdue && <span className="text-red-600 font-semibold ml-1">({Math.abs(meeting.daysRemaining)} days overdue)</span>}
              </span>
            </div>
          </div>

          <div className="px-6 py-4 grid grid-cols-3 gap-4 border-b border-gray-100">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Target</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums">{fmt(meeting.target)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Actual</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums">{fmt(meeting.actual)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Achievement</p>
              <p className={`text-lg font-bold tabular-nums ${
                meeting.achievementPct >= 100 ? "text-green-600"
                : meeting.achievementPct >= 70  ? "text-amber-600"
                : "text-red-600"
              }`}>{meeting.achievementPct}%</p>
            </div>
          </div>

          <div className="px-6 py-3 text-sm text-gray-600 grid grid-cols-2 gap-2">
            <span>Responsible: <strong className="text-gray-800">{meeting.responsiblePerson || "—"}</strong></span>
            <span>Coordinator: <strong className="text-gray-800">{meeting.salesCoordinator || "—"}</strong></span>
            <span>Last meeting: <strong className="text-gray-800">{formatDate(meeting.lastMeetingDate)}</strong></span>
            <span>Logged in as: <strong className="text-gray-800">{user.name}</strong></span>
          </div>
        </div>

        {/* STAGE: FORM */}
        {stage === "form" && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
            <h2 className="text-base font-bold text-gray-900">
              ✓ Mark this meeting as done
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">When did the meeting happen?</label>
              <input
                type="date"
                required
                value={form.meetingDate}
                max={todayISO()}
                onChange={(e) => setForm((f) => ({ ...f, meetingDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                What was the outcome? <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                Meeting output / discussion points
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={4}
                placeholder="e.g. Discussed Q3 pricing. Buyer confirmed 5 containers for September. PI to be sent by Friday. Concerns: shipping cost."
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                This will be saved in the meeting history so the team can review later.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 text-sm font-semibold rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
            >
              {saving ? "Saving…" : "✓ Confirm — Mark as Done"}
            </button>
          </form>
        )}

        {/* STAGE: DONE (confirmation + undo) */}
        {stage === "done" && (
          <div className="bg-white rounded-2xl shadow-sm border border-green-200 p-6 space-y-4">
            <div className="flex items-center gap-3 bg-green-50 -mx-6 -mt-6 px-6 py-4 border-b border-green-100 rounded-t-2xl">
              <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center text-xl font-bold">✓</div>
              <div>
                <h2 className="text-base font-bold text-green-900">Meeting marked as done</h2>
                <p className="text-xs text-green-700">Next due date: <strong>{formatDate(meeting.nextDueDate)}</strong></p>
              </div>
            </div>

            {latestHistory && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800">{formatDate(latestHistory.meetingDate)}</span>
                  {latestHistory.outcome && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${OUTCOME_BADGE[latestHistory.outcome] ?? OUTCOME_BADGE.OTHER}`}>
                      {OUTCOME_EMOJI[latestHistory.outcome]} {OUTCOME_LABEL[latestHistory.outcome] ?? latestHistory.outcome}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">Logged by: {latestHistory.completedBy}</p>
                {latestHistory.notes && (
                  <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap leading-relaxed">{latestHistory.notes}</p>
                )}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold mb-1">⚠️ Marked by mistake?</p>
              <p className="text-xs leading-relaxed">
                If this meeting wasn&apos;t actually done, click Undo. It will remove the
                latest history entry and reset the next-due date.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleUndo}
                disabled={undoing}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-red-200 text-red-700 bg-white hover:bg-red-50 disabled:opacity-60 transition-colors"
              >
                {undoing ? "Undoing…" : "↶ Undo / Cancel"}
              </button>
              <Link
                href="/8020"
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-gray-900 text-white hover:bg-gray-800 transition-colors text-center"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
