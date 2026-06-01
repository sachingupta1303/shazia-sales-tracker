"use client"

import { useState, useEffect, useCallback } from "react"
import { StatusBadge, AchievementBar } from "@/components/ui/status-badge"
import { formatNumber, segmentBg, segmentLabel } from "@/lib/utils"
import type { PerformanceStatus, BuyerSegment, TravelPlan, TravelStatus, UserRole } from "@/types"

// ── Types ─────────────────────────────────────────────────────────────────────

interface BuyerRow {
  name: string; code: string; canonicalCode: string
  actual: number; target: number; achievementPct: number
  status: PerformanceStatus; sp: string; segment: BuyerSegment
  isKeyAccount: boolean
}
interface CycleRow { cycle: number; name: string; target: number; actual: number; achPct: number }
interface SPRow    { salesPerson: string; containers: number }
interface SegmentBreakdown {
  vip:       { count: number; totalTarget: number; totalActual: number }
  strategic: { count: number; totalTarget: number; totalActual: number }
  other:     { count: number; totalTarget: number; totalActual: number }
}

interface CountryResponse {
  country: string
  performance: {
    target: number; actual: number; prevActual: number
    targetDue: number; gap: number; achievementPct: number; status: PerformanceStatus
  }
  countryPlan: {
    planned2025: number; actual2025: number; planned2026: number
    marketGrowth: number; totalClients: number
  } | null
  strategy:              { isDreamMarket: boolean; strategicNotes?: string; updatedBy?: string; updatedAt?: string } | null
  isDreamMarket:         boolean
  dreamRank:             number
  hasManualStrategy:     boolean
  buyerRows:             BuyerRow[]
  buyerSegmentBreakdown: SegmentBreakdown
  vipBuyers:             BuyerRow[]
  strategicBuyers:       BuyerRow[]
  otherBuyers:           BuyerRow[]
  travelPlans:           TravelPlan[]
  piHistory:             any[]
  cycleBreakdown:        CycleRow[]
  spBreakdown:           SPRow[]
  meta:                  { currentFY: string; currentWeek: number }
}

interface Props {
  country:         string
  userRole?:       UserRole
  userName?:       string
  allSalesPersons: string[]
}

// ── Travel status styles ──────────────────────────────────────────────────────
const TRAVEL_STATUS_STYLE: Record<TravelStatus, string> = {
  PLANNED:     "bg-blue-100 text-blue-800 border-blue-200",
  IN_PROGRESS: "bg-amber-100 text-amber-800 border-amber-200",
  DONE:        "bg-green-100 text-green-700 border-green-200",
  CANCELLED:   "bg-gray-100 text-gray-500 border-gray-200",
}

const MONTHS = [
  "April","May","June","July","August","September",
  "October","November","December","January","February","March",
]

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, color = "bg-white border-gray-200", highlight,
}: {
  label: string; value: string | number; sub?: string
  color?: string; highlight?: "green" | "red" | "blue"
}) {
  const valColor = highlight === "green" ? "text-green-600"
    : highlight === "red" ? "text-red-500"
    : "text-gray-900"
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${valColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{sub}</p>}
    </div>
  )
}

// ── Segment Card ──────────────────────────────────────────────────────────────
function SegmentCard({
  label, count, actual, target, color, barColor, icon,
}: {
  label: string; count: number; actual: number; target: number
  color: string; barColor: string; icon: string
}) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-base">{icon}</span>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600">{label}</p>
        </div>
        <span className="text-2xl font-black text-gray-900">{count}</span>
      </div>
      <div className="h-1.5 bg-white/60 rounded-full overflow-hidden mb-2">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] font-bold text-gray-500">
        <span>{formatNumber(actual, 0)} actual</span>
        <span>{pct}%</span>
        <span>{formatNumber(target, 0)} target</span>
      </div>
    </div>
  )
}

