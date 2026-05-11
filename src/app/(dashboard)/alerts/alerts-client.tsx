"use client"

import { useState, useEffect } from "react"
import type { Alert, TriggerType, AlertSeverity, UserRole } from "@/types"

interface AlertsResponse { alerts: Alert[]; unreadCount: number }

interface Props { userRole?: UserRole; salesPerson?: string }

const TYPE_LABELS: Record<TriggerType, string> = {
  BUYER_BEHIND_PACE:     "Behind Pace",
  BUYER_DORMANT:         "Dormant Buyer",
  COUNTRY_BEHIND:        "Country Behind",
  MILESTONE_ACHIEVED:    "Milestone ✓",
  KEY_BUYER_AGING:       "Key Buyer Aging",
  USER_REMARK:           "Remark",
  ACTION_PLAN:           "Action Plan",
  ACTION_OVERDUE:        "Action Overdue",
  WEEKLY_REVIEW_PENDING: "Review Pending",
  TASK_OVERDUE:          "Task Overdue",
  MEETING_GAP:           "Meeting Gap",
}

const SEV_STYLE: Record<AlertSeverity, string> = {
  HIGH:   "bg-red-100 text-red-800 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  LOW:    "bg-blue-100 text-blue-800 border-blue-200",
}

const TYPE_ICON: Record<TriggerType, string> = {
  BUYER_BEHIND_PACE:     "📉",
  BUYER_DORMANT:         "💤",
  COUNTRY_BEHIND:        "🌍",
  MILESTONE_ACHIEVED:    "🎯",
  KEY_BUYER_AGING:       "⏰",
  USER_REMARK:           "📝",
  ACTION_PLAN:           "📋",
  ACTION_OVERDUE:        "🚨",
  WEEKLY_REVIEW_PENDING: "📊",
  TASK_OVERDUE:          "⚠️",
  MEETING_GAP:           "📅",
}

function AlertCard({ alert }: { alert: Alert }) {
  const timeAgo = alert.createdAt
    ? new Date(alert.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    : ""

  return (
    <div className={`bg-white border rounded-xl p-4 space-y-2 ${alert.status === "OPEN" ? "border-l-4 border-l-amber-400" : "border-gray-200 opacity-75"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{TYPE_ICON[alert.triggerType]}</span>
          <div>
            <p className="text-sm font-semibold text-gray-800">{alert.title}</p>
            {alert.buyerName && (
              <p className="text-xs text-gray-500">{alert.buyerName}{alert.country ? ` · ${alert.country}` : ""}</p>
            )}
            {!alert.buyerName && alert.country && (
              <p className="text-xs text-gray-500">{alert.country}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${SEV_STYLE[alert.severity]}`}>
            {alert.severity}
          </span>
          <span className="text-xs text-gray-400">{timeAgo} · W{alert.fyWeek}</span>
        </div>
      </div>
      <p className="text-xs text-gray-600">{alert.message}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
          {TYPE_LABELS[alert.triggerType]}
        </span>
        {alert.salesPerson && (
          <span className="text-xs text-gray-400">Owner: {alert.salesPerson}</span>
        )}
        {alert.actionUrl && (
          <a
            href={alert.actionUrl}
            className="text-xs text-green-600 hover:text-green-700 font-medium ml-auto"
          >
            View →
          </a>
        )}
      </div>
    </div>
  )
}

export function AlertsClient({ userRole, salesPerson }: Props) {
  const [data,       setData]       = useState<AlertsResponse | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState("")
  const [typeFilter, setTypeFilter] = useState<TriggerType | "ALL">("ALL")
  const [severityF,  setSeverityF]  = useState<AlertSeverity | "ALL">("ALL")
  const [checking,   setChecking]   = useState(false)

  const fetchAlerts = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/alerts")
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch { setError("Failed to load alerts.") }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchAlerts() }, [])

  const runTriggers = async () => {
    setChecking(true)
    try {
      const res = await fetch("/api/triggers/check", { method: "POST" })
      if (!res.ok) throw new Error()
      await fetchAlerts()
    } catch { setError("Trigger check failed.") }
    finally { setChecking(false) }
  }

  const allTypes: (TriggerType | "ALL")[] = [
    "ALL", "BUYER_BEHIND_PACE", "BUYER_DORMANT", "COUNTRY_BEHIND",
    "KEY_BUYER_AGING", "MILESTONE_ACHIEVED", "USER_REMARK", "ACTION_PLAN",
    "ACTION_OVERDUE", "WEEKLY_REVIEW_PENDING", "TASK_OVERDUE", "MEETING_GAP",
  ]

  const filtered = (data?.alerts ?? []).filter((a) => {
    if (typeFilter !== "ALL" && a.triggerType !== typeFilter) return false
    if (severityF  !== "ALL" && a.severity    !== severityF)  return false
    return true
  })

  return (
    <div className="space-y-4">
      {/* Header action row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {data && (
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${data.unreadCount > 0 ? "bg-red-500" : "bg-green-500"}`} />
            <span className="text-sm text-gray-600">
              {data.unreadCount > 0 ? `${data.unreadCount} open alerts` : "All alerts reviewed"}
            </span>
          </div>
        )}
        {(userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "MANAGER" || userRole === "DIRECTOR") && (
          <button
            onClick={runTriggers}
            disabled={checking}
            className="px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {checking ? "Checking…" : "🔍 Run Trigger Check"}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1.5">
          {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSeverityF(s)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-all ${
                severityF === s
                  ? s === "HIGH" ? "bg-red-500 text-white border-red-500"
                  : s === "MEDIUM" ? "bg-amber-400 text-white border-amber-400"
                  : s === "LOW" ? "bg-blue-500 text-white border-blue-500"
                  : "bg-gray-800 text-white border-gray-800"
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="w-px bg-gray-200 self-stretch" />
        {allTypes.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-all ${
              typeFilter === t
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            {t === "ALL" ? "All Types" : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">{error}</div>}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-10 text-center">
          <p className="text-gray-400 text-sm">
            {data?.alerts.length === 0
              ? "No alerts yet. Run a trigger check to generate alerts based on current performance."
              : "No alerts match the current filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => <AlertCard key={a.id} alert={a} />)}
        </div>
      )}
    </div>
  )
}
