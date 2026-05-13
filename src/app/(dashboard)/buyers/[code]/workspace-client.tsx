"use client"

import { useState, useEffect, useCallback } from "react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import { StatusBadge, TierBadge, AchievementBar } from "@/components/ui/status-badge"
import { SummaryCard } from "@/components/ui/page-header"
import { BrandPill } from "@/components/ui/brand-pill"
import { segmentBg, segmentLabel, healthBg, healthBar, formatNumber, ALL_BUYER_SEGMENTS } from "@/lib/utils"
import type {
  ResolvedBuyer, PIRecord, BuyerWeeklyBar,
  LeadActivity, ActivityType, ActivityOutcome,
  Alert, OwnershipRecord, UserRole, BuyerSegment,
  BuyerTask, TaskStatus, TaskType, AssignedRole, MeetingCompliance,
} from "@/types"

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkspaceResponse {
  buyer:              ResolvedBuyer
  piHistory:          PIRecord[]
  weeklyBars:         BuyerWeeklyBar[]
  meetingCompliance:  MeetingCompliance
  meta:               { currentFY: string; currentWeek: number }
}

interface Props {
  code:           string
  userRole?:      UserRole
  userName?:      string
  salesPerson?:   string
  allSalesPersons: string[]
}

type Tab = "overview" | "activity" | "tasks" | "alerts" | "history" | "ownership" | "meetings"

// ── 1-Tap Activity Buttons config ─────────────────────────────────────────────
const QUICK_ACTIVITIES: { type: ActivityType; label: string; icon: string; color: string }[] = [
  { type: "CALL",        label: "Call",        icon: "📞", color: "bg-blue-500 hover:bg-blue-600" },
  { type: "WHATSAPP",    label: "WhatsApp",    icon: "💬", color: "bg-green-500 hover:bg-green-600" },
  { type: "EMAIL",       label: "Email",       icon: "✉️",  color: "bg-indigo-500 hover:bg-indigo-600" },
  { type: "SAMPLE_SENT", label: "Sample",      icon: "📦", color: "bg-amber-500 hover:bg-amber-600" },
  { type: "MEETING",     label: "Meeting",     icon: "🤝", color: "bg-teal-500 hover:bg-teal-600" },
  { type: "FOLLOW_UP",   label: "Follow-up",   icon: "🔁", color: "bg-cyan-500 hover:bg-cyan-600" },
]

// ── Toast component ───────────────────────────────────────────────────────────
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2400)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="fixed top-4 right-4 bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm z-50 flex items-center gap-2">
      <span className="text-green-400">✓</span>
      {message}
    </div>
  )
}

// ── Quick Activity Bar ────────────────────────────────────────────────────────
function QuickActivityBar({
  buyer, salesPerson, onLogged,
}: {
  buyer: ResolvedBuyer
  salesPerson: string
  onLogged: (msg: string) => void
}) {
  const [busy,    setBusy]    = useState<ActivityType | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [noteForm, setNoteForm] = useState<{ type: ActivityType; notes: string; outcome: ActivityOutcome }>({
    type: "CALL", notes: "", outcome: "NEUTRAL",
  })

  const log = async (type: ActivityType, notes = "", outcome: ActivityOutcome = "NEUTRAL") => {
    setBusy(type)
    try {
      await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerCode:    buyer.canonicalBuyerCode,
          buyerName:    buyer.canonicalBuyerName,
          country:      buyer.country,
          activityType: type,
          notes,
          outcome,
          salesPerson,
        }),
      })
      onLogged(`${type.replace("_", " ").toLowerCase()} logged`)
    } finally { setBusy(null) }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">⚡ Quick Log</p>
        <button
          onClick={() => setShowNotes(!showNotes)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          {showNotes ? "− Hide notes" : "+ With notes"}
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {QUICK_ACTIVITIES.map((qa) => (
          <button
            key={qa.type}
            onClick={() => log(qa.type)}
            disabled={busy !== null}
            className={`${qa.color} text-white rounded-lg p-2 sm:p-2.5 transition-all disabled:opacity-50 active:scale-95`}
          >
            <div className="text-lg sm:text-xl">{qa.icon}</div>
            <div className="text-[10px] sm:text-xs font-semibold mt-0.5">
              {busy === qa.type ? "…" : qa.label}
            </div>
          </button>
        ))}
      </div>

      {showNotes && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <div className="flex gap-2">
            <select
              value={noteForm.type}
              onChange={(e) => setNoteForm({ ...noteForm, type: e.target.value as ActivityType })}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              {QUICK_ACTIVITIES.map((qa) => (
                <option key={qa.type} value={qa.type}>{qa.icon} {qa.label}</option>
              ))}
              <option value="VISIT">🚶 Visit</option>
              <option value="DEMO">🎬 Demo</option>
              <option value="ORDER_PLACED">🎯 Order placed</option>
              <option value="OTHER">• Other</option>
            </select>
            <select
              value={noteForm.outcome}
              onChange={(e) => setNoteForm({ ...noteForm, outcome: e.target.value as ActivityOutcome })}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
            >
              <option value="POSITIVE">✅ Positive</option>
              <option value="NEUTRAL">— Neutral</option>
              <option value="NEGATIVE">⚠️ Negative</option>
            </select>
          </div>
          <textarea
            rows={2} value={noteForm.notes}
            onChange={(e) => setNoteForm({ ...noteForm, notes: e.target.value })}
            placeholder="Notes…"
            className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <button
            onClick={() => {
              log(noteForm.type, noteForm.notes, noteForm.outcome)
              setNoteForm({ type: "CALL", notes: "", outcome: "NEUTRAL" })
              setShowNotes(false)
            }}
            disabled={busy !== null}
            className="px-3 py-1.5 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            Log Activity
          </button>
        </div>
      )}
    </div>
  )
}

