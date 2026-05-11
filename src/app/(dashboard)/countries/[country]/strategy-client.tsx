"use client"

import { useState, useEffect, useCallback } from "react"
import { StatusBadge, AchievementBar } from "@/components/ui/status-badge"
import { SummaryCard } from "@/components/ui/page-header"
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

// ── Travel status badge ───────────────────────────────────────────────────────
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

// ── Travel Plan Modal (create/edit) ───────────────────────────────────────────
function TravelPlanModal({
  country, plan, salesPersons, onClose, onSaved,
}: {
  country:    string
  plan?:      TravelPlan
  salesPersons: string[]
  onClose:    () => void
  onSaved:    () => void
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
        body: JSON.stringify({
          country, purpose, assignedTo, plannedMonth: month, days,
          keyBuyers, expectedOutcome: outcome, status, remarks,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? "Save failed"); return }
      onSaved(); onClose()
    } catch { setErr("Save failed") }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">
          {isEdit ? "Edit Travel Plan" : "+ New Travel Plan"} · {country}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Purpose of visit</label>
            <input
              type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Annual buyer review, market expansion, sample showcase…"
              className="w-full text-sm border border-gray-200 rounded-lg p-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Assigned Person *</label>
            <select
              value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg p-2"
            >
              <option value="">Select…</option>
              {salesPersons.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Planned Month *</label>
            <select
              value={month} onChange={(e) => setMonth(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg p-2"
            >
              <option value="">Select…</option>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">No. of days</label>
            <input
              type="number" min={1} max={60} value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full text-sm border border-gray-200 rounded-lg p-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
            <select
              value={status} onChange={(e) => setStatus(e.target.value as TravelStatus)}
              className="w-full text-sm border border-gray-200 rounded-lg p-2"
            >
              <option value="PLANNED">Planned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="DONE">Done</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Key buyers to meet</label>
            <textarea
              rows={2} value={keyBuyers} onChange={(e) => setKeyBuyers(e.target.value)}
              placeholder="One buyer per line, or comma-separated…"
              className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Expected outcome</label>
            <textarea
              rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)}
              placeholder="What should this trip achieve?"
              className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Remarks</label>
            <textarea
              rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none"
            />
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
function TravelPlansTab({
  country, plans, isManager, salesPersons, onChanged,
}: {
  country:    string
  plans:      TravelPlan[]
  isManager:  boolean
  salesPersons: string[]
  onChanged:  () => void
}) {
  const [showNew,  setShowNew]  = useState(false)
  const [editPlan, setEditPlan] = useState<TravelPlan | null>(null)
  const [busyId,   setBusyId]   = useState<string | null>(null)

  const updateStatus = async (id: string, status: TravelStatus) => {
    setBusyId(id)
    try {
      await fetch(`/api/travel-plans/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      onChanged()
    } finally { setBusyId(null) }
  }

  const counts = {
    PLANNED:     plans.filter((p) => p.status === "PLANNED").length,
    IN_PROGRESS: plans.filter((p) => p.status === "IN_PROGRESS").length,
    DONE:        plans.filter((p) => p.status === "DONE").length,
    CANCELLED:   plans.filter((p) => p.status === "CANCELLED").length,
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-gray-600">
          <strong>{plans.length}</strong> plans
          {plans.length > 0 && (
            <span className="ml-2 text-xs text-gray-400">
              ({counts.PLANNED} planned · {counts.IN_PROGRESS} in progress · {counts.DONE} done)
            </span>
          )}
        </div>
        {isManager && (
          <button
            onClick={() => setShowNew(true)}
            className="px-3 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700"
          >
            + New Travel Plan
          </button>
        )}
      </div>

      {/* List */}
      {plans.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">
            No travel plans for {country} yet.
            {isManager && " Click + New Travel Plan to add one."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((p) => {
            const isDone     = p.status === "DONE"
            const isCancelled = p.status === "CANCELLED"
            return (
              <div key={p.id}
                   className={`bg-white border rounded-xl p-4 space-y-2 ${
                     p.status === "PLANNED" || p.status === "IN_PROGRESS" ? "border-l-4 border-l-blue-400" : "border-gray-200 opacity-90"
                   }`}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isDone || isCancelled ? "text-gray-500" : "text-gray-800"}`}>
                      ✈️ {p.purpose || "(no purpose)"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      📅 {p.plannedMonth} · {p.days}d · 👤 {p.assignedTo}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${TRAVEL_STATUS_STYLE[p.status]}`}>
                    {p.status.replace("_", " ")}
                  </span>
                </div>
                {p.keyBuyers && (
                  <div className="text-xs text-gray-600">
                    <span className="text-gray-400">Buyers:</span> {p.keyBuyers}
                  </div>
                )}
                {p.expectedOutcome && (
                  <div className="text-xs text-gray-600">
                    <span className="text-gray-400">Goal:</span> {p.expectedOutcome}
                  </div>
                )}
                {p.remarks && (
                  <div className="text-xs text-gray-500 italic">"{p.remarks}"</div>
                )}
                {isManager && (
                  <div className="flex gap-1 pt-1 flex-wrap">
                    {p.status === "PLANNED" && (
                      <button
                        onClick={() => updateStatus(p.id, "IN_PROGRESS")}
                        disabled={busyId === p.id}
                        className="text-xs px-2 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 font-medium"
                      >▶ Start trip</button>
                    )}
                    {(p.status === "PLANNED" || p.status === "IN_PROGRESS") && (
                      <>
                        <button
                          onClick={() => updateStatus(p.id, "DONE")}
                          disabled={busyId === p.id}
                          className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 font-medium"
                        >✓ Mark Done</button>
                        <button
                          onClick={() => updateStatus(p.id, "CANCELLED")}
                          disabled={busyId === p.id}
                          className="text-xs px-2 py-1 border border-gray-200 text-gray-500 rounded hover:bg-gray-50 disabled:opacity-50"
                        >Cancel</button>
                      </>
                    )}
                    <button
                      onClick={() => setEditPlan(p)}
                      className="text-xs px-2 py-1 border border-gray-200 text-gray-500 rounded hover:bg-gray-50 ml-auto"
                    >✏️ Edit</button>
                  </div>
                )}
                {p.updatedAt && (
                  <p className="text-[10px] text-gray-400">
                    last updated by {p.updatedBy ?? "—"} on {new Date(p.updatedAt).toLocaleDateString("en-GB")}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showNew && (
        <TravelPlanModal
          country={country} salesPersons={salesPersons}
          onClose={() => setShowNew(false)} onSaved={onChanged}
        />
      )}
      {editPlan && (
        <TravelPlanModal
          country={country} plan={editPlan} salesPersons={salesPersons}
          onClose={() => setEditPlan(null)} onSaved={onChanged}
        />
      )}
    </div>
  )
}

// ── Buyer mini-table for VIP / Strategic groupings ───────────────────────────
function BuyerMiniTable({ rows, emptyLabel }: { rows: BuyerRow[]; emptyLabel: string }) {
  if (rows.length === 0) return (
    <p className="text-xs text-gray-400 italic px-3 py-4">{emptyLabel}</p>
  )
  return (
    <div className="divide-y divide-gray-50">
      {rows.map((b, i) => (
        <a
          key={b.canonicalCode || b.name}
          href={`/buyers/${encodeURIComponent(b.canonicalCode)}`}
          className="flex items-center justify-between gap-2 p-2.5 hover:bg-gray-50 transition-colors group"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs text-gray-400 tabular-nums w-4">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-green-600 transition-colors">
                {b.isKeyAccount && <span className="text-violet-500 mr-1">★</span>}
                {b.name}
              </p>
              <p className="text-[10px] text-gray-400 truncate uppercase tracking-tighter">{b.sp}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-black text-gray-900 tabular-nums">{Math.round(b.actual)}</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase">{Math.round(b.achievementPct)}%</p>
          </div>
        </a>
      ))}
    </div>
  )
}

export function StrategyClient({ country, userRole, userName, allSalesPersons }: Props) {
  const [data,    setData]    = useState<CountryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState("")
  const [tab,     setTab]     = useState<"buyers" | "history" | "cycles" | "team" | "travel">("buyers")
  const [piPage,  setPiPage]  = useState(1)
  const [savingDream, setSavingDream] = useState(false)

  const isManager = userRole === "MANAGER" || userRole === "DIRECTOR"

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
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
      ))}
    </div>
  )
  if (error || !data) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-600 text-sm">
      {error || "Country not found."}
    </div>
  )

  const { performance: p, countryPlan: cp, isDreamMarket, hasManualStrategy, dreamRank, piHistory = [] } = data

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className={`bg-white border rounded-xl p-5 ${isDreamMarket ? "border-yellow-300 ring-1 ring-yellow-200" : "border-gray-200"}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {isDreamMarket && (
                <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-yellow-300">
                  🌟 DREAM MARKET{dreamRank > 0 && ` · rank #${dreamRank}`}
                </span>
              )}
              <StatusBadge status={p.status} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mt-2">{data.country}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              FY {data.meta.currentFY} · W{data.meta.currentWeek}
              {hasManualStrategy && <span className="ml-2 text-yellow-600 font-medium">· manually classified</span>}
            </p>
          </div>
          {isManager && (
            <button
              onClick={async () => {
                setSavingDream(true)
                try {
                  await fetch("/api/admin/country-strategy", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
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
              {savingDream ? "Saving…" : (isDreamMarket ? "✕ Unmark Dream" : "🌟 Mark as Dream Market")}
            </button>
          )}
        </div>
        <div className="mt-4">
          <AchievementBar pct={p.achievementPct} status={p.status} />
          <div className="flex justify-between text-[11px] text-gray-400 mt-1.5">
             <span>Actual: <strong>{formatNumber(p.actual, 0)}</strong></span>
             <span>Target: <strong>{formatNumber(p.target, 0)}</strong></span>
             <span>Due: <strong>{formatNumber(p.targetDue, 0)}</strong></span>
             <span className={p.gap >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
               Gap: {p.gap >= 0 ? "+" : ""}{formatNumber(p.gap, 0)}
             </span>
          </div>
        </div>
      </div>

      {/* Segment Composition */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border border-yellow-200 rounded-xl p-4 shadow-sm">
           <div className="flex justify-between items-start mb-2">
             <p className="text-xs font-bold text-yellow-700 uppercase tracking-widest">★ VIP Buyers</p>
             <span className="text-xl font-black text-gray-900">{data.buyerSegmentBreakdown.vip.count}</span>
           </div>
           <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
             <div className="h-full bg-yellow-400" style={{ width: `${(data.buyerSegmentBreakdown.vip.totalActual / (data.buyerSegmentBreakdown.vip.totalTarget || 1)) * 100}%` }} />
           </div>
           <p className="text-[10px] text-gray-400 mt-2 font-medium">
             {formatNumber(data.buyerSegmentBreakdown.vip.totalActual, 0)} / {formatNumber(data.buyerSegmentBreakdown.vip.totalTarget, 0)} containers
           </p>
        </div>
        <div className="bg-white border border-orange-200 rounded-xl p-4 shadow-sm">
           <div className="flex justify-between items-start mb-2">
             <p className="text-xs font-bold text-orange-700 uppercase tracking-widest">Strategic</p>
             <span className="text-xl font-black text-gray-900">{data.buyerSegmentBreakdown.strategic.count}</span>
           </div>
           <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
             <div className="h-full bg-orange-400" style={{ width: `${(data.buyerSegmentBreakdown.strategic.totalActual / (data.buyerSegmentBreakdown.strategic.totalTarget || 1)) * 100}%` }} />
           </div>
           <p className="text-[10px] text-gray-400 mt-2 font-medium">
             {formatNumber(data.buyerSegmentBreakdown.strategic.totalActual, 0)} / {formatNumber(data.buyerSegmentBreakdown.strategic.totalTarget, 0)} containers
           </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
           <div className="flex justify-between items-start mb-2">
             <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Others</p>
             <span className="text-xl font-black text-gray-900">{data.buyerSegmentBreakdown.other.count}</span>
           </div>
           <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
             <div className="h-full bg-gray-400" style={{ width: `${(data.buyerSegmentBreakdown.other.totalActual / (data.buyerSegmentBreakdown.other.totalTarget || 1)) * 100}%` }} />
           </div>
           <p className="text-[10px] text-gray-400 mt-2 font-medium">
             {formatNumber(data.buyerSegmentBreakdown.other.totalActual, 0)} / {formatNumber(data.buyerSegmentBreakdown.other.totalTarget, 0)} containers
           </p>
        </div>
      </div>

      {/* VIP & Strategic mini lists (Top group) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white border border-yellow-100 rounded-xl overflow-hidden shadow-sm">
          <div className="px-3 py-2 border-b border-yellow-50 bg-yellow-50/50">
            <p className="text-[10px] font-bold text-yellow-800 uppercase tracking-widest">Top VIP Buyers</p>
          </div>
          <BuyerMiniTable rows={data.vipBuyers} emptyLabel="No VIP buyers in this country." />
        </div>
        <div className="bg-white border border-orange-100 rounded-xl overflow-hidden shadow-sm">
          <div className="px-3 py-2 border-b border-orange-50 bg-orange-50/50">
            <p className="text-[10px] font-bold text-orange-800 uppercase tracking-widest">Strategic Buyers</p>
          </div>
          <BuyerMiniTable rows={data.strategicBuyers} emptyLabel="No Strategic buyers in this country." />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        {([
          { key: "buyers", label: `Buyers (${data.buyerRows.length})` },
          { key: "history", label: "Order History" },
          { key: "cycles", label: "Quarterly" },
          { key: "team",   label: "Sales Team" },
          { key: "travel", label: `✈️ Travel (${data.travelPlans.length})` },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPiPage(1) }}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px whitespace-nowrap ${
              tab === t.key
                ? "border-green-600 text-green-700 bg-green-50/50"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "buyers" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {["#","Buyer","Segment","Target","Actual","Achievement","Status","Owner"].map((h) => (
                    <th key={h} className="text-left px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.buyerRows.map((b, i) => (
                  <tr
                    key={`${b.canonicalCode || b.name}-${i}`}
                    onClick={() => window.location.href = `/buyers/${encodeURIComponent(b.canonicalCode)}`}
                    className="hover:bg-green-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-3 text-gray-400 tabular-nums text-xs">{i + 1}</td>
                    <td className="px-3 py-3 font-semibold text-gray-800">
                      <div className="flex items-center gap-1.5">
                        {(b.segment === "VIP" || b.isKeyAccount) && <span className="text-violet-500 font-bold" title={b.segment}>★</span>}
                        {b.segment === "STRATEGIC" && <span className="text-orange-500 font-bold" title="Strategic">★</span>}
                        <span className="truncate max-w-[200px] group-hover:text-green-700">{b.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${segmentBg(b.segment)}`}>
                        {segmentLabel(b.segment)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium text-gray-600">{formatNumber(b.target, 0)}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-bold text-gray-900">{formatNumber(b.actual, 0)}</td>
                    <td className="px-3 py-3 min-w-[100px]"><AchievementBar pct={b.achievementPct} status={b.status} /></td>
                    <td className="px-3 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-3 py-3 text-xs text-gray-500 font-medium">
                      <a 
                        href={`/sales-persons/${encodeURIComponent(b.sp)}`} 
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-green-700 hover:underline"
                      >
                        {b.sp}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                <tr>
                  <td className="px-3 py-4" />
                  <td className="px-3 py-4 text-gray-900 uppercase text-[10px] tracking-widest" colSpan={2}>
                    Country Total ({data.buyerRows.length} Buyers)
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums text-gray-600">{formatNumber(data.buyerRows.reduce((s, b) => s + b.target, 0), 0)}</td>
                  <td className="px-3 py-4 text-right tabular-nums text-gray-900">{formatNumber(data.buyerRows.reduce((s, b) => s + b.actual, 0), 0)}</td>
                  <td className="px-3 py-4" colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="md:hidden divide-y divide-gray-100">
            {data.buyerRows.map((b) => (
              <a
                key={b.canonicalCode || b.name}
                href={`/buyers/${encodeURIComponent(b.canonicalCode)}`}
                className="block p-4 space-y-2 active:bg-gray-50"
              >
                <div className="flex justify-between items-start">
                  <p className="font-bold text-gray-800 text-sm truncate">{b.name}</p>
                  <StatusBadge status={b.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${segmentBg(b.segment)}`}>{segmentLabel(b.segment)}</span>
                  <span className="text-xs text-gray-400 font-medium">{b.sp}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 font-medium">
                  <span>Target: <strong>{formatNumber(b.target, 0)}</strong></span>
                  <span>Actual: <strong>{formatNumber(b.actual, 0)}</strong></span>
                </div>
                <AchievementBar pct={b.achievementPct} status={b.status} />
              </a>
            ))}
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
             <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Recent Orders in {country}</h3>
             <span className="text-xs text-gray-400 font-medium">{piHistory.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white border-b border-gray-100">
                  {["Date","Buyer","Brand","Containers","MTs","PI No."].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {piHistory.slice((piPage-1)*20, piPage*20).map((r: any) => (
                  <tr key={r.piNumber} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(r.piDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800 truncate max-w-[180px]">{r.buyerCompanyName}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{r.brand || "–"}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 tabular-nums">{r.totalContainers}</td>
                    <td className="px-4 py-3 text-right text-gray-500 tabular-nums text-xs">{r.qtyMTs?.toFixed(0)}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-gray-400">{r.piNumber}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
                 <tr>
                   <td colSpan={3} className="px-4 py-3 text-right text-[10px] text-gray-400 uppercase tracking-widest">Grand Total (200 records):</td>
                   <td className="px-4 py-3 text-right tabular-nums text-gray-900">{piHistory.reduce((s, r) => s + r.totalContainers, 0)}</td>
                   <td className="px-4 py-3 text-right tabular-nums text-gray-700">{piHistory.reduce((s, r) => s + (r.qtyMTs || 0), 0).toFixed(0)}</td>
                   <td className="px-4 py-3" />
                 </tr>
              </tfoot>
            </table>
          </div>
          {piHistory.length > 20 && (
            <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-100">
              <button onClick={() => setPiPage(piPage - 1)} disabled={piPage === 1} className="text-xs font-bold text-green-600 disabled:opacity-30">← PREVIOUS</button>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Page {piPage} / {Math.ceil(piHistory.length / 20)}</span>
              <button onClick={() => setPiPage(piPage + 1)} disabled={piPage >= Math.ceil(piHistory.length / 20)} className="text-xs font-bold text-green-600 disabled:opacity-30">NEXT →</button>
            </div>
          )}
        </div>
      )}

      {/* Cycles tab */}
      {tab === "cycles" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.cycleBreakdown.map((c) => (
            <div key={c.cycle} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{c.name}</p>
                <span className="text-sm font-black text-gray-900">{c.achPct}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full ${c.achPct >= 90 ? "bg-green-500" : c.achPct >= 70 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${Math.min(100, c.achPct)}%` }}
                />
              </div>
              <p className="text-[10px] font-bold text-gray-500">
                {formatNumber(c.actual, 0)} / {formatNumber(c.target, 0)} containers
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Team tab */}
      {tab === "team" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sales Person</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Containers</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.spBreakdown.map((s) => {
                const share = p.actual > 0 ? Math.round((s.containers / p.actual) * 100) : 0
                return (
                  <tr key={s.salesPerson} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                       <a 
                        href={`/sales-persons/${encodeURIComponent(s.salesPerson)}`} 
                        className="font-bold text-gray-700 hover:text-green-700 hover:underline"
                      >
                        {s.salesPerson}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right font-black tabular-nums text-gray-900">{s.containers}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[80px]">
                          <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${share}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-500 w-8 text-right">{share}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Travel tab */}
      {tab === "travel" && (
        <TravelPlansTab
          country={data.country}
          plans={data.travelPlans}
          isManager={isManager}
          salesPersons={allSalesPersons}
          onChanged={refresh}
        />
      )}
    </div>
  )
}
