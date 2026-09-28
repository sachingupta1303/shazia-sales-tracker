"use client"

import { useState } from "react"
import type { CoordinatorRiskBuyer } from "@/types"

const REASONS = [
  "Price high", "Competitor", "Quality complaint", "Buyer stock full",
  "Market slow", "Payment issue", "No response", "Other",
]
const EXPECTED = ["This month", "Next month", "In 2-3 months", "Later", "Not sure"]

interface Entry { reason: string; remark: string; actionPlan: string; expectedOrder: string }

export function CoordReviewClient({
  token, coordinator, fy, week, buyers, alreadySubmitted,
}: {
  token: string; coordinator: string; fy: string; week: number
  buyers: CoordinatorRiskBuyer[]; alreadySubmitted: boolean
}) {
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  const set = (name: string, k: keyof Entry, v: string) =>
    setEntries((e) => {
      const prev = e[name] ?? { reason: "", remark: "", actionPlan: "", expectedOrder: "" }
      return { ...e, [name]: { ...prev, [k]: v } }
    })

  const filledCount = buyers.filter((b) => {
    const e = entries[b.buyerName]
    return e && (e.reason || e.remark || e.actionPlan || e.expectedOrder)
  }).length

  const submit = async () => {
    setBusy(true); setError("")
    try {
      const reviews = buyers
        .map((b) => ({ buyerName: b.buyerName, ...entries[b.buyerName] }))
        .filter((r) => r.reason || r.remark || r.actionPlan || r.expectedOrder)
      if (!reviews.length) { setError("Please fill at least one buyer's reason."); setBusy(false); return }
      const res = await fetch(`/api/coord-review/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviews }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || "Submit failed. Please try again."); setBusy(false); return }
      setDone(true)
    } catch { setError("Network error. Please try again.") }
    finally { setBusy(false) }
  }

  if (done) {
    return (
      <Shell coordinator={coordinator} week={week} fy={fy}>
        <div className="bg-white rounded-2xl border border-green-200 p-8 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-2xl mx-auto">✓</div>
          <h2 className="text-lg font-bold text-gray-900">Review submitted!</h2>
          <p className="text-sm text-gray-600">Thank you, {coordinator}. Your reasons have reached the manager. This week&apos;s reminders will now stop.</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell coordinator={coordinator} week={week} fy={fy}>
      {alreadySubmitted && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-2">
          You have already submitted this week — submitting again will update it.
        </div>
      )}

      {buyers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-600">
          🎉 All your buyers are on track this week — no review pending.
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            The <b>{buyers.length}</b> buyers below have no orders / very low orders this year. Please fill a reason & next step for each.
          </p>

          <div className="space-y-2">
            {buyers.map((b, i) => {
              const e = entries[b.buyerName] ?? { reason: "", remark: "", actionPlan: "", expectedOrder: "" }
              return (
                <div key={b.buyerName} className="bg-white rounded-xl border border-gray-200 p-3">
                  {/* Buyer line + status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm min-w-0 truncate">
                      <span className="text-xs text-gray-400 mr-1">#{i + 1}</span>
                      <span className="font-bold text-gray-900">{b.buyerName}</span>
                      <span className="text-xs text-gray-500 ml-1">· {b.country} · {b.tier.replace("TIER", "T")}</span>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${b.status === "NO_ORDER" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {b.status === "NO_ORDER" ? "No order" : `Low · ${b.achievementPct}%`}
                    </span>
                  </div>
                  {/* One-line context */}
                  <div className="text-xs text-gray-500 mt-1">
                    Target <b className="text-gray-700">{b.target}</b> · So far <b className={b.actual === 0 ? "text-red-600" : "text-gray-700"}>{b.actual}</b> ({b.achievementPct}%) · Last yr {b.lastYear} · Last order {b.lastOrderDate || "—"}{b.daysSinceOrder != null ? ` (${b.daysSinceOrder}d)` : ""}
                  </div>
                  {/* Inputs — 2×2 compact, placeholders instead of stacked labels */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    <select value={e.reason} onChange={(ev) => set(b.buyerName, "reason", ev.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                      <option value="">Reason — why no order</option>
                      {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select value={e.expectedOrder} onChange={(ev) => set(b.buyerName, "expectedOrder", ev.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                      <option value="">Expected next order</option>
                      {EXPECTED.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <input value={e.remark} onChange={(ev) => set(b.buyerName, "remark", ev.target.value)}
                      placeholder="Remark (detail)"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    <input value={e.actionPlan} onChange={(ev) => set(b.buyerName, "actionPlan", ev.target.value)}
                      placeholder="Action plan / next step"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </div>
              )
            })}
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2">{error}</div>}

          <div className="pt-2 pb-8">
            <p className="text-center text-xs text-gray-400 mb-2">
              That&apos;s all {buyers.length} buyers. You can fill only the ones you know — the rest can stay blank.
            </p>
            <button onClick={submit} disabled={busy || filledCount === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-semibold bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-40">
              {busy
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Submitting…</>
                : <>Submit Review ({filledCount}/{buyers.length} filled)</>}
            </button>
          </div>
        </>
      )}
    </Shell>
  )
}

function Shell({ coordinator, week, fy, children }: { coordinator: string; week: number; fy: string; children: React.ReactNode }) {
  // h-screen + overflow-y-auto: this page owns its own scroll, because the app's
  // root <body> is overflow-hidden (for the dashboard) which otherwise clips it.
  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <div className="bg-teal-700 text-white">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="text-xs opacity-80 tracking-wide">SHAZIA RICE · WEEKLY REVIEW</div>
          <div className="text-lg font-bold mt-0.5">Buyers needing a reason</div>
          <div className="text-sm opacity-90 mt-0.5">{coordinator} · Week {week} · FY {fy}</div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-2">{children}</div>
    </div>
  )
}
