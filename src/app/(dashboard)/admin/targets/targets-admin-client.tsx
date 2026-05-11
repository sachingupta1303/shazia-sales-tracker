"use client"

import { useState, useEffect, useCallback } from "react"
import { AchievementBar, StatusBadge } from "@/components/ui/status-badge"
import { formatNumber } from "@/lib/utils"
import type { UserRole, TargetAudit, PerformanceStatus } from "@/types"

interface TargetRow {
  buyerName:      string
  country:        string
  salesPerson:    string
  financialYear:  string
  target:         number
  actual:         number
  targetDue:      number
  gap:            number
  achievementPct: number
  previousYear:   number
  targetType:     string
}

interface TargetsResponse {
  rows: TargetRow[]
  summary: { totalBuyers: number; totalTarget: number; totalActual: number }
  filterOptions: { salesPersons: string[]; countries: string[] }
  meta: { currentFY: string; currentWeek: number }
}

interface Props { userRole?: UserRole }

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditTargetModal({
  row, onClose, onSaved,
}: { row: TargetRow; onClose: () => void; onSaved: () => void }) {
  const [newTarget, setNewTarget] = useState(row.target)
  const [reason,    setReason]    = useState("")
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState("")

  const submit = async () => {
    if (!reason) { setErr("Reason is required for the audit log"); return }
    if (newTarget === row.target) { setErr("New target must differ"); return }
    setSaving(true); setErr("")
    try {
      const res = await fetch("/api/admin/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: row.buyerName,
          financialYear: row.financialYear,
          newTarget,
          reason,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? "Update failed"); return }
      onSaved(); onClose()
    } catch { setErr("Update failed") }
    finally { setSaving(false) }
  }

  const delta = newTarget - row.target

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">Edit Target</h3>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
          <p className="font-semibold text-gray-800">{row.buyerName}</p>
          <p className="text-xs text-gray-500 mt-0.5">{row.country} · {row.salesPerson} · FY {row.financialYear}</p>
          <p className="text-xs text-gray-500 mt-1">
            Current target: <strong>{row.target}</strong> · Actual: <strong>{row.actual}</strong> · Achievement: <strong>{row.achievementPct}%</strong>
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">New target containers *</label>
          <input
            type="number" min={0} value={newTarget}
            onChange={(e) => setNewTarget(Number(e.target.value))}
            className="w-full text-base border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          {delta !== 0 && (
            <p className={`text-xs mt-1 font-semibold ${delta > 0 ? "text-green-600" : "text-red-600"}`}>
              {delta > 0 ? "↑" : "↓"} {delta > 0 ? "+" : ""}{delta} containers
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Reason for change *</label>
          <textarea
            rows={2} value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
            placeholder="Quarterly recalibration, mid-year adjustment, segment upgrade…"
          />
        </div>
        <p className="text-xs text-gray-400">
          Audit log entry will be created with your name, timestamp, old + new values, and this reason.
        </p>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
            {saving ? "Saving…" : "Update Target"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Audit modal ───────────────────────────────────────────────────────────────
function AuditModal({ buyerName, onClose }: { buyerName: string; onClose: () => void }) {
  const [records, setRecords] = useState<TargetAudit[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/admin/targets?audit=1&buyer=${encodeURIComponent(buyerName)}`)
      .then((r) => r.json()).then((d) => setRecords(d.audit ?? []))
      .finally(() => setLoading(false))
  }, [buyerName])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">Target Audit</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <p className="text-sm text-gray-500 mt-1">{buyerName}</p>

        {loading ? (
          <div className="mt-4 h-20 bg-gray-100 rounded animate-pulse" />
        ) : records.length === 0 ? (
          <p className="mt-6 text-sm text-gray-400 text-center py-6">No edit history.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {records.map((r) => {
              const delta = r.newTarget - r.oldTarget
              return (
                <div key={r.id} className="border border-gray-200 rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-800">
                      {r.oldTarget} → {r.newTarget} ctrs
                      <span className={`ml-2 text-xs font-bold ${delta > 0 ? "text-green-600" : "text-red-600"}`}>
                        ({delta > 0 ? "+" : ""}{delta})
                      </span>
                    </span>
                    <span className="text-xs text-gray-400">{r.financialYear}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">By {r.changedBy} · {new Date(r.changedAt).toLocaleString("en-GB")}</p>
                  {r.reason && <p className="text-xs text-gray-700 mt-1 italic">"{r.reason}"</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
function statusForRow(r: TargetRow): PerformanceStatus {
  if (r.target === 0) return "NO_TARGET"
  if (r.actual === 0) return "MISSED"
  if (r.actual >= r.targetDue) return "ACHIEVED"
  return "MISSED"
}

export function TargetsAdminClient({ userRole }: Props) {
  const [data,    setData]    = useState<TargetsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")
  const [sp,      setSp]      = useState("")
  const [editRow,  setEditRow]  = useState<TargetRow | null>(null)
  const [auditFor, setAuditFor] = useState<string | null>(null)

  const isManager = userRole === "MANAGER" || userRole === "DIRECTOR"

  const refresh = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (sp) params.set("salesPerson", sp)
    try {
      const res = await fetch(`/api/admin/targets?${params}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch { /* */ }
    finally { setLoading(false) }
  }, [sp])

  useEffect(() => { refresh() }, [refresh])

  if (!isManager) return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800 text-sm">
      Only managers and directors can edit targets.
    </div>
  )

  if (loading) return (
    <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
    ))}</div>
  )

  const filtered = (data?.rows ?? []).filter(
    (r) => !search || r.buyerName.toLowerCase().includes(search.toLowerCase()) || r.country.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {/* Summary */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-xs text-gray-500 uppercase">Buyers</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.summary.totalBuyers}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-xs text-blue-600 uppercase">Total Target</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{formatNumber(data.summary.totalTarget, 0)}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <p className="text-xs text-green-600 uppercase">Total Actual</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{formatNumber(data.summary.totalActual, 0)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text" placeholder="Search buyer / country…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <select
          value={sp} onChange={(e) => setSp(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
        >
          <option value="">All sales persons</option>
          {(data?.filterOptions.salesPersons ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
                {["Buyer","Country","SP","Target","Actual","Achievement","Type","Actions"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((r, i) => {
                const status = statusForRow(r)
                return (
                  <tr key={`${r.buyerName}-${r.financialYear}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2.5 max-w-[220px]">
                      <p className="font-medium text-gray-800 truncate">{r.buyerName}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{r.country}</td>
                    <td className="px-3 py-2.5 text-xs">{r.salesPerson}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{r.target}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{r.actual}</td>
                    <td className="px-3 py-2.5 min-w-[110px]"><AchievementBar pct={r.achievementPct} status={status} /></td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded ${r.targetType === "Manual" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                        {r.targetType || "–"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setEditRow(r)}
                          className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 font-semibold"
                        >Edit</button>
                        <button
                          onClick={() => setAuditFor(r.buyerName)}
                          className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded hover:bg-gray-50"
                        >History</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {filtered.length > 0 && (() => {
              const t = filtered.reduce(
                (acc, r) => ({
                  target: acc.target + r.target,
                  actual: acc.actual + r.actual,
                }), { target: 0, actual: 0 }
              )
              const overallPct = t.target > 0 ? Math.round((t.actual / t.target) * 100) : 0
              return (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 text-gray-800 uppercase text-xs tracking-wide" colSpan={3}>
                      Grand Total ({filtered.length} buyers)
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-800">{formatNumber(t.target, 0)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-900">{formatNumber(t.actual, 0)}</td>
                    <td className="px-3 py-3 text-center text-xs text-gray-700">{overallPct}%</td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3" />
                  </tr>
                </tfoot>
              )
            })()}
          </table>
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-gray-100">
          {filtered.map((r) => (
            <div key={`${r.buyerName}-m`} className="p-3 space-y-2">
              <div className="flex justify-between items-start">
                <p className="font-medium text-gray-800 text-sm">{r.buyerName}</p>
                <StatusBadge status={statusForRow(r)} />
              </div>
              <p className="text-xs text-gray-500">{r.country} · {r.salesPerson}</p>
              <div className="flex justify-between text-xs text-gray-500">
                <span>T: <strong>{r.target}</strong></span>
                <span>A: <strong>{r.actual}</strong></span>
                <span>{r.achievementPct}%</span>
              </div>
              <AchievementBar pct={r.achievementPct} status={statusForRow(r)} />
              <div className="flex gap-1.5">
                <button onClick={() => setEditRow(r)} className="flex-1 text-xs px-2 py-1.5 bg-green-600 text-white rounded font-semibold">Edit</button>
                <button onClick={() => setAuditFor(r.buyerName)} className="flex-1 text-xs px-2 py-1.5 border border-gray-200 text-gray-600 rounded">History</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editRow && <EditTargetModal row={editRow} onClose={() => setEditRow(null)} onSaved={refresh} />}
      {auditFor && <AuditModal buyerName={auditFor} onClose={() => setAuditFor(null)} />}
    </div>
  )
}
