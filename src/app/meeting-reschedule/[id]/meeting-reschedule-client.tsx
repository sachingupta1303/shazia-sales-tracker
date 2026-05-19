"use client"

import { useState } from "react"
import type { MeetingSchedule } from "@/types"

const QUICK_OPTIONS = [
  { label: "7 days",  days: 7  },
  { label: "10 days", days: 10 },
  { label: "15 days", days: 15 },
  { label: "30 days", days: 30 },
]

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

function formatDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    })
  } catch { return iso }
}

export function MeetingRescheduleClient({
  meeting, token,
}: {
  meeting: MeetingSchedule
  token:   string
}) {
  const [newDate,  setNewDate]  = useState(addDays(7))
  const [remarks,  setRemarks]  = useState("")
  const [loading,  setLoading]  = useState(false)
  const [done,     setDone]     = useState(false)
  const [error,    setError]    = useState("")

  const handleQuick = (days: number) => setNewDate(addDays(days))

  const handleSubmit = async () => {
    if (!newDate) { setError("Please select a date."); return }
    setLoading(true); setError("")
    try {
      const res = await fetch(`/api/8020/meetings/${encodeURIComponent(meeting.id)}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newDueDate: newDate, remarks }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed")
      setDone(true)
    } catch (e: any) {
      setError(e.message ?? "Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-orange-200 p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-3xl mx-auto">📅</div>
          <h1 className="text-xl font-bold text-gray-900">Meeting Rescheduled!</h1>
          <div className="bg-orange-50 rounded-xl p-4 text-left space-y-2">
            <p className="text-sm text-gray-600"><span className="font-semibold text-gray-800">Buyer:</span> {meeting.buyerName}</p>
            <p className="text-sm text-gray-600"><span className="font-semibold text-gray-800">New Due Date:</span> {formatDate(newDate)}</p>
            {remarks && <p className="text-sm text-gray-600"><span className="font-semibold text-gray-800">Remarks:</span> {remarks}</p>}
          </div>
          <p className="text-xs text-gray-400">Next reminder will be sent based on the new due date.</p>
          <p className="text-xs text-gray-400">Shazia Rice · 80/20 Key Account System</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

        {/* Header */}
        <div className="bg-orange-500 px-6 py-5">
          <p className="text-white/70 text-xs font-bold uppercase tracking-wider">80/20 Key Account · Reschedule</p>
          <h1 className="text-white text-xl font-bold mt-1">📅 Reschedule Meeting</h1>
          <p className="text-white/80 text-sm mt-0.5">{meeting.buyerName} · {meeting.country}</p>
        </div>

        <div className="p-6 space-y-5">

          {/* Buyer info */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Tier</span>
              <span className="font-semibold text-gray-800">{meeting.tier}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Current Due Date</span>
              <span className="font-semibold text-orange-600">{formatDate(meeting.nextDueDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Responsible</span>
              <span className="font-semibold text-gray-800">{meeting.responsiblePerson}</span>
            </div>
          </div>

          {/* Quick select */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Quick Select</p>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_OPTIONS.map(opt => (
                <button key={opt.days} onClick={() => handleQuick(opt.days)}
                  className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    newDate === addDays(opt.days)
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-white text-gray-700 border-gray-200 hover:border-orange-300 hover:text-orange-600"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date picker */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
              Or Pick a Date
            </label>
            <input
              type="date"
              value={newDate}
              min={new Date().toISOString().split("T")[0]}
              onChange={e => setNewDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            {newDate && (
              <p className="text-xs text-orange-600 mt-1 font-medium">{formatDate(newDate)}</p>
            )}
          </div>

          {/* Remarks */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
              Reason / Remarks (optional)
            </label>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="e.g. Buyer travelling, will be back in 2 weeks..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={loading || !newDate}
            className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-50"
            style={{ background: loading ? "#fb923c" : "#f97316" }}>
            {loading ? "Saving…" : "📅 Confirm Reschedule"}
          </button>

          <p className="text-xs text-center text-gray-400">Shazia Rice · 80/20 Key Account System</p>
        </div>
      </div>
    </div>
  )
}
