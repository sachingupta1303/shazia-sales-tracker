"use client"

import { useState } from "react"
import type { CoordinatorRiskBuyer } from "@/types"

const REASONS = [
  "Price high", "Competitor", "Quality complaint", "Buyer stock full",
  "Market slow", "Payment issue", "No response", "Other",
]
const EXPECTED = ["This month", "Next month", "In 2-3 months", "Later", "Not sure"]

interface Entry { reason: string; remark: string; actionPlan: string; expectedOrder: string }
interface SavedEntry extends Entry { submittedAt: string }

const EMPTY: Entry = { reason: "", remark: "", actionPlan: "", expectedOrder: "" }
const hasContent = (e?: Entry) => !!e && !!(e.reason || e.remark || e.actionPlan || e.expectedOrder)
const sameEntry = (a?: Entry, b?: Entry) =>
  (a?.reason ?? "") === (b?.reason ?? "") && (a?.remark ?? "") === (b?.remark ?? "") &&
  (a?.actionPlan ?? "") === (b?.actionPlan ?? "") && (a?.expectedOrder ?? "") === (b?.expectedOrder ?? "")

function savedAtLabel(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
}

/**
 * Weekly review form (magic link, no login).
 * Everything the coordinator saves stays on this page for the whole FY week
 * (Mon → Sat/Sun): saved answers are pre-filled and marked "Saved", so they can
 * fill a few buyers today and come back for the rest later in the week.
 */
