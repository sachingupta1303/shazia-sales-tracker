"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { FilterBar, type FilterState } from "@/components/ui/filter-bar"
import { AchievementBar, SegmentTag } from "@/components/ui/status-badge"
import { formatNumber } from "@/lib/utils"
import { segmentBg, healthBg } from "@/lib/utils"
import type { ResolvedBuyer, BuyerSegment, BuyerTier, UserRole, BuyerTask } from "@/types"

// ── Types ────────────────────────────────────────────────────────────────────

interface TierSummary { count: number; totalTarget: number; totalActual: number }

interface BuyersResponse {
  buyers: ResolvedBuyer[]
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean }
  summary: {
    totalBuyers: number
    tier1: TierSummary; tier2: TierSummary; tier3: TierSummary; others: TierSummary
    bySegment: Record<string, number>
    totalTarget: number; totalActual: number
  }
  filterOptions: { countries: string[]; salesPersons: string[]; segments: string[] }
  meta: { currentFY: string; currentWeek: number; canonicalMapActive: boolean }
}

interface Props { userRole?: UserRole; salesPerson?: string }

// ── Short labels ──────────────────────────────────────────────────────────────
function segmentShortLabel(s: BuyerSegment): string {
  switch (s) {
    case "VIP":            return "VIP"
    case "STRATEGIC":      return "Strategic"
    case "STRONG_HOLD":    return "Strong Hold"
    case "KEY_ACCOUNT":    return "Key Acct"
    case "GROWTH":         return "Growth"
    case "EXISTING":       return "Existing"
    case "RISK":           return "Risk"
    case "NEW_OPP":        return "New Opp"
    default:               return s
  }
}
function tierShort(t: BuyerTier): string {
  return t === "TIER1" ? "T1" : t === "TIER2" ? "T2" : t === "TIER3" ? "T3" : "Others"
}

// ── Filter pill configs ──────────────────────────────────────────────────────
const SEGMENTS: { value: BuyerSegment | "ALL"; label: string; color: string }[] = [
  { value: "ALL",            label: "All",          color: "bg-gray-100 text-gray-700 border-gray-200" },
  { value: "EXISTING",       label: "Existing",     color: "bg-blue-100 text-blue-700 border-blue-200" },
]

const TIERS: { value: BuyerTier | "ALL"; label: string }[] = [
  { value: "ALL",    label: "All Tiers" },
  { value: "TIER1",  label: "Tier 1" },
  { value: "TIER2",  label: "Tier 2" },
  { value: "TIER3",  label: "Tier 3" },
  { value: "OTHERS", label: "Others" },
]