// ── Travel Plan Modal ─────────────────────────────────────────────────────────
function TravelPlanModal({
  country, plan, salesPersons, onClose, onSaved,
}: {
  country: string; plan?: TravelPlan; salesPersons: string[]
  onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!plan
  const [purpose,    setPurpose]    = useState(plan?.purpose ?? "")
  const [assignedTo, setAssignedTo] = useState(plan?.assignedTo ?? "")
  const [month,      setMonth]      = useState(plan?.plannedMonth ?? "")
  const [days,       setDays]       = useState(plan?.days ?? 5)
  const [keyBuyers,  setKeyBuyers]  = useState(plan?.keyBuyers ?? "")
  const [outcome,    setOutcome]    = useState(plan?.expectedOutcome ?? "")
  const [status,     setStatus]     = useState<TravelStatus>(plan?.status ?? "PLANNED")
  const [remarks,    setRemarks]    = useState(plan?.remarks ?? "")
  const [saving,     setSaving]     = useState(false)
  const [err,        setErr]        = useState("")

  const submit = async () => {
    if (!assignedTo || !month) { setErr("Assignee and planned month required"); return }
    setSaving(true); setErr("")
    try {
      const url = isEdit ? `/api/travel-plans/${encodeURIComponent(plan!.id)}` : "/api/travel-plans"
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, purpose, assignedTo, plannedMonth: month, days, keyBuyers, expectedOutcome: outcome, status, remarks }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? "Save failed"); return }
      onSaved(); onClose()
    } catch { setErr("Save failed") }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">{isEdit ? "Edit Travel Plan" : "+ New Travel Plan"} · {country}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Purpose of visit</label>
            <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)}
              placeholder="Annual buyer review, market expansion…"
              className="w-full text-sm border border-gray-200 rounded-lg p-2" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Assigned Person *</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg p-2">
              <option value="">Select…</option>
              {salesPersons.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Planned Month *</label>
            <select value={month} onChange={(e) => setMonth(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg p-2">
              <option value="">Select…</option>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Days</label>
            <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))}
              className="w-full text-sm border border-gray-200 rounded-lg p-2" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as TravelStatus)}
              className="w-full text-sm border border-gray-200 rounded-lg p-2">
              <option value="PLANNED">Planned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="DONE">Done</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Key buyers to meet</label>
            <textarea rows={2} value={keyBuyers} onChange={(e) => setKeyBuyers(e.target.value)}
              placeholder="One buyer per line, or comma-separated…"
              className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Expected outcome</label>
            <textarea rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)}
              placeholder="What should this trip achieve?"
              className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Remarks</label>
            <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none" />
          </div>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving || !assignedTo || !month}
            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
            {saving ? "Saving…" : (isEdit ? "Save Changes" : "Create Plan")}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Travel Plans Tab ──────────────────────────────────────────────────────────