// ── Activity Log List ─────────────────────────────────────────────────────────
function ActivityList({
  activities, loading,
}: { activities: LeadActivity[]; loading: boolean }) {
  if (loading) return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
  )
  if (activities.length === 0) return (
    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-400 text-sm">
      No activities logged for this buyer yet. Use the quick buttons above to log.
    </div>
  )
  const ICON_MAP: Record<ActivityType, string> = {
    CALL: "📞", WHATSAPP: "💬", EMAIL: "✉️", SAMPLE_SENT: "📦",
    VISIT: "🚶", MEETING: "🤝", FOLLOW_UP: "🔁",
    ORDER_PLACED: "🎯", DEMO: "🎬", OTHER: "•",
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
      {activities.map((a) => (
        <div key={a.id} className="p-3 flex items-center gap-3">
          <span className="text-xl flex-shrink-0">{ICON_MAP[a.activityType]}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-medium text-gray-800 capitalize">
                {a.activityType.replace("_", " ").toLowerCase()}
              </p>
              <span className="text-xs text-gray-400">by {a.salesPerson}</span>
            </div>
            {a.notes && <p className="text-xs text-gray-600 mt-0.5">{a.notes}</p>}
          </div>
          <div className="text-right flex-shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
              a.outcome === "POSITIVE" ? "bg-green-100 text-green-700"
              : a.outcome === "NEGATIVE" ? "bg-red-100 text-red-700"
              : "bg-gray-100 text-gray-600"
            }`}>{a.outcome}</span>
            <p className="text-xs text-gray-400 mt-0.5">{a.date} · W{a.fyWeek}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Remark / Action Plan Form ─────────────────────────────────────────────────
function RemarkForm({
  buyer, salesPerson, onSaved,
}: { buyer: ResolvedBuyer; salesPerson: string; onSaved: () => void }) {
  const [remark,         setRemark]         = useState("")
  const [nextActionDate, setNextActionDate] = useState("")
  const [followUpOwner,  setFollowUpOwner]  = useState(salesPerson)
  const [saving,         setSaving]         = useState(false)
  const [open,           setOpen]           = useState(false)

  const save = async () => {
    if (!remark) return
    setSaving(true)
    try {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerCode:      buyer.canonicalBuyerCode,
          buyerName:      buyer.canonicalBuyerName,
          country:        buyer.country,
          salesPerson:    buyer.primaryOwner || salesPerson,
          remark,
          nextActionDate: nextActionDate || undefined,
          followUpOwner:  followUpOwner || undefined,
        }),
      })
      setRemark(""); setNextActionDate(""); setOpen(false)
      onSaved()
    } finally { setSaving(false) }
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-700"
    >
      + Add Remark / Action Plan
    </button>
  )

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-amber-900">📝 New Remark / Action Plan</h4>
        <button onClick={() => setOpen(false)} className="text-amber-700 hover:text-amber-900 text-sm">✕</button>
      </div>
      <textarea
        rows={3} value={remark}
        onChange={(e) => setRemark(e.target.value)}
        placeholder="Reason for missed target, next steps, customer feedback…"
        className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Next action date</label>
          <input
            type="date" value={nextActionDate}
            onChange={(e) => setNextActionDate(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Follow-up owner</label>
          <input
            type="text" value={followUpOwner}
            onChange={(e) => setFollowUpOwner(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </div>
      <button
        onClick={save} disabled={saving || !remark}
        className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Remark"}
      </button>
    </div>
  )
}

// ── Alerts Tab ────────────────────────────────────────────────────────────────
function AlertsTab({ buyer, salesPerson }: { buyer: ResolvedBuyer; salesPerson: string }) {
  const [alerts,  setAlerts]  = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  const SEV_STYLE: Record<string, string> = {
    HIGH:   "bg-red-100 text-red-800 border-red-200",
    MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
    LOW:    "bg-blue-100 text-blue-800 border-blue-200",
  }
  const TYPE_LABELS: Record<string, string> = {
    BUYER_BEHIND_PACE:  "Behind Pace",
    BUYER_DORMANT:      "Dormant",
    KEY_BUYER_AGING:    "Aging",
    MILESTONE_ACHIEVED: "Milestone ✓",
    USER_REMARK:        "Remark",
    ACTION_PLAN:        "Action Plan",
    COUNTRY_BEHIND:     "Country Behind",
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/alerts?buyerCode=${encodeURIComponent(buyer.canonicalBuyerCode)}&buyerName=${encodeURIComponent(buyer.canonicalBuyerName)}&limit=50`)
      const d = await res.json()
      setAlerts(d.alerts ?? [])
    } finally { setLoading(false) }
  }, [buyer.canonicalBuyerCode, buyer.canonicalBuyerName])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div className="space-y-4">
      <RemarkForm buyer={buyer} salesPerson={salesPerson} onSaved={refresh} />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-400 text-sm">
          No alerts or remarks for this buyer yet.
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => {
            const isOverdue = a.status === "OVERDUE"
            const isDone    = a.status === "DONE" || a.status === "RESOLVED"
            const borderClass = isOverdue
              ? "border-l-4 border-l-red-500"
              : a.status === "OPEN"
              ? "border-l-4 border-l-amber-400"
              : "border-gray-200 opacity-75"

            const markDone = async () => {
              await fetch(`/api/alerts/${encodeURIComponent(a.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "DONE" }),
              })
              refresh()
            }

            return (
              <div key={a.id} className={`bg-white border rounded-xl p-4 space-y-2 ${borderClass}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-semibold ${isDone ? "text-gray-500 line-through" : "text-gray-800"}`}>{a.title}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isOverdue && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700 border border-red-200">
                        OVERDUE
                      </span>
                    )}
                    {isDone && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700 border border-green-200">
                        ✓ {a.status}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border whitespace-nowrap ${SEV_STYLE[a.severity]}`}>
                      {a.severity}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-600">{a.message}</p>
                {a.dueDate && (
                  <div className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded ${isOverdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                    📅 Due: <strong>{a.dueDate}</strong>
                    {a.followUpOwner && <span>· Owner: <strong>{a.followUpOwner}</strong></span>}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span className="bg-gray-100 px-2 py-0.5 rounded font-medium">
                    {TYPE_LABELS[a.triggerType] ?? a.triggerType}
                  </span>
                  <div className="flex items-center gap-2">
                    {!isDone && (a.triggerType === "ACTION_PLAN" || a.triggerType === "USER_REMARK" || a.triggerType === "ACTION_OVERDUE") && (
                      <button
                        onClick={markDone}
                        className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                      >
                        ✓ Mark Done
                      </button>
                    )}
                    <span>{a.createdAt ? new Date(a.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : ""} · W{a.fyWeek}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Reassign Modal (manager+) ─────────────────────────────────────────────────
function ReassignModal({
  buyer, salesPersons, onClose, onSaved,
}: {
  buyer: ResolvedBuyer
  salesPersons: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [toOwner, setToOwner] = useState("")
  const [reason,  setReason]  = useState("")
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState("")

  const submit = async () => {
    if (!toOwner) { setError("New owner required"); return }
    setSaving(true); setError("")
    try {
      const res = await fetch("/api/ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalBuyerCode: buyer.canonicalBuyerCode,
          buyerName:          buyer.canonicalBuyerName,
          fromOwner:          buyer.primaryOwner,
          toOwner,
          reason,
        }),
      })
      if (!res.ok) throw new Error()
      onSaved(); onClose()
    } catch { setError("Reassignment failed.") }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">Reassign Owner</h3>
        <p className="text-sm text-gray-500">{buyer.canonicalBuyerName}</p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1">
          <p>Current primary: <strong>{buyer.primaryOwner || "–"}</strong></p>
          <p className="text-xs text-gray-500">FY actuals: <strong>{formatNumber(buyer.actual, 0)}</strong> · Remaining target: <strong>{formatNumber(Math.max(0, buyer.target - buyer.actual), 0)}</strong></p>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">New Primary Owner *</label>
          <select
            value={toOwner}
            onChange={(e) => setToOwner(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            <option value="">Select…</option>
            {salesPersons.filter((s) => s !== buyer.primaryOwner).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <textarea
          rows={2} value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for reassignment…"
          className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          ⚠️ Historical PI attribution stays with {buyer.primaryOwner || "previous owner"}. Only remaining target moves.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving || !toOwner} className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
            {saving ? "Saving…" : "Reassign"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tasks Tab ─────────────────────────────────────────────────────────────────

const COORDINATOR_TEMPLATES: { type: TaskType; label: string; icon: string; title: string; desc: string; days: number; recurring: number }[] = [
  { type: "MEETING_FIX",          label: "Fix Meeting",       icon: "📅", title: "Fix meeting with buyer",         desc: "Schedule meeting 5–6 days in advance",                      days: 5,  recurring: 0  },
  { type: "PITCH_PREP",           label: "Prep Pitch",        icon: "📝", title: "Prepare meeting pitch",          desc: "Pitch deck for upcoming buyer meeting",                     days: 3,  recurring: 0  },
  { type: "MARKET_RESEARCH",      label: "Buyer Products",    icon: "🔎", title: "Research buyer's other products", desc: "What other products is this buyer selling in market",       days: 7,  recurring: 30 },
  { type: "MARKET_PRODUCTS",      label: "Market Products",   icon: "🌐", title: "Identify products in market",     desc: "What products are available in the buyer's market",         days: 7,  recurring: 30 },
  { type: "PRODUCT_MATCH",        label: "Match Portfolio",   icon: "🔗", title: "Match products to our portfolio", desc: "Cross-check market products with our available range",      days: 7,  recurring: 30 },
  { type: "PRODUCT_AVAILABILITY", label: "Send Availability", icon: "📦", title: "Send product availability",       desc: "Send latest product availability list to buyer (every 20d)", days: 0, recurring: 20 },
]

const STATUS_STYLE: Record<TaskStatus, string> = {
  OPEN:        "bg-blue-100 text-blue-800 border-blue-200",
  IN_PROGRESS: "bg-amber-100 text-amber-800 border-amber-200",
  DONE:        "bg-green-100 text-green-700 border-green-200",
  OVERDUE:     "bg-red-100 text-red-700 border-red-200",
}

const ROLE_LABEL: Record<AssignedRole, string> = {
  SALES_PERSON:      "Sales Person",
  SALES_COORDINATOR: "Coordinator",
  BACKUP_OWNER:      "Backup Owner",
}

function QuickAssignModal({
  template, buyer, defaultAssignee, salesPersons, onClose, onSaved,
}: {
  template: typeof COORDINATOR_TEMPLATES[number]
  buyer: ResolvedBuyer
  defaultAssignee: string
  salesPersons: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [assignee, setAssignee] = useState(defaultAssignee)
  const [role, setRole]         = useState<AssignedRole>("SALES_COORDINATOR")
  const [saving, setSaving]     = useState(false)

  const submit = async () => {
    if (!assignee) return
    setSaving(true)
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerCode:     buyer.canonicalBuyerCode,
          buyerName:     buyer.canonicalBuyerName,
          country:       buyer.country,
          title:         template.title,
          description:   template.desc,
          taskType:      template.type,
          assignedTo:    assignee,
          assignedRole:  role,
          daysFromNow:   template.days,
          recurringDays: template.recurring,
        }),
      })
      onSaved(); onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-bold text-gray-900">{template.icon} {template.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{template.desc}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs text-gray-600">
          Due in <strong>{template.days}d</strong>
          {template.recurring > 0 && <> · Auto-renews every <strong>{template.recurring}d</strong></>}
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Assign to</label>
          <select
            value={assignee} onChange={(e) => setAssignee(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg p-2"
          >
            <option value="">Pick a person…</option>
            {salesPersons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Role</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(["SALES_COORDINATOR", "SALES_PERSON", "BACKUP_OWNER"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`text-[11px] px-2 py-1.5 rounded-lg border font-medium transition-all ${
                  role === r ? "bg-green-600 text-white border-green-600" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving || !assignee}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
            {saving ? "Saving…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  )
}

function CustomTaskModal({
  buyer, defaultAssignee, salesPersons, onClose, onSaved,
}: {
  buyer: ResolvedBuyer
  defaultAssignee: string
  salesPersons: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title,    setTitle]    = useState("")
  const [desc,     setDesc]     = useState("")
  const [assignee, setAssignee] = useState(defaultAssignee)
  const [role,     setRole]     = useState<AssignedRole>("SALES_PERSON")
  const [days,     setDays]     = useState(5)
  const [saving,   setSaving]   = useState(false)

  const submit = async () => {
    if (!title || !assignee) return
    setSaving(true)
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerCode:    buyer.canonicalBuyerCode,
          buyerName:    buyer.canonicalBuyerName,
          country:      buyer.country,
          title,
          description:  desc,
          taskType:     "CUSTOM",
          assignedTo:   assignee,
          assignedRole: role,
          daysFromNow:  days,
        }),
      })
      onSaved(); onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-900">+ Custom Task</h3>
        <input
          type="text" placeholder="Task title…" value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg p-2"
        />
        <textarea
          rows={2} placeholder="Description (optional)…" value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none"
        />
        <div className="grid grid-cols-2 gap-2">
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="text-sm border border-gray-200 rounded-lg p-2">
            <option value="">Pick a person…</option>
            {salesPersons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value as AssignedRole)} className="text-sm border border-gray-200 rounded-lg p-2">
            <option value="SALES_PERSON">Sales Person</option>
            <option value="SALES_COORDINATOR">Coordinator</option>
            <option value="BACKUP_OWNER">Backup Owner</option>
          </select>
        </div>
        <label className="block text-xs text-gray-600">
          Due in
          <input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value))}
                 className="ml-2 w-16 text-sm border border-gray-200 rounded p-1" /> days
        </label>
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving || !title || !assignee}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
            {saving ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  )
}

function TasksTab({
  buyer, isManager, salesPersons, defaultAssignee,
}: {
  buyer: ResolvedBuyer
  isManager: boolean
  salesPersons: string[]
  defaultAssignee: string
}) {
  const [tasks,     setTasks]     = useState<BuyerTask[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState<TaskStatus | "ALL">("ALL")
  const [quickFor,  setQuickFor]  = useState<typeof COORDINATOR_TEMPLATES[number] | null>(null)
  const [showCustom, setShowCustom] = useState(false)
  const [busyId,    setBusyId]    = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks?buyerCode=${encodeURIComponent(buyer.canonicalBuyerCode)}&limit=100`)
      const d = await res.json()
      setTasks(d.tasks ?? [])
    } finally { setLoading(false) }
  }, [buyer.canonicalBuyerCode])

  useEffect(() => { refresh() }, [refresh])

  const updateStatus = async (id: string, status: TaskStatus) => {
    setBusyId(id)
    try {
      await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      await refresh()
    } finally { setBusyId(null) }
  }

  const filtered = tasks.filter((t) => filter === "ALL" || t.status === filter)
  const counts = {
    OPEN:        tasks.filter((t) => t.status === "OPEN").length,
    IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    DONE:        tasks.filter((t) => t.status === "DONE").length,
    OVERDUE:     tasks.filter((t) => t.status === "OVERDUE").length,
  }

  return (
    <div className="space-y-4">
      {/* Quick coordinator templates */}
      {isManager && (
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">⚡ Coordinator Quick Tasks</p>
            <button onClick={() => setShowCustom(true)} className="text-xs text-green-600 hover:text-green-700 font-medium">
              + Custom Task
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {COORDINATOR_TEMPLATES.map((tpl) => (
              <button
                key={tpl.type}
                onClick={() => setQuickFor(tpl)}
                className="bg-gray-50 hover:bg-green-50 border border-gray-200 hover:border-green-300 rounded-lg p-2.5 text-left transition-all"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-base">{tpl.icon}</span>
                  <span className="text-xs font-semibold text-gray-700">{tpl.label}</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1 leading-tight">
                  Due {tpl.days}d{tpl.recurring > 0 && ` · every ${tpl.recurring}d`}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {(["ALL", "OPEN", "IN_PROGRESS", "DONE", "OVERDUE"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
              filter === s
                ? s === "OVERDUE" ? "bg-red-100 text-red-700 border-red-200 ring-1 ring-red-300"
                : "bg-gray-800 text-white border-gray-800"
                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            {s === "ALL" ? `All (${tasks.length})` : `${s.replace("_", " ")} (${counts[s as keyof typeof counts]})`}
          </button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          {tasks.length === 0
            ? "No tasks yet for this buyer. Use the quick tasks above to assign one."
            : "No tasks match the current filter."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const isDone     = t.status === "DONE"
            const isOverdue  = t.status === "OVERDUE"
            return (
              <div key={t.id}
                   className={`bg-white border rounded-xl p-3 space-y-1.5 ${
                     isOverdue ? "border-l-4 border-l-red-500"
                     : t.status === "OPEN" || t.status === "IN_PROGRESS" ? "border-l-4 border-l-amber-400"
                     : "border-gray-200 opacity-75"
                   }`}>
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-semibold flex-1 ${isDone ? "text-gray-500 line-through" : "text-gray-800"}`}>
                    {t.title}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border whitespace-nowrap ${STATUS_STYLE[t.status]}`}>
                    {t.status.replace("_", " ")}
                  </span>
                </div>
                {t.description && <p className="text-xs text-gray-600">{t.description}</p>}
                <div className="flex items-center justify-between flex-wrap gap-1 text-xs">
                  <div className="flex items-center gap-2 text-gray-500">
                    <span>👤 {t.assignedTo}</span>
                    <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{ROLE_LABEL[t.assignedRole]}</span>
                    {t.recurringDays > 0 && (
                      <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">↻ every {t.recurringDays}d</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={isOverdue ? "text-red-600 font-bold" : "text-gray-500"}>
                      📅 {t.dueDate}
                      {typeof t.daysToDue === "number" && !isDone && (
                        <span className="ml-1 text-[10px]">
                          ({t.daysToDue >= 0 ? `${t.daysToDue}d left` : `${-t.daysToDue}d late`})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                {!isDone && (
                  <div className="flex gap-1 pt-1">
                    {t.status !== "IN_PROGRESS" && (
                      <button
                        onClick={() => updateStatus(t.id, "IN_PROGRESS")}
                        disabled={busyId === t.id}
                        className="text-xs px-2 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 font-medium"
                      >
                        ▶ Start
                      </button>
                    )}
                    <button
                      onClick={() => updateStatus(t.id, "DONE")}
                      disabled={busyId === t.id}
                      className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 font-medium"
                    >
                      ✓ Mark Done
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {quickFor && (
        <QuickAssignModal
          template={quickFor} buyer={buyer}
          defaultAssignee={defaultAssignee} salesPersons={salesPersons}
          onClose={() => setQuickFor(null)} onSaved={refresh}
        />
      )}
      {showCustom && (
        <CustomTaskModal
          buyer={buyer} defaultAssignee={defaultAssignee} salesPersons={salesPersons}
          onClose={() => setShowCustom(false)} onSaved={refresh}
        />
      )}
    </div>
  )
}

// ── Meeting Compliance KPI ────────────────────────────────────────────────────
function MeetingComplianceCard({ compliance }: { compliance: MeetingCompliance }) {
  if (compliance.monthlyTarget === 0) return null
  const pct = (compliance.monthActual / compliance.monthlyTarget) * 100
  const colorBg = pct >= 100 ? "bg-green-50 border-green-200"
    : pct >= 50 ? "bg-amber-50 border-amber-200"
    : "bg-red-50 border-red-200"
  const colorBar = pct >= 100 ? "bg-green-500"
    : pct >= 50 ? "bg-amber-400"
    : "bg-red-400"
  return (
    <div className={`rounded-lg border px-4 py-3 ${colorBg}`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">
        📅 Meetings · this month
      </p>
      <p className="text-xl font-bold text-gray-900 mt-0.5">
        {compliance.monthActual} <span className="text-sm font-normal text-gray-500">/ {compliance.monthlyTarget} req</span>
      </p>
      <div className="h-1 bg-white/60 rounded-full overflow-hidden mt-1.5">
        <div className={`h-full ${colorBar}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-1">
        {compliance.isCompliant ? "✓ on track" : `${compliance.remaining} more needed`}
      </p>
    </div>
  )
}

// ── Segment Edit Modal ───────────────────────────────────────────────────────
function SegmentEditModal({
  buyer, onClose, onSaved,
}: {
  buyer: ResolvedBuyer
  onClose: () => void
  onSaved: () => void
}) {
  const [segment, setSegment] = useState<BuyerSegment>(buyer.segment)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState("")

  const submit = async () => {
    if (segment === buyer.segment) { onClose(); return }
    setSaving(true); setErr("")
    try {
      const res = await fetch(`/api/admin/canonical/${encodeURIComponent(buyer.canonicalBuyerCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment,
          // Make sure the canonical row carries the buyer's identity if we're creating it
          canonicalBuyerName: buyer.canonicalBuyerName,
          country:            buyer.country,
          buyerCode:          buyer.buyerCode,
          primaryOwner:       buyer.primaryOwner,
          backupOwner:        buyer.backupOwner,
          targetFY2026:       buyer.target,
          isKeyAccount:       segment === "VIP" || segment === "KEY_ACCOUNT" || segment === "STRONG_HOLD",
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErr(d.error ?? "Update failed")
        return
      }
      onSaved(); onClose()
    } catch { setErr("Update failed") }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">Change Buyer Segment</h3>
        <p className="text-sm text-gray-500">{buyer.canonicalBuyerName}</p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
          <p>Current: <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${segmentBg(buyer.segment)}`}>{segmentLabel(buyer.segment)}</span></p>
          <p className="text-xs text-gray-500 mt-1.5">
            Target: <strong>{formatNumber(buyer.target, 0)}</strong> ctrs · Actual: <strong>{formatNumber(buyer.actual, 0)}</strong> ctrs
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-2">New Segment</label>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_BUYER_SEGMENTS.map((s) => (
              <button
                key={s}
                onClick={() => setSegment(s)}
                className={`text-xs px-2.5 py-2 rounded-lg border font-medium transition-all text-left ${
                  segment === s
                    ? `${segmentBg(s)} ring-2 ring-offset-1 ring-current`
                    : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {segmentLabel(s)}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          ℹ️ Setting a manual segment overrides the auto-classification. Top 20 buyers by target are auto-set to VIP otherwise.
        </p>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={submit} disabled={saving || segment === buyer.segment}
            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Segment"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Ownership Tab ─────────────────────────────────────────────────────────────
function OwnershipTab({
  buyer, isManager, salesPersons,
}: {
  buyer: ResolvedBuyer
  isManager: boolean
  salesPersons: string[]
}) {
  const [records,    setRecords]    = useState<OwnershipRecord[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ownership?canonicalBuyerCode=${encodeURIComponent(buyer.canonicalBuyerCode)}`)
      const d = await res.json()
      setRecords(d.records ?? [])
    } finally { setLoading(false) }
  }, [buyer.canonicalBuyerCode])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div className="space-y-4">
      {/* Current ownership card */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Current Ownership</h3>
          {isManager && (
            <button
              onClick={() => setShowModal(true)}
              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
            >
              Reassign
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Primary Owner</p>
            <p className="text-base font-semibold text-gray-900 mt-1">
              {buyer.primaryOwner ? (
                <a href={`/sales-persons/${encodeURIComponent(buyer.primaryOwner)}`} className="hover:text-green-700 hover:underline">{buyer.primaryOwner}</a>
              ) : (
                <span className="text-gray-400 italic">unassigned</span>
              )}
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Backup Owner</p>
            <p className="text-base font-semibold text-gray-900 mt-1">
              {buyer.backupOwner ? (
                <a href={`/sales-persons/${encodeURIComponent(buyer.backupOwner)}`} className="hover:text-green-700 hover:underline">{buyer.backupOwner}</a>
              ) : (
                <span className="text-gray-400 italic">none</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Reassignment history */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Reassignment History</h3>
        </div>
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No reassignments yet for this buyer.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {records.map((r) => (
              <div key={r.id} className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">
                    {r.fromOwner} → {r.toOwner}
                  </span>
                  <span className="text-xs text-gray-400">{r.effectiveDate}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">By {r.transferredBy}</p>
                {r.reason && <p className="text-xs text-gray-600 mt-1 italic">"{r.reason}"</p>}
                <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
                  <span>Historical: <strong>{r.historicalActual}</strong> ctrs</span>
                  <span>Inherited target: <strong>{r.inheritedTarget}</strong> ctrs</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <ReassignModal
          buyer={buyer} salesPersons={salesPersons}
          onClose={() => setShowModal(false)}
          onSaved={refresh}
        />
      )}
    </div>
  )
}

// ── Health Score Breakdown ────────────────────────────────────────────────────
function HealthBreakdown({ score }: { score: ResolvedBuyer["healthScore"] }) {
  const bars = [
    { label: "Target Achievement", pts: score.targetAchievement, max: 40 },
    { label: "Growth vs Last Year", pts: score.growthVsLastYear,  max: 25 },
    { label: "Order Frequency",     pts: score.orderFrequency,    max: 20 },
    { label: "Recent Trend",        pts: score.recentTrend,       max: 10 },
    { label: "Engagement",          pts: score.engagementActivity, max: 5, note: "placeholder" },
  ]
  return (
    <div className="space-y-2">
      {bars.map((b) => (
        <div key={b.label}>
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-gray-600">
              {b.label}{b.note && <span className="text-gray-400 ml-1">({b.note})</span>}
            </span>
            <span className="font-semibold text-gray-700">{b.pts}/{b.max}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${healthBar(score.label)}`} style={{ width: `${(b.pts / b.max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── PI History ────────────────────────────────────────────────────────────────
function formatDate(d: string) {
  try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) }
  catch { return d }
}

function PITable({ records, page, onPage }: { records: PIRecord[]; page: number; onPage: (p: number) => void }) {
  const PAGE_SIZE = 10
  const totalPages = Math.ceil(records.length / PAGE_SIZE)
  const currentRecords = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (!records.length) return (
    <div className="py-8 text-center text-gray-400 text-sm">No PI records found.</div>
  )

  const pageActual = currentRecords.reduce((s, r) => s + r.totalContainers, 0)
  const pageMTs = currentRecords.reduce((s, r) => s + (r.qtyMTs || 0), 0)
  const totalActual = records.reduce((s, r) => s + r.totalContainers, 0)
  const totalMTs = records.reduce((s, r) => s + (r.qtyMTs || 0), 0)

  return (
    <div className="space-y-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {["PI No.","Date","FY","Variety","Brand","Containers","MTs","Week"].map((h) => (
                <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {currentRecords.map((r) => (
              <tr key={`${r.piNumber}-${r.fyWeekNo}`} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs text-gray-600">{r.piNumber}</td>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDate(r.piDate)}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{r.financialYear}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.varieties === "BASMATI" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                    {r.varieties}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 max-w-[140px]">
                  <div className="flex items-center gap-1.5">
                    {r.brand && <BrandPill brand={r.brand} />}
                    <span className="truncate">{r.brand || "–"}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.totalContainers}</td>
                <td className="px-3 py-2 text-right text-gray-500 tabular-nums text-xs">{r.qtyMTs?.toFixed(0)}</td>
                <td className="px-3 py-2 text-center text-xs text-gray-400">W{r.fyWeekNo}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50/50 border-t border-gray-100 font-semibold text-gray-900">
            <tr>
              <td colSpan={5} className="px-3 py-2 text-right text-gray-500 font-medium">Page Total:</td>
              <td className="px-3 py-2 text-right tabular-nums">{pageActual}</td>
              <td className="px-3 py-2 text-right tabular-nums text-xs">{pageMTs.toFixed(0)}</td>
              <td className="px-3 py-2" />
            </tr>
            <tr className="border-t border-gray-100 bg-green-50/30">
              <td colSpan={5} className="px-3 py-2 text-right text-green-700 font-bold uppercase tracking-wider text-[10px]">Grand Total:</td>
              <td className="px-3 py-2 text-right tabular-nums text-green-700 font-bold">{totalActual}</td>
              <td className="px-3 py-2 text-right tabular-nums text-xs text-green-600 font-bold">{totalMTs.toFixed(0)}</td>
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>
      
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-100">
          <button
            onClick={() => onPage(page - 1)}
            disabled={page === 1}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="text-xs text-gray-500 font-medium">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main Workspace ────────────────────────────────────────────────────────────
export function WorkspaceClient({ code, userRole, userName, salesPerson, allSalesPersons }: Props) {
  // Read ?tab= query param so links from the buyers list can deep-link to a tab
  const initialTab = ((): Tab => {
    if (typeof window === "undefined") return "overview"
    const t = new URLSearchParams(window.location.search).get("tab")
    if (t === "tasks" || t === "activity" || t === "alerts" || t === "history" || t === "ownership" || t === "overview" || t === "meetings") return t as Tab
    return "overview"
  })()

  const [data,       setData]       = useState<WorkspaceResponse | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState("")
  const [tab,        setTab]        = useState<Tab>(initialTab)
  const [piPage,     setPiPage]     = useState(1)
  const [activities, setActivities] = useState<LeadActivity[]>([])
  const [actLoading, setActLoading] = useState(true)
  const [toast,      setToast]      = useState("")
  const [showSegmentEdit, setShowSegmentEdit] = useState(false)

  const isManager = userRole === "MANAGER" || userRole === "DIRECTOR"
  const effectiveSP = salesPerson ?? userName ?? ""

  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await fetch(`/api/buyers/${encodeURIComponent(code)}`)
      if (!res.ok) throw new Error("Not found")
      setData(await res.json())
    } catch { setError("Could not load buyer data.") }
    finally { setLoading(false) }
  }, [code])

  const fetchActivities = useCallback(async () => {
    setActLoading(true)
    try {
      const res = await fetch(`/api/activities?buyerCode=${encodeURIComponent(code)}&limit=50`)
      const d = await res.json()
      setActivities(d.activities ?? [])
    } finally { setActLoading(false) }
  }, [code])

  useEffect(() => { fetchWorkspace(); fetchActivities() }, [fetchWorkspace, fetchActivities])

  if (loading) return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
      ))}
    </div>
  )
  if (error || !data) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-600 text-sm">
      {error || "Buyer not found."}
    </div>
  )

  const { buyer, piHistory, weeklyBars, meetingCompliance } = data

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "overview",  label: "Overview" },
    { key: "activity",  label: "Activity",  count: activities.length },
    { key: "tasks",     label: "Tasks" },
    { key: "alerts",    label: "Alerts" },
    { key: "history",   label: "PIs",        count: piHistory.length },
    { key: "ownership", label: "Ownership" },
    { key: "meetings",  label: "Meetings 🤝" },
  ]

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast} onClose={() => setToast("")} />}

      {/* ── Buyer Header ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {buyer.isKeyAccount && (
                <span className="bg-violet-100 text-violet-700 text-xs font-semibold px-2 py-0.5 rounded">★ Key Account</span>
              )}
              <TierBadge tier={buyer.tier} />
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${segmentBg(buyer.segment)}`}>
                {segmentLabel(buyer.segment)}
              </span>
              {isManager && (
                <button
                  onClick={() => setShowSegmentEdit(true)}
                  title="Change segment"
                  className="text-xs text-gray-400 hover:text-green-700 hover:bg-green-50 px-1.5 py-0.5 rounded transition-colors"
                >
                  ✏️ Edit
                </button>
              )}
              <StatusBadge status={buyer.status} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mt-2 leading-tight">{buyer.canonicalBuyerName}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {buyer.country}
              {buyer.buyerCode && <span className="ml-2 font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{buyer.buyerCode}</span>}
            </p>
            <p className="text-xs text-gray-400 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>Owner: <a href={`/sales-persons/${encodeURIComponent(buyer.primaryOwner || "")}`} className="font-bold text-gray-700 hover:text-green-700 hover:underline">{buyer.primaryOwner || "–"}</a></span>
              {buyer.backupOwner && <span>Backup: <a href={`/sales-persons/${encodeURIComponent(buyer.backupOwner)}`} className="font-bold text-gray-600 hover:text-green-700 hover:underline">{buyer.backupOwner}</a></span>}
              <span>Coordinator: <span className="font-bold text-teal-600">{buyer.salesCoordinator || "–"}</span></span>
              {buyer.isDreamMarket && (
                <span className="inline-flex items-center gap-1 text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                  🌟 Dream Market
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="relative w-16 h-16">
              <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
                <circle
                  cx="18" cy="18" r="14" fill="none"
                  stroke={buyer.healthScore.total >= 80 ? "#10b981" : buyer.healthScore.total >= 60 ? "#14b8a6" : buyer.healthScore.total >= 40 ? "#f59e0b" : buyer.healthScore.total >= 20 ? "#ef4444" : "#9ca3af"}
                  strokeWidth="2.5"
                  strokeDasharray={`${(buyer.healthScore.total / 100) * 87.96} 87.96`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-gray-800">
                {buyer.healthScore.total}
              </span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${healthBg(buyer.healthScore.label)}`}>
              {buyer.healthScore.label.replace("_", " ")}
            </span>
          </div>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="FY Target"  value={formatNumber(buyer.target, 0)}        sub="containers"  color="bg-gray-50 border-gray-200" />
        <SummaryCard label="Actual"     value={formatNumber(buyer.actual, 0)}        sub="containers"  color="bg-green-50 border-green-200" />
        <SummaryCard label="Prev Year"  value={formatNumber(buyer.prevYearActual, 0)} sub="FY25 actual" color="bg-blue-50 border-blue-200" />
        <SummaryCard label="Gap vs Due" value={`${buyer.gap >= 0 ? "+" : ""}${formatNumber(buyer.gap, 0)}`}
                     sub={buyer.gap >= 0 ? "ahead of pace" : "behind pace"}
                     color={buyer.gap >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"} />
      </div>

      <div className={`grid gap-3 ${meetingCompliance.monthlyTarget > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        <SummaryCard label="Order Count" value={buyer.orderCount}           sub="this FY"   color="bg-white border-gray-200" />
        <SummaryCard label="Achievement" value={`${buyer.achievementPct}%`} sub="of annual" color="bg-white border-gray-200" />
        <SummaryCard label="Last Order"  value={buyer.weeksSinceLastOrder < 99 ? `${buyer.weeksSinceLastOrder}w ago` : "–"}
                     sub={buyer.lastOrderDate ? new Date(buyer.lastOrderDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "no orders"}
                     color="bg-white border-gray-200" />
        {meetingCompliance.monthlyTarget > 0 && <MeetingComplianceCard compliance={meetingCompliance} />}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 sm:px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t.key
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}{t.count !== undefined && ` (${t.count})`}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Container Activity · Last {weeklyBars.length} Weeks</h3>
            {weeklyBars.some((b) => b.containers > 0) ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={weeklyBars} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(val: unknown) => [`${Number(val)} ctrs`, "Containers"]} />
                  <Bar dataKey="containers" radius={[3, 3, 0, 0]}>
                    {weeklyBars.map((entry) => (
                      <Cell key={entry.fyWeek} fill={entry.containers > 0 ? "#16a34a" : "#e5e7eb"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No orders in this period</div>
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Health Score Breakdown
              <span className={`ml-2 text-xs px-2 py-0.5 rounded font-medium ${healthBg(buyer.healthScore.label)}`}>
                {buyer.healthScore.total} / 100
              </span>
            </h3>
            <HealthBreakdown score={buyer.healthScore} />
            <p className="text-xs text-gray-400 mt-3">* Engagement is a placeholder until lead activity data is mature.</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Annual Target Progress</h3>
              <span className="text-sm font-bold text-gray-900">{buyer.achievementPct}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${buyer.achievementPct >= 100 ? "bg-green-500" : buyer.achievementPct >= 70 ? "bg-teal-400" : buyer.achievementPct >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                   style={{ width: `${Math.min(100, buyer.achievementPct)}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0</span>
              <span>Target: {formatNumber(buyer.target, 0)} · Due: {formatNumber(buyer.targetDue, 0)} · Actual: {formatNumber(buyer.actual, 0)}</span>
              <span>{formatNumber(buyer.target, 0)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Activity tab ── */}
      {tab === "activity" && (
        <ActivityList activities={activities} loading={actLoading} />
      )}

      {/* ── Tasks tab ── */}
      {tab === "tasks" && (
        <TasksTab
          buyer={buyer}
          isManager={isManager}
          salesPersons={allSalesPersons}
          defaultAssignee={effectiveSP}
        />
      )}

      {/* ── Alerts tab ── */}
      {tab === "alerts" && (
        <AlertsTab buyer={buyer} salesPerson={effectiveSP} />
      )}

      {/* ── History tab ── */}
      {tab === "history" && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="hidden md:block">
            <PITable records={piHistory} page={piPage} onPage={setPiPage} />
          </div>
          <div className="md:hidden">
            <div className="divide-y divide-gray-100">
              {piHistory.slice((piPage - 1) * 10, piPage * 10).map((r) => (
                <div key={`${r.piNumber}-m`} className="p-4 space-y-1.5">
                  <div className="flex justify-between items-start">
                    <p className="font-mono text-xs text-gray-600">{r.piNumber}</p>
                    <p className="font-bold text-gray-900 text-sm">{r.totalContainers} ctrs</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="text-gray-400">{formatDate(r.piDate)}</span>
                    <span className={`px-2 py-0.5 rounded-full font-medium ${r.varieties === "BASMATI" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{r.varieties}</span>
                    <span className="text-gray-400">W{r.fyWeekNo}</span>
                    <span className="text-gray-400">{r.financialYear}</span>
                  </div>
                  {r.brand && (
                    <div className="flex items-center gap-1.5">
                      <BrandPill brand={r.brand} />
                      <p className="text-xs text-gray-400">{r.brand}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {piHistory.length > 10 && (
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-100">
                <button onClick={() => setPiPage(piPage - 1)} disabled={piPage === 1} className="text-xs font-semibold disabled:opacity-30">Prev</button>
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Page {piPage} / {Math.ceil(piHistory.length / 10)}</span>
                <button onClick={() => setPiPage(piPage + 1)} disabled={piPage >= Math.ceil(piHistory.length / 10)} className="text-xs font-semibold disabled:opacity-30">Next</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Ownership tab ── */}
      {tab === "ownership" && (
        <OwnershipTab buyer={buyer} isManager={isManager} salesPersons={allSalesPersons} />
      )}

      {/* ── Meetings tab ── */}
      {tab === "meetings" && <BuyerMeetingsTab buyerName={buyer.canonicalBuyerName} buyerCountry={buyer.country} />}

      {/* ── Segment edit modal (manager+ only) ── */}
      {showSegmentEdit && (
        <SegmentEditModal
          buyer={buyer}
          onClose={() => setShowSegmentEdit(false)}
          onSaved={() => { fetchWorkspace(); setToast("Segment updated") }}
        />
      )}
    </div>
  )
}

// ── Buyer Meetings Tab ────────────────────────────────────────────────────────

interface MeetingHistEntry {
  id: string
  meetingDate: string
  completedBy: string
  outcome: string
  notes: string
  createdAt: string
}

interface BuyerMeetingRecord {
  id: string
  buyerName: string
  country: string
  tier: string
  nextDueDate: string
  lastMeetingDate: string | null
  daysRemaining: number
  displayStatus: string
  target: number
  actual: number
  achievementPct: number
  responsiblePerson: string
  salesCoordinator: string
  history: MeetingHistEntry[]
}

const OUTCOME_LABEL: Record<string, string> = {
  ORDER_CONFIRMED: "Order Confirmed",
  NEGOTIATING:     "Negotiating",
  AWAITING_PI:     "Awaiting PI",
  FOLLOW_UP:       "Follow-up",
  NO_INTEREST:     "No Interest",
  OTHER:           "Other",
}
const OUTCOME_COLOR: Record<string, string> = {
  ORDER_CONFIRMED: "bg-green-100 text-green-800",
  NEGOTIATING:     "bg-blue-100 text-blue-800",
  AWAITING_PI:     "bg-purple-100 text-purple-700",
  FOLLOW_UP:       "bg-amber-100 text-amber-800",
  NO_INTEREST:     "bg-red-100 text-red-700",
  OTHER:           "bg-gray-100 text-gray-600",
}

function BuyerMeetingsTab({ buyerName, buyerCountry }: { buyerName: string; buyerCountry: string }) {
  const [meeting, setMeeting] = useState<BuyerMeetingRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/8020/meetings")
      .then((r) => r.json())
      .then((data) => {
        const norm = (s: string) => s.toLowerCase().trim()
        const found = (data.meetings as BuyerMeetingRecord[]).find(
          (m) => norm(m.buyerName) === norm(buyerName)
        )
        setMeeting(found ?? null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [buyerName])

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading meeting data…</div>
  if (error)   return <div className="p-6 text-sm text-red-500">{error}</div>
  if (!meeting) return (
    <div className="p-6 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-500">
      No 80/20 meeting schedule found for this buyer. Only Tier 1, 2, 3 buyers are tracked.
    </div>
  )

  const statusColor =
    meeting.displayStatus === "OVERDUE"  ? "bg-red-100 text-red-700 border-red-200" :
    meeting.displayStatus === "DUE_SOON" ? "bg-amber-100 text-amber-700 border-amber-200" :
    "bg-green-100 text-green-700 border-green-200"

  return (
    <div className="space-y-4">
      {/* Schedule card */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Meeting Schedule</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold px-2 py-1 rounded-full border ${statusColor}`}>
                {meeting.displayStatus === "OVERDUE"
                  ? `⚠ OVERDUE by ${Math.abs(meeting.daysRemaining)} days`
                  : meeting.displayStatus === "DUE_SOON"
                  ? `⏰ Due in ${meeting.daysRemaining} days`
                  : `✓ On track — due in ${meeting.daysRemaining} days`}
              </span>
              <span className="text-xs text-gray-400">Tier {meeting.tier.replace("TIER","")}</span>
            </div>
          </div>
          <a
            href={`/8020/done/${encodeURIComponent(meeting.id)}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors"
          >
            ✓ Mark Meeting Done
          </a>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Next Due</p>
            <p className="text-sm font-bold text-gray-800 mt-0.5">
              {new Date(meeting.nextDueDate).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Last Meeting</p>
            <p className="text-sm font-bold text-gray-800 mt-0.5">
              {meeting.lastMeetingDate
                ? new Date(meeting.lastMeetingDate).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })
                : "None recorded"}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Target</p>
            <p className="text-sm font-bold text-gray-800 mt-0.5">{meeting.target} containers</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Achievement</p>
            <p className={`text-sm font-bold mt-0.5 ${meeting.achievementPct >= 80 ? "text-green-700" : meeting.achievementPct >= 50 ? "text-amber-600" : "text-red-600"}`}>
              {meeting.actual} / {meeting.target} ({meeting.achievementPct}%)
            </p>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Meeting History ({meeting.history.length})</p>
        </div>
        {meeting.history.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">No meetings recorded yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {meeting.history.map((h) => (
              <div key={h.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-shrink-0 w-16 text-center">
                  <p className="text-xs font-semibold text-gray-700">
                    {new Date(h.meetingDate).toLocaleDateString("en-IN", { day:"numeric", month:"short" })}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(h.meetingDate).getFullYear()}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${OUTCOME_COLOR[h.outcome] ?? "bg-gray-100 text-gray-600"}`}>
                      {OUTCOME_LABEL[h.outcome] ?? h.outcome}
                    </span>
                    <span className="text-[10px] text-gray-400">by {h.completedBy}</span>
                  </div>
                  {h.notes && <p className="text-xs text-gray-600 mt-1">{h.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