// ── Health Score pill ─────────────────────────────────────────────────────────
function HealthPill({ score, label }: { score: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative w-8 h-8 flex-shrink-0">
        <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
          <circle cx="18" cy="18" r="14" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="14" fill="none"
            stroke={score >= 80 ? "#10b981" : score >= 60 ? "#14b8a6" : score >= 40 ? "#f59e0b" : score >= 20 ? "#ef4444" : "#9ca3af"}
            strokeWidth="3"
            strokeDasharray={`${(score / 100) * 87.96} 87.96`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-gray-700">
          {score}
        </span>
      </div>
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium hidden sm:inline ${healthBg(label as any)}`}>
        {label.replace("_", " ")}
      </span>
    </div>
  )
}

// ── 4-Field Task Modal (inline on buyers list) ────────────────────────────────
function QuickTaskModal({
  buyer, salesPersons, defaultSP, existingTask, onClose, onSaved,
}: {
  buyer: ResolvedBuyer
  salesPersons: string[]
  defaultSP: string
  existingTask?: BuyerTask
  onClose: () => void
  onSaved: () => void
}) {
  const [topic,    setTopic]    = useState(existingTask?.title ?? "")          
  const [sp,       setSP]       = useState(existingTask?.assignedTo ?? defaultSP)
  const [date,     setDate]     = useState(existingTask?.dueDate ?? "")        
  const [points,   setPoints]   = useState(existingTask?.description ?? "")    
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState("")

  // Default date = today + 5 if no date exists
  useEffect(() => {
    if (!date && !existingTask) {
      const d = new Date()
      d.setDate(d.getDate() + 5)
      setDate(d.toISOString().split("T")[0])
    }
  }, [date, existingTask])

  const submit = async () => {
    if (!topic.trim()) { setErr("Please enter meeting topic"); return }
    if (!sp.trim())    { setErr("Please pick a sales person"); return }
    if (!date)         { setErr("Please pick a date"); return }
    setSaving(true); setErr("")
    try {
      const payload: any = {
        buyerCode:    buyer.canonicalBuyerCode,
        buyerName:    buyer.canonicalBuyerName,
        country:      buyer.country,
        title:        topic,
        description:  points,
        taskType:     "MEETING_FIX",
        assignedTo:   sp,
        assignedRole: "SALES_PERSON",
        dueDate:      date,
      }
      if (existingTask) payload.id = existingTask.id

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("Failed")
      onSaved(); onClose()
    } catch {
      setErr("Failed to save. Try again.")
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-3"
           onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-bold text-gray-900">📋 {existingTask ? "Edit Task" : "New Task Allocation"}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{buyer.canonicalBuyerName} · {buyer.country}</p>
        </div>

        {/* 1. Meeting topic */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Meeting / Task</label>
          <input
            type="text"
            placeholder="e.g. Discuss new pricing, sample follow-up…"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-400 focus:outline-none"
            autoFocus
          />
        </div>

        {/* 2. Sales person */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Sales Person</label>
          <select
            value={sp}
            onChange={(e) => setSP(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-400 focus:outline-none"
          >
            <option value="">Pick a person…</option>
            {salesPersons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* 3. Timing (date) */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Timing (Date)</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-400 focus:outline-none"
          />
        </div>

        {/* 4. Action points */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Action Points</label>
          <textarea
            rows={3}
            placeholder="What needs to be done? (samples, pitch, quote, etc.)"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:border-blue-400 focus:outline-none"
          />
        </div>

        {err && <p className="text-xs text-red-600">{err}</p>}

        <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >Cancel</button>
          <button
            onClick={submit}
            disabled={saving || !topic || !sp || !date}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : (existingTask ? "Save Changes" : "Save Task")}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Task Cell — shows saved task data inline ──────────────────────────────────
function TaskCell({
  task, onAdd, onEdit, onDelete, canEdit,
}: {
  task: BuyerTask | undefined
  onAdd: () => void
  onEdit: (t?: BuyerTask) => void
  onDelete: (id: string) => void
  canEdit: boolean
}) {
  if (!task) {
    if (!canEdit) return <span className="text-gray-300 italic text-[10px]">No tasks</span>
    return (
      <button
        onClick={onAdd}
        className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors w-full"
      >
        + Add Task
      </button>
    )
  }

  const dueParts = task.dueDate?.split("-") ?? []
  const dueShort = dueParts.length === 3 ? `${dueParts[2]}/${dueParts[1]}` : task.dueDate
  const isOverdue = task.status === "OVERDUE"

  return (
    <div className="relative space-y-1 min-w-[220px] max-w-[280px] pr-8 group bg-gray-50/50 p-2 rounded-lg border border-gray-100">
      {/* Action Icons (Top Right) */}
      {canEdit && (
        <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(task)}
            className="p-1 bg-white rounded border border-gray-200 shadow-sm text-gray-400 hover:text-blue-600 hover:border-blue-200 transition-all"
            title="Edit Task"
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-1 bg-white rounded border border-gray-200 shadow-sm text-gray-400 hover:text-red-600 hover:border-red-200 transition-all"
            title="Delete Task"
          >
            🗑️
          </button>
        </div>
      )}

      {/* 1. Topic */}
      <p className="text-xs font-bold text-gray-900 truncate leading-snug" title={task.title}>
        🤝 {task.title}
      </p>
      
      {/* 2. Sales person + 3. Date */}
      <div className="flex items-center gap-2 flex-wrap text-[10px]">
        <span className="bg-white px-1.5 py-0.5 rounded border border-gray-100 text-gray-700 font-semibold shadow-sm">
          👤 {task.assignedTo}
        </span>
        <span className={`px-1.5 py-0.5 rounded font-bold shadow-sm ${
          isOverdue ? "bg-red-50 text-red-600 border border-red-100" : "bg-white text-gray-600 border border-gray-100"
        }`}>
          📅 {dueShort}{isOverdue && " ⚠"}
        </span>
      </div>

      {/* 4. Action points */}
      {task.description && (
        <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed bg-white/50 p-1 rounded mt-1 border border-dashed border-gray-200" title={task.description}>
          📌 {task.description}
        </p>
      )}

      {canEdit && (
        <button
          onClick={() => onAdd()}
          className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline mt-1 block"
        >
          + Add another
        </button>
      )}
    </div>
  )
}

import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { 
  setGlobalFilterSP, setGlobalFilterCountry, setBuyerSegment, setBuyerTier, setSearch, setFY 
} from "@/store/slices/uiSlice"

// ── Main component ────────────────────────────────────────────────────────────
export function BuyersClient({ userRole, salesPerson }: Props) {
  const router = useRouter()
  const dispatch = useAppDispatch()
  
  // Select specific properties to avoid unnecessary re-renders when other UI state changes
  const globalFilterSP = useAppSelector(state => state.ui.globalFilterSP)
  const globalFilterCountry = useAppSelector(state => state.ui.globalFilterCountry)
  const buyerSegment = useAppSelector(state => state.ui.buyerSegment)
  const buyerTier = useAppSelector(state => state.ui.buyerTier)
  const search = useAppSelector(state => state.ui.search)
  const fy = useAppSelector(state => state.ui.fy)

  const [data,             setData]             = useState<BuyersResponse | null>(null)
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState("")
  const [page,             setPage]             = useState(1)
  const [taskMap,          setTaskMap]          = useState<Map<string, BuyerTask>>(new Map())
  const [warnDismissed,    setWarnDismissed]    = useState(false)
  const [modalBuyer,       setModalBuyer]       = useState<ResolvedBuyer | null>(null)
  const [modalTask,        setModalTask]        = useState<BuyerTask | undefined>(undefined)
  const searchRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fetchData = useCallback(async (
    pg: number, sp: string, country: string, seg: string, ti: string, srch: string, year: string
  ) => {
    setLoading(true); setError("")
    const params = new URLSearchParams()
    if (country)       params.set("country",     country)
    if (sp)            params.set("salesPerson", sp)
    if (year)          params.set("fy",          year)
    if (srch)          params.set("search",      srch)
    if (seg !== "ALL") params.set("segment",     seg)
    if (ti  !== "ALL") params.set("tier",        ti)
    params.set("page",  String(pg))
    params.set("limit", "10")
    try {
      const res = await fetch(`/api/buyers?${params}`)
      if (!res.ok) throw new Error("Failed")
      setData(await res.json())
    } catch { setError("Failed to load buyers.") }
    finally { setLoading(false) }
  }, [])

  // Fetch all open/in-progress tasks; show most recent per buyer in column
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?limit=2000`)
      if (!res.ok) return
      const d = await res.json()
      const map = new Map<string, BuyerTask>()
      const tasks: BuyerTask[] = d.tasks ?? []
      // Keep most recently created (latest task) per buyer — that's "front" view
      const sorted = [...tasks].sort((a, b) =>
        (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
      )
      for (const t of sorted) {
        if (t.status === "DONE") continue
        const key = t.buyerCode || t.buyerName
        if (!key) continue
        if (!map.has(key)) map.set(key, t)
      }
      setTaskMap(map)
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => {
    clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => {
      setPage(1); fetchData(1, globalFilterSP, globalFilterCountry, buyerSegment, buyerTier, search, fy)
    }, search ? 400 : 0)
    return () => clearTimeout(searchRef.current)
  }, [globalFilterSP, globalFilterCountry, buyerSegment, buyerTier, search, fy, fetchData])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const handleFilter  = (f: FilterState) => { 
    dispatch(setGlobalFilterSP(f.salesPerson ?? ""))
    dispatch(setGlobalFilterCountry(f.country ?? ""))
    dispatch(setSearch(f.search ?? ""))
    dispatch(setFY(f.fy ?? ""))
    setPage(1) 
  }
  const handlePage    = (p: number) => { 
    setPage(p)
    fetchData(p, globalFilterSP, globalFilterCountry, buyerSegment, buyerTier, search, fy) 
  }
  const handleSegment = (s: BuyerSegment | "ALL") => { dispatch(setBuyerSegment(s)); setPage(1) }
  const handleTier    = (t: BuyerTier   | "ALL") => { dispatch(setBuyerTier(t));    setPage(1) }

  const currentFilters: FilterState = {
    country: globalFilterCountry,
    salesPerson: globalFilterSP,
    fy: fy,
    search: search
  }

  const isSP = userRole === "SALES_PERSON"
  const canEdit = userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "MANAGER" || userRole === "DIRECTOR"

  const getBuyerTask = (b: ResolvedBuyer): BuyerTask | undefined =>
    (b.buyerCode          ? taskMap.get(b.buyerCode)          : undefined) ??
    (b.canonicalBuyerCode ? taskMap.get(b.canonicalBuyerCode) : undefined) ??
    taskMap.get(b.canonicalBuyerName)

  const openModalFor = (b: ResolvedBuyer, t?: BuyerTask) => { setModalBuyer(b); setModalTask(t) }
  const closeModal   = ()                  => { setModalBuyer(null); setModalTask(undefined) }
  const onTaskSaved  = () => { fetchTasks() }

  const handleTaskDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this task?")) return
    try {
      const res = await fetch(`/api/tasks?id=${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      fetchTasks()
    } catch (err) {
      alert("Error deleting task")
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <FilterBar
        filters={currentFilters} onChange={handleFilter}
        options={data?.filterOptions}
        showSearch={true} showFY={true} showSP={!isSP}
      />

      {/* Tier summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Tier 1",  data: data.summary.tier1,  color: "bg-amber-50 border-amber-200" },
            { label: "Tier 2",  data: data.summary.tier2,  color: "bg-blue-50 border-blue-200"   },
            { label: "Tier 3",  data: data.summary.tier3,  color: "bg-green-50 border-green-200" },
            { label: "Others",  data: data.summary.others, color: "bg-gray-50 border-gray-200"   },
          ].map((t) => (
            <div key={t.label} className={`rounded-lg border px-3 py-2.5 ${t.color}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.label}</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{t.data.count} <span className="text-sm font-normal text-gray-500">buyers</span></p>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatNumber(t.data.totalActual, 0)} / {formatNumber(t.data.totalTarget, 0)} ctrs
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Segment + Tier pills */}
      <div className="flex flex-wrap gap-1.5">
        {SEGMENTS.map((s) => (
          <button
            key={s.value}
            onClick={() => handleSegment(s.value)}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
              buyerSegment === s.value
                ? `${s.color} ring-2 ring-offset-1 ring-current`
                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            {s.label}
            {data && s.value !== "ALL" && data.summary.bySegment[s.value] != null && (
              <span className="ml-1 opacity-60">({data.summary.bySegment[s.value]})</span>
            )}
          </button>
        ))}
        <div className="w-px bg-gray-200 mx-1 self-stretch" />
        {TIERS.map((t) => (
          <button
            key={t.value}
            onClick={() => handleTier(t.value)}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
              buyerTier === t.value
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Canonical map notice — dismissible */}
      {data && !data.meta.canonicalMapActive && !warnDismissed && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <span>⚠️</span>
          <span className="flex-1">
            Canonical buyer map not configured — buyer names shown as-is from PI data. Auto-segmentation (top 20 = VIP, 21–50 = Strategic) is active.
          </span>
          <button
            onClick={() => setWarnDismissed(true)}
            className="ml-2 text-amber-600 hover:text-amber-900 font-bold text-sm leading-none"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-700">
            {loading ? "Loading…" : `${data?.pagination.total ?? 0} buyers`}
          </span>
          {data && (
            <span className="text-xs text-gray-400">
              FY {data.meta.currentFY} · W{data.meta.currentWeek}
            </span>
          )}
        </div>

        {error && <div className="p-4 text-sm text-red-600 bg-red-50">{error}</div>}

        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider w-8">#</th>
                <th className="text-left px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[200px]">Buyer</th>
                <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[120px]">C / S / T</th>
                <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Health</th>
                <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Target</th>
                <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Actual</th>
                <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-32">Ach%</th>
                <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Gap</th>
                <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-32">Owner</th>
                <th className="text-left px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[250px]">Task Allocation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && !data
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-3 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse" /></td>
                    ))}</tr>
                  ))
                : data?.buyers.map((b, idx) => {
                    const task = getBuyerTask(b)
                    return (
                      <tr
                        key={b.canonicalBuyerCode}
                        className="hover:bg-blue-50/30 cursor-pointer transition-colors"
                        onClick={() => router.push(`/buyers/${encodeURIComponent(b.canonicalBuyerCode)}`)}
                      >
                        <td className="px-3 py-3 text-xs text-gray-400 text-center font-mono">
                          {b.strategicRank < 999 ? b.strategicRank : ((page - 1) * 10 + idx + 1)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              {b.isKeyAccount && <span className="text-violet-500 text-xs" title="Key Account">★</span>}
                              <span className="font-bold text-gray-900 truncate text-sm tracking-tight">{b.canonicalBuyerName}</span>
                              {b.isNewBuyer && (
                                <span className="bg-red-500 text-white text-[8px] px-1 rounded font-black animate-pulse" title="New Business Development">NBD</span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-400 font-mono mt-0.5">{b.buyerCode}</p>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`bg-blue-50 text-blue-700 text-[9px] px-2 py-0.5 rounded font-bold border border-blue-100 uppercase flex items-center gap-1 ${b.isDreamMarket ? "ring-1 ring-yellow-400" : ""}`}>
                              {b.country}
                              {b.isDreamMarket && <span title="Dream Market">🌟</span>}
                            </span>
                            <div className="flex items-center gap-1">
                              <span className={`text-[8px] px-1 py-0 rounded font-bold border ${segmentBg(b.segment)}`}>
                                {segmentShortLabel(b.segment)}
                              </span>
                              <span className={`text-[9px] font-bold ${
                                b.tier === "TIER1" ? "text-amber-700" :
                                b.tier === "TIER2" ? "text-blue-700"  :
                                b.tier === "TIER3" ? "text-green-700" :
                                                     "text-gray-500"
                              }`}>
                                {tierShort(b.tier)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex justify-center">
                            <HealthPill score={b.healthScore.total} label={b.healthScore.label} />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums font-semibold text-gray-600 text-sm">
                          {formatNumber(b.target, 0)}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums font-bold text-gray-900 text-sm">
                          {formatNumber(b.actual, 0)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="max-w-[80px] mx-auto">
                            <AchievementBar pct={b.achievementPct} status={b.status} />
                          </div>
                        </td>
                        <td className={`px-3 py-3 text-center tabular-nums text-xs font-bold ${b.gap >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {b.gap >= 0 ? "+" : ""}{formatNumber(b.gap, 0)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] text-gray-800 font-bold truncate max-w-[120px]">{b.primaryOwner}</span>
                            {b.salesCoordinator && (
                              <span className="text-[9px] text-gray-400 font-medium truncate max-w-[120px]">Coord: {b.salesCoordinator}</span>
                            )}
                          </div>
                        </td>
                        {/* Task Allocation */}
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <TaskCell
                            task={task}
                            onAdd={()  => openModalFor(b)}
                            onEdit={(t) => openModalFor(b, t)}
                            onDelete={(id) => handleTaskDelete(id)}
                            canEdit={canEdit}
                          />
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-gray-100">
          {loading && !data
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 space-y-2 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              ))
            : data?.buyers.map((b) => {
                const task = getBuyerTask(b)
                return (
                  <div
                    key={b.canonicalBuyerCode}
                    className="p-4 space-y-2 cursor-pointer active:bg-gray-50"
                    onClick={() => router.push(`/buyers/${encodeURIComponent(b.canonicalBuyerCode)}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <SegmentTag segment={b.segment} isKeyAccount={b.isKeyAccount} />
                          <p className="font-bold text-gray-900 text-sm leading-tight truncate">
                            {b.canonicalBuyerName}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-gray-400 font-bold uppercase">{b.country}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${segmentBg(b.segment)}`}>
                            {segmentShortLabel(b.segment)}
                          </span>
                          <span className={`text-[9px] font-bold ${
                            b.tier === "TIER1" ? "text-amber-700" :
                            b.tier === "TIER2" ? "text-blue-700"  :
                            b.tier === "TIER3" ? "text-green-700" :
                                                 "text-gray-500"
                          }`}>
                            {tierShort(b.tier)}
                          </span>
                        </div>
                      </div>
                      <HealthPill score={b.healthScore.total} label={b.healthScore.label} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-500 font-bold">
                      <span>TGT: <strong className="text-gray-700">{formatNumber(b.target, 0)}</strong></span>
                      <span>ACT: <strong className="text-gray-900">{formatNumber(b.actual, 0)}</strong></span>
                      <span className={b.gap >= 0 ? "text-green-600" : "text-red-500"}>
                        {b.gap >= 0 ? "+" : ""}{formatNumber(b.gap, 0)}
                      </span>
                    </div>
                    <AchievementBar pct={b.achievementPct} status={b.status} />
                    {/* Task allocation on mobile */}
                    <div onClick={(e) => e.stopPropagation()} className="mt-2">
                      <TaskCell
                        task={task}
                        onAdd={()  => openModalFor(b)}
                        onEdit={(t) => openModalFor(b, t)}
                        onDelete={(id) => handleTaskDelete(id)}
                        canEdit={canEdit}
                      />
                    </div>
                  </div>
                )
              })
          }
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-4 border-t border-gray-100 bg-gray-50">
            <button
              onClick={() => handlePage(page - 1)}
              disabled={!data.pagination.hasPrev || loading}
              className="text-xs font-bold px-4 py-2 rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 shadow-sm disabled:opacity-40 transition-all"
            >← Previous</button>
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Page {page} / {data.pagination.totalPages}
              <span className="ml-2 text-gray-400">({data.pagination.total} total)</span>
            </span>
            <button
              onClick={() => handlePage(page + 1)}
              disabled={!data.pagination.hasNext || loading}
              className="text-xs font-bold px-4 py-2 rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 shadow-sm disabled:opacity-40 transition-all"
            >Next →</button>
          </div>
        )}
      </div>

      {/* 4-field task modal */}
      {modalBuyer && (
        <QuickTaskModal
          buyer={modalBuyer}
          salesPersons={data?.filterOptions.salesPersons ?? []}
          defaultSP={modalBuyer.primaryOwner ?? salesPerson ?? ""}
          existingTask={modalTask}
          onClose={closeModal}
          onSaved={onTaskSaved}
        />
      )}
    </div>
  )
}