export function CoordReviewClient({
  token, coordinator, fy, week, buyers, saved: initialSaved,
}: {
  token: string; coordinator: string; fy: string; week: number
  buyers: CoordinatorRiskBuyer[]; saved: Record<string, SavedEntry>
}) {
  const [saved, setSaved] = useState<Record<string, SavedEntry>>(initialSaved ?? {})
  const [entries, setEntries] = useState<Record<string, Entry>>(() => {
    const init: Record<string, Entry> = {}
    for (const [name, s] of Object.entries(initialSaved ?? {})) {
      init[name] = { reason: s.reason, remark: s.remark, actionPlan: s.actionPlan, expectedOrder: s.expectedOrder }
    }
    return init
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [onlyPending, setOnlyPending] = useState(false)

  const set = (name: string, k: keyof Entry, v: string) => {
    setNotice("")
    setEntries((e) => ({ ...e, [name]: { ...(e[name] ?? EMPTY), [k]: v } }))
  }

  const savedCount   = buyers.filter((b) => hasContent(saved[b.buyerName])).length
  const changed      = buyers.filter((b) => hasContent(entries[b.buyerName]) && !sameEntry(entries[b.buyerName], saved[b.buyerName]))
  const pendingCount = buyers.length - savedCount
  const shown        = onlyPending ? buyers.filter((b) => !hasContent(saved[b.buyerName])) : buyers

  const save = async () => {
    setBusy(true); setError(""); setNotice("")
    try {
      const reviews = changed.map((b) => ({ buyerName: b.buyerName, ...entries[b.buyerName] }))
      if (!reviews.length) { setError("Nothing new to save — fill or change at least one buyer."); return }
      const res = await fetch(`/api/coord-review/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviews }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || "Save failed. Please try again."); return }
      if (d.saved) setSaved(d.saved)
      else setSaved((s) => {
        const now = new Date().toISOString()
        const next = { ...s }
        for (const r of reviews) next[r.buyerName] = { ...(r as Entry), submittedAt: now }
        return next
      })
      setNotice(`✅ Saved ${reviews.length} buyer${reviews.length > 1 ? "s" : ""}. Your answers stay on this page for the whole week — open the same link any time to fill the rest.`)
    } catch { setError("Network error. Please try again.") }
    finally { setBusy(false) }
  }

  return (
    <Shell coordinator={coordinator} week={week} fy={fy}>
      {buyers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-600">
          🎉 All your buyers are on track this week — no review pending.
        </div>
      ) : (
        <>
          {/* Progress for the week */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-700">
                <b className="text-green-700">{savedCount}</b> of <b>{buyers.length}</b> buyers saved this week
                {pendingCount > 0 && <span className="text-gray-500"> · {pendingCount} left</span>}
              </span>
              <label className="text-xs text-gray-600 flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
                Show only not-filled
              </label>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 transition-all" style={{ width: `${buyers.length ? (savedCount / buyers.length) * 100 : 0}%` }} />
            </div>
            <p className="text-xs text-gray-500">
              You don&apos;t have to fill everything at once. Fill a few, press <b>Save</b>, and come back later this week (Mon–Sat) with the same link — your saved answers will be here.
            </p>
          </div>

          {notice && <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-2">{notice}</div>}

          <div className="space-y-2">
            {shown.map((b) => {
              const i = buyers.indexOf(b)
              const e = entries[b.buyerName] ?? EMPTY
              const s = saved[b.buyerName]
              const isSaved = hasContent(s)
              const isDirty = hasContent(e) && !sameEntry(e, s)
              return (
                <div key={b.buyerName} className={`bg-white rounded-xl border p-3 ${isDirty ? "border-amber-300" : isSaved ? "border-green-300" : "border-gray-200"}`}>
                  {/* Buyer line + status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm min-w-0 truncate">
                      <span className="text-xs text-gray-400 mr-1">#{i + 1}</span>
                      <span className="font-bold text-gray-900">{b.buyerName}</span>
                      <span className="text-xs text-gray-500 ml-1">· {b.country} · {b.tier.replace("TIER", "T")}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isDirty ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">● Not saved</span>
                      ) : isSaved ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap" title={`Saved ${savedAtLabel(s.submittedAt)}`}>
                          ✓ Saved{s.submittedAt ? ` · ${savedAtLabel(s.submittedAt)}` : ""}
                        </span>
                      ) : null}
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${b.status === "NO_ORDER" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {b.status === "NO_ORDER" ? "No order" : `Low · ${b.achievementPct}%`}
                      </span>
                    </div>
                  </div>
                  {/* One-line context */}
                  <div className="text-xs text-gray-500 mt-1">
                    Target <b className="text-gray-700">{b.target}</b> · So far <b className={b.actual === 0 ? "text-red-600" : "text-gray-700"}>{b.actual}</b> ({b.achievementPct}%) · Last yr {b.lastYear} · Last order {b.lastOrderDate || "—"}{b.daysSinceOrder != null ? ` (${b.daysSinceOrder}d)` : ""}
                  </div>
                  {/* Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    <select value={e.reason} onChange={(ev) => set(b.buyerName, "reason", ev.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                      <option value="">Reason — why no order</option>
                      {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      {e.reason && !REASONS.includes(e.reason) && <option value={e.reason}>{e.reason}</option>}
                    </select>
                    <select value={e.expectedOrder} onChange={(ev) => set(b.buyerName, "expectedOrder", ev.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                      <option value="">Expected next order</option>
                      {EXPECTED.map((x) => <option key={x} value={x}>{x}</option>)}
                      {e.expectedOrder && !EXPECTED.includes(e.expectedOrder) && <option value={e.expectedOrder}>{e.expectedOrder}</option>}
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
            {shown.length === 0 && (
              <div className="bg-white rounded-xl border border-green-200 p-6 text-center text-sm text-green-700">
                ✓ All {buyers.length} buyers are saved for this week. Thank you!
              </div>
            )}
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2">{error}</div>}

          {/* Save bar */}
          <div className="pt-2 pb-8">
            <button onClick={save} disabled={busy || changed.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-semibold bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-40">
              {busy
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                : changed.length > 0
                  ? <>💾 Save {changed.length} buyer{changed.length > 1 ? "s" : ""} · {savedCount}/{buyers.length} saved so far</>
                  : <>✓ {savedCount}/{buyers.length} saved — fill more buyers to save</>}
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