function TravelPlansTab({ country, plans, isManager, salesPersons, onChanged }: {
  country: string; plans: TravelPlan[]; isManager: boolean
  salesPersons: string[]; onChanged: () => void
}) {
  const [showNew, setShowNew]   = useState(false)
  const [editPlan, setEditPlan] = useState<TravelPlan | null>(null)
  const [busyId, setBusyId]     = useState<string | null>(null)

  const updateStatus = async (id: string, status: TravelStatus) => {
    setBusyId(id)
    try {
      await fetch(`/api/travel-plans/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      onChanged()
    } finally { setBusyId(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">
          <strong className="text-gray-800">{plans.length}</strong> travel plans ·{" "}
          {plans.filter(p => p.status === "PLANNED").length} planned ·{" "}
          {plans.filter(p => p.status === "DONE").length} done
        </p>
        {isManager && (
          <button onClick={() => setShowNew(true)}
            className="px-3 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700">
            + New Travel Plan
          </button>
        )}
      </div>

      {plans.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-10 text-center">
          <p className="text-2xl mb-2">✈️</p>
          <p className="text-gray-400 text-sm">No travel plans for {country} yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((p) => (
            <div key={p.id}
              className={`bg-white border rounded-xl p-4 space-y-2 ${
                p.status === "PLANNED" ? "border-l-4 border-l-blue-400"
                : p.status === "IN_PROGRESS" ? "border-l-4 border-l-amber-400"
                : "border-gray-200 opacity-80"
              }`}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">✈️ {p.purpose || "(no purpose)"}</p>
                  <p className="text-xs text-gray-500 mt-0.5">📅 {p.plannedMonth} · {p.days}d · 👤 {p.assignedTo}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${TRAVEL_STATUS_STYLE[p.status]}`}>
                  {p.status.replace("_", " ")}
                </span>
              </div>
              {p.keyBuyers && <p className="text-xs text-gray-600"><span className="text-gray-400">Buyers:</span> {p.keyBuyers}</p>}
              {p.expectedOutcome && <p className="text-xs text-gray-600"><span className="text-gray-400">Goal:</span> {p.expectedOutcome}</p>}
              {isManager && (
                <div className="flex gap-1 pt-1 flex-wrap">
                  {p.status === "PLANNED" && (
                    <button onClick={() => updateStatus(p.id, "IN_PROGRESS")} disabled={busyId === p.id}
                      className="text-xs px-2 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 font-medium">
                      ▶ Start
                    </button>
                  )}
                  {(p.status === "PLANNED" || p.status === "IN_PROGRESS") && (
                    <>
                      <button onClick={() => updateStatus(p.id, "DONE")} disabled={busyId === p.id}
                        className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 font-medium">
                        ✓ Done
                      </button>
                      <button onClick={() => updateStatus(p.id, "CANCELLED")} disabled={busyId === p.id}
                        className="text-xs px-2 py-1 border border-gray-200 text-gray-500 rounded hover:bg-gray-50 disabled:opacity-50">
                        Cancel
                      </button>
                    </>
                  )}
                  <button onClick={() => setEditPlan(p)}
                    className="text-xs px-2 py-1 border border-gray-200 text-gray-500 rounded hover:bg-gray-50 ml-auto">
                    ✏️ Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && <TravelPlanModal country={country} salesPersons={salesPersons} onClose={() => setShowNew(false)} onSaved={onChanged} />}
      {editPlan && <TravelPlanModal country={country} plan={editPlan} salesPersons={salesPersons} onClose={() => setEditPlan(null)} onSaved={onChanged} />}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export function StrategyClient({ country, userRole, userName, allSalesPersons }: Props) {
  const [data,        setData]        = useState<CountryResponse | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState("")
  const [tab,         setTab]         = useState<"buyers" | "history" | "cycles" | "team" | "travel">("buyers")
  const [piPage,      setPiPage]      = useState(1)
  const [savingDream, setSavingDream] = useState(false)

  const isManager = userRole === "MANAGER" || userRole === "DIRECTOR" || userRole === "SUPER_ADMIN" || userRole === "ADMIN"

  const refresh = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const res = await fetch(`/api/countries/${encodeURIComponent(country)}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch { setError("Failed to load country data.") }
    finally { setLoading(false) }
  }, [country])

  useEffect(() => { refresh() }, [refresh])

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-40 bg-gray-100 rounded-xl" />
      <div className="grid grid-cols-4 gap-3">{Array.from({length:4}).map((_,i)=><div key={i} className="h-24 bg-gray-100 rounded-xl"/>)}</div>
      <div className="grid grid-cols-3 gap-3">{Array.from({length:3}).map((_,i)=><div key={i} className="h-24 bg-gray-100 rounded-xl"/>)}</div>
      <div className="h-64 bg-gray-100 rounded-xl" />
    </div>
  )
  if (error || !data) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-600 text-sm">{error || "Country not found."}</div>
  )

  const { performance: p, isDreamMarket, hasManualStrategy, dreamRank, piHistory = [], meta } = data

  // Containers are a PI-level value repeated on every product row of the same PI,
  // so count them once per unique piNumber (MTs stay summed per product row).
  const piHistoryCtrs = (() => {
    const seenPI = new Set<string>()
    let total = 0
    for (const r of piHistory as any[]) {
      if (seenPI.has(r.piNumber)) continue
      seenPI.add(r.piNumber)
      total += r.totalContainers
    }
    return total
  })()

  // Derived stats
  const activeBuyers = data.buyerRows.filter(b => b.actual > 0).length
  const growthPct    = p.prevActual > 0 ? Math.round(((p.actual - p.prevActual) / p.prevActual) * 100) : null
  const avgPerBuyer  = activeBuyers > 0 ? Math.round(p.actual / activeBuyers) : 0

  // Buyers sorted by actual descending
  const sortedBuyers = [...data.buyerRows].sort((a, b) => b.actual - a.actual)

  const statusColor = p.status === "ACHIEVED" ? "bg-green-50 border-green-200"
    : p.status === "ON_TRACK"  ? "bg-teal-50 border-teal-200"
    : p.status === "MISSED"    ? "bg-amber-50 border-amber-200"
    : "bg-red-50 border-red-200"

  return (
    <div className="space-y-4">

      {/* ── Header Card ── */}
      <div className={`rounded-xl border p-5 ${isDreamMarket ? "bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-300 ring-1 ring-yellow-200" : "bg-white border-gray-200"}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {isDreamMarket && (
                <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2.5 py-1 rounded-full border border-yellow-300">
                  🌟 DREAM MARKET{dreamRank > 0 && ` · #${dreamRank}`}
                </span>
              )}
              <StatusBadge status={p.status} />
              {hasManualStrategy && (
                <span className="text-[10px] text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full font-semibold">
                  manually classified
                </span>
              )}
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{data.country}</h1>
            <p className="text-sm text-gray-400 mt-0.5 font-medium">FY {meta.currentFY} · Week {meta.currentWeek}</p>
          </div>

          {isManager && (
            <button
              onClick={async () => {
                setSavingDream(true)
                try {
                  await fetch("/api/admin/country-strategy", {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ country, isDreamMarket: !isDreamMarket }),
                  })
                  await refresh()
                } finally { setSavingDream(false) }
              }}
              disabled={savingDream}
              className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors disabled:opacity-50 ${
                isDreamMarket
                  ? "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  : "bg-yellow-500 border-yellow-500 text-white hover:bg-yellow-600"
              }`}
            >
              {savingDream ? "Saving…" : isDreamMarket ? "✕ Unmark Dream" : "🌟 Mark Dream Market"}
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
            <span className="text-gray-500">FY Progress</span>
            <span className={p.achievementPct >= 100 ? "text-green-600" : p.achievementPct >= 70 ? "text-teal-600" : "text-amber-600"}>
              {p.achievementPct}%
            </span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                p.achievementPct >= 100 ? "bg-green-500"
                : p.achievementPct >= 70  ? "bg-teal-400"
                : p.achievementPct >= 40  ? "bg-amber-400"
                : "bg-red-400"
              }`}
              style={{ width: `${Math.min(100, p.achievementPct)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-gray-400 mt-1.5 font-medium">
            <span>Actual: <strong className="text-gray-700">{formatNumber(p.actual, 0)}</strong></span>
            <span>Due: <strong className="text-gray-700">{formatNumber(p.targetDue, 0)}</strong></span>
            <span>Target: <strong className="text-gray-700">{formatNumber(p.target, 0)}</strong></span>
            <span className={p.gap >= 0 ? "text-green-600 font-bold" : "text-red-500 font-bold"}>
              Gap: {p.gap >= 0 ? "+" : ""}{formatNumber(p.gap, 0)}
            </span>
          </div>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="FY Target"   value={formatNumber(p.target, 0)}    sub="containers"       color="bg-white border-gray-200" />
        <KpiCard label="Actual"      value={formatNumber(p.actual, 0)}    sub="this FY"          color="bg-green-50 border-green-200" />
        <KpiCard label="Last Year"   value={formatNumber(p.prevActual, 0)} sub="FY prev actual"  color="bg-blue-50 border-blue-200" />
        <KpiCard
          label="Gap vs Due"
          value={`${p.gap >= 0 ? "+" : ""}${formatNumber(p.gap, 0)}`}
          sub={p.gap >= 0 ? "ahead of pace" : "behind pace"}
          color={p.gap >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}
          highlight={p.gap >= 0 ? "green" : "red"}
        />
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Buyers"  value={data.buyerRows.length}     sub="in this country"    color="bg-white border-gray-200" />
        <KpiCard label="Active Buyers" value={activeBuyers}              sub="ordered this FY"    color="bg-white border-gray-200" />
        <KpiCard
          label="YoY Growth"
          value={growthPct !== null ? `${growthPct >= 0 ? "+" : ""}${growthPct}%` : "—"}
          sub="vs last year"
          color="bg-white border-gray-200"
          highlight={growthPct !== null ? (growthPct >= 0 ? "green" : "red") : undefined}
        />
        <KpiCard label="Avg / Active Buyer" value={formatNumber(avgPerBuyer, 0)} sub="containers" color="bg-white border-gray-200" />
      </div>

      {/* ── Segment Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SegmentCard
          label="VIP Buyers" icon="⭐"
          count={data.buyerSegmentBreakdown.vip.count}
          actual={data.buyerSegmentBreakdown.vip.totalActual}
          target={data.buyerSegmentBreakdown.vip.totalTarget}
          color="bg-yellow-50 border-yellow-200"
          barColor="bg-yellow-400"
        />
        <SegmentCard
          label="Strategic" icon="🎯"
          count={data.buyerSegmentBreakdown.strategic.count}
          actual={data.buyerSegmentBreakdown.strategic.totalActual}
          target={data.buyerSegmentBreakdown.strategic.totalTarget}
          color="bg-orange-50 border-orange-200"
          barColor="bg-orange-400"
        />
        <SegmentCard
          label="Others" icon="🏢"
          count={data.buyerSegmentBreakdown.other.count}
          actual={data.buyerSegmentBreakdown.other.totalActual}
          target={data.buyerSegmentBreakdown.other.totalTarget}
          color="bg-gray-50 border-gray-200"
          barColor="bg-gray-400"
        />
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-0 border-b border-gray-200 overflow-x-auto bg-white rounded-t-lg">
        {([
          { key: "buyers",  label: `Buyers (${data.buyerRows.length})` },
          { key: "history", label: "Order History" },
          { key: "cycles",  label: "Quarterly" },
          { key: "team",    label: "Sales Team" },
          { key: "travel",  label: `✈️ Travel (${data.travelPlans.length})` },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPiPage(1) }}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px whitespace-nowrap ${
              tab === t.key
                ? "border-green-600 text-green-700 bg-green-50/60"
                : "border-transparent text-gray-400 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Buyers Tab ── */}
      {tab === "buyers" && (
        <div className="bg-white border border-gray-200 rounded-b-xl rounded-tr-xl overflow-hidden shadow-sm">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {["#","Buyer","Segment","Target","Actual","Achievement","Status","Owner"].map((h) => (
                    <th key={h} className="text-left px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedBuyers.map((b, i) => (
                  <tr
                    key={`${b.canonicalCode || b.name}-${i}`}
                    onClick={() => window.location.href = `/buyers/${encodeURIComponent(b.canonicalCode)}`}
                    className="hover:bg-green-50/40 cursor-pointer transition-colors group"
                  >
                    <td className="px-3 py-3 text-gray-300 tabular-nums text-xs font-bold">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {(b.segment === "VIP" || b.isKeyAccount) && <span className="text-yellow-500 text-base">⭐</span>}
                        {b.segment === "STRATEGIC" && <span className="text-orange-400 text-base">🎯</span>}
                        <span className="font-semibold text-gray-800 group-hover:text-green-700 transition-colors truncate max-w-[200px]">
                          {b.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${segmentBg(b.segment)}`}>
                        {segmentLabel(b.segment)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-500 font-medium">{formatNumber(b.target, 0)}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-black text-gray-900 text-base">{formatNumber(b.actual, 0)}</td>
                    <td className="px-3 py-3 min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              b.achievementPct >= 100 ? "bg-green-500"
                              : b.achievementPct >= 70  ? "bg-teal-400"
                              : b.achievementPct >= 40  ? "bg-amber-400"
                              : "bg-red-400"
                            }`}
                            style={{ width: `${Math.min(100, b.achievementPct)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-gray-500 w-8 text-right">{b.achievementPct}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-3 py-3 text-xs text-gray-500 font-medium">
                      <a href={`/sales-persons/${encodeURIComponent(b.sp)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-green-700 hover:underline">
                        {b.sp || "—"}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                <tr>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-gray-700 text-xs font-bold uppercase tracking-widest" colSpan={2}>
                    Total · {data.buyerRows.length} buyers
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-600">
                    {formatNumber(data.buyerRows.reduce((s, b) => s + b.target, 0), 0)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900 text-base">
                    {formatNumber(data.buyerRows.reduce((s, b) => s + b.actual, 0), 0)}
                  </td>
                  <td colSpan={3} className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-gray-100">
            {sortedBuyers.map((b) => (
              <a key={b.canonicalCode || b.name}
                href={`/buyers/${encodeURIComponent(b.canonicalCode)}`}
                className="block p-4 space-y-2 active:bg-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {(b.segment === "VIP" || b.isKeyAccount) && <span className="text-yellow-500">⭐</span>}
                    <p className="font-bold text-gray-800 truncate">{b.name}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${segmentBg(b.segment)}`}>{segmentLabel(b.segment)}</span>
                  <span className="text-xs text-gray-400">{b.sp}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-gray-400">Target <strong className="text-gray-700">{formatNumber(b.target, 0)}</strong></span>
                  <span className="text-gray-400">Actual <strong className="text-green-700">{formatNumber(b.actual, 0)}</strong></span>
                  <span className="font-bold text-gray-600">{b.achievementPct}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${b.achievementPct >= 100 ? "bg-green-500" : b.achievementPct >= 70 ? "bg-teal-400" : "bg-amber-400"}`}
                    style={{ width: `${Math.min(100, b.achievementPct)}%` }}
                  />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── Order History Tab ── */}
      {tab === "history" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Recent Orders — {country}</h3>
            <span className="text-xs text-gray-400">{piHistory.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white border-b border-gray-100">
                  {["Date","Buyer","Brand","Variety","Containers","MTs","PI No."].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {piHistory.slice((piPage-1)*20, piPage*20).map((r: any, i: number) => (
                  <tr key={`${r.piNumber}-${i}`} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(r.piDate).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"2-digit" })}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-gray-800 max-w-[160px] truncate">{r.buyerCompanyName}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{r.brand || "—"}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${r.varieties === "BASMATI" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                        {r.varieties || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums">{r.totalContainers}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums text-xs">{r.qtyMTs?.toFixed(0)}</td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-gray-400">{r.piNumber}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right text-[10px] text-gray-400 uppercase tracking-widest">Grand Total:</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {piHistoryCtrs}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600 text-xs">
                    {piHistory.reduce((s: number, r: any) => s + (r.qtyMTs || 0), 0).toFixed(0)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {piHistory.length > 20 && (
            <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-100">
              <button onClick={() => setPiPage(piPage - 1)} disabled={piPage === 1}
                className="text-xs font-bold text-green-600 disabled:opacity-30 hover:text-green-700">← Prev</button>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Page {piPage} of {Math.ceil(piHistory.length / 20)}
              </span>
              <button onClick={() => setPiPage(piPage + 1)} disabled={piPage >= Math.ceil(piHistory.length / 20)}
                className="text-xs font-bold text-green-600 disabled:opacity-30 hover:text-green-700">Next →</button>
            </div>
          )}
        </div>
      )}

      {/* ── Quarterly Tab ── */}
      {tab === "cycles" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.cycleBreakdown.map((c) => (
            <div key={c.cycle} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-bold text-gray-700">{c.name}</p>
                <span className={`text-lg font-black tabular-nums ${c.achPct >= 90 ? "text-green-600" : c.achPct >= 70 ? "text-amber-500" : "text-red-500"}`}>
                  {c.achPct}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div className={`h-full rounded-full ${c.achPct >= 90 ? "bg-green-500" : c.achPct >= 70 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${Math.min(100, c.achPct)}%` }} />
              </div>
              <div className="flex justify-between text-xs font-semibold text-gray-500">
                <span>Actual: <strong className="text-gray-800">{formatNumber(c.actual, 0)}</strong></span>
                <span>Target: <strong className="text-gray-600">{formatNumber(c.target, 0)}</strong></span>
              </div>
            </div>
          ))}
          {data.cycleBreakdown.length === 0 && (
            <div className="col-span-2 bg-gray-50 border border-dashed border-gray-200 rounded-xl p-10 text-center">
              <p className="text-gray-400 text-sm">No quarterly data available.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Sales Team Tab ── */}
      {tab === "team" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Sales Team Performance — {country}</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white border-b border-gray-100">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">#</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sales Person</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Containers</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Share of Country</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.spBreakdown.map((s, i) => {
                const share = p.actual > 0 ? Math.round((s.containers / p.actual) * 100) : 0
                return (
                  <tr key={s.salesPerson} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-gray-300 text-xs font-bold">{i + 1}</td>
                    <td className="px-4 py-3">
                      <a href={`/sales-persons/${encodeURIComponent(s.salesPerson)}`}
                        className="font-bold text-gray-700 hover:text-green-700 hover:underline">
                        {s.salesPerson}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right font-black tabular-nums text-gray-900 text-base">{s.containers}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-[80px]">
                          <div className="h-2 rounded-full bg-green-500" style={{ width: `${share}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-500 w-8 text-right">{share}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {data.spBreakdown.length === 0 && (
            <div className="p-10 text-center text-gray-400 text-sm">No sales data for this country yet.</div>
          )}
        </div>
      )}

      {/* ── Travel Tab ── */}
      {tab === "travel" && (
        <TravelPlansTab
          country={data.country} plans={data.travelPlans}
          isManager={isManager} salesPersons={allSalesPersons}
          onChanged={refresh}
        />
      )}
    </div>
  )
}
