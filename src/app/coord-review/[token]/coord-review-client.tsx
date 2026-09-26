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
      if (!reviews.length) { setError("Kam se kam ek buyer ka reason bharo."); setBusy(false); return }
      const res = await fetch(`/api/coord-review/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviews }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || "Submit fail hua. Dobara try karo."); setBusy(false); return }
      setDone(true)
    } catch { setError("Network error. Dobara try karo.") }
    finally { setBusy(false) }
  }

  if (done) {
    return (
      <Shell coordinator={coordinator} week={week} fy={fy}>
        <div className="bg-white rounded-2xl border border-green-200 p-8 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-2xl mx-auto">✓</div>
          <h2 className="text-lg font-bold text-gray-900">Review submit ho gaya!</h2>
          <p className="text-sm text-gray-600">Shukriya {coordinator}. Aapke reasons manager ke paas pahunch gaye. Ab is hafte ke reminder band ho jayenge.</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell coordinator={coordinator} week={week} fy={fy}>
      {alreadySubmitted && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-2">
          Aap is hafte pehle bhar chuke ho — dobara bharoge to update ho jayega.
        </div>
      )}

      {buyers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-600">
          🎉 Is hafte aapke saare buyers theek hain — koi review pending nahi.
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            Neeche <b>{buyers.length}</b> buyers ke orders nahi aa rahe / bahut kam hain. Har ek ka reason & next step bharo.
          </p>

          <div className="space-y-4">
            {buyers.map((b, i) => {
              const e = entries[b.buyerName] ?? { reason: "", remark: "", actionPlan: "", expectedOrder: "" }
              return (
                <div key={b.buyerName} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  {/* Buyer context (read-only) */}
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <span className="text-xs text-gray-400 mr-1">#{i + 1}</span>
                        <span className="font-bold text-gray-900">{b.buyerName}</span>
                        <span className="text-xs text-gray-500 ml-2">{b.country} · {b.tier.replace("TIER", "T")}</span>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${b.status === "NO_ORDER" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {b.status === "NO_ORDER" ? "No order" : `Low · ${b.achievementPct}%`}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2 text-xs">
                      <Stat label="Target" value={String(b.target)} />
                      <Stat label="Ab tak" value={`${b.actual} (${b.achievementPct}%)`} danger={b.actual === 0} />
                      <Stat label="Last year" value={String(b.lastYear)} />
                      <Stat label="Last order" value={b.lastOrderDate || "—"} />
                      <Stat label="Kitne din" value={b.daysSinceOrder != null ? `${b.daysSinceOrder}d` : "—"} />
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="p-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="block text-xs font-semibold text-gray-600 mb-1">Reason (order kyun nahi)</span>
                      <select value={e.reason} onChange={(ev) => set(b.buyerName, "reason", ev.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                        <option value="">— select —</option>
                        {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="block text-xs font-semibold text-gray-600 mb-1">Expected next order</span>
                      <select value={e.expectedOrder} onChange={(ev) => set(b.buyerName, "expectedOrder", ev.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                        <option value="">— select —</option>
                        {EXPECTED.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="block text-xs font-semibold text-gray-600 mb-1">Remark (detail)</span>
                      <input value={e.remark} onChange={(ev) => set(b.buyerName, "remark", ev.target.value)}
                        placeholder="e.g. buyer ne bola rate zyada hai"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="block text-xs font-semibold text-gray-600 mb-1">Action plan / next step</span>
                      <input value={e.actionPlan} onChange={(ev) => set(b.buyerName, "actionPlan", ev.target.value)}
                        placeholder="e.g. naya rate bhejenge, sample offer karenge"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </label>
                  </div>
                </div>
              )
            })}
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2">{error}</div>}

          <div className="sticky bottom-0 bg-gray-50 py-3">
            <button onClick={submit} disabled={busy || filledCount === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-semibold bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-40">
              {busy
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Submitting…</>
                : <>Submit Review ({filledCount}/{buyers.length} bhare)</>}
            </button>
          </div>
        </>
      )}
    </Shell>
  )
}

function Shell({ coordinator, week, fy, children }: { coordinator: string; week: number; fy: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-teal-700 text-white">
        <div className="max-w-3xl mx-auto px-4 py-5">
          <div className="text-xs opacity-80 tracking-wide">SHAZIA RICE · WEEKLY REVIEW</div>
          <div className="text-xl font-bold mt-0.5">Buyers needing a reason</div>
          <div className="text-sm opacity-90 mt-0.5">{coordinator} · Week {week} · FY {fy}</div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">{children}</div>
    </div>
  )
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 px-2 py-1.5">
      <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`font-bold ${danger ? "text-red-600" : "text-gray-800"}`}>{value}</div>
    </div>
  )
}
