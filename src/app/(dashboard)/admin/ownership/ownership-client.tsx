"use client"

import { useState, useEffect, useCallback } from "react"
import { formatNumber } from "@/lib/utils"
import { TierBadge } from "@/components/ui/status-badge"
import type { ResolvedBuyer, OwnershipRecord, UserRole } from "@/types"

interface BuyersResponse {
  buyers: ResolvedBuyer[]
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean }
  filterOptions: { countries: string[]; salesPersons: string[]; segments: string[] }
}

interface Props { userRole?: UserRole; allSalesPersons: string[] }

// ── Reassignment form ─────────────────────────────────────────────────────────
function ReassignForm({
  buyer, salesPersons, onClose, onSaved,
}: {
  buyer: ResolvedBuyer
  salesPersons: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [toOwner, setToOwner] = useState(buyer.backupOwner || "")
  const [reason,  setReason]  = useState("")
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState("")

  const submit = async () => {
    if (!toOwner) { setError("New owner required"); return }
    if (toOwner === buyer.primaryOwner) { setError("Already the primary owner"); return }
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
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">Reassign Owner</h3>
        <p className="text-sm text-gray-500 mt-1">{buyer.canonicalBuyerName} · {buyer.country}</p>
        <div className="mt-4 space-y-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1">
            <p>Current primary: <strong className="text-gray-800">{buyer.primaryOwner || "–"}</strong></p>
            <p>Current backup:  <strong className="text-gray-800">{buyer.backupOwner || "–"}</strong></p>
            <p className="text-xs text-gray-500 mt-2">
              FY actuals: <strong>{formatNumber(buyer.actual, 0)}</strong> ctrs ·
              Remaining target: <strong>{formatNumber(Math.max(0, buyer.target - buyer.actual), 0)}</strong> ctrs
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">New Primary Owner *</label>
            <select
              value={toOwner}
              onChange={(e) => setToOwner(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              <option value="">Select sales person…</option>
              {salesPersons.filter((s) => s !== buyer.primaryOwner).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Reason for reassignment</label>
            <textarea
              rows={3} value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
              placeholder="Workload balance, country split, performance, …"
            />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800">
            ⚠️ Historical PI attribution stays with <strong>{buyer.primaryOwner || "previous owner"}</strong>.
            Only the remaining target moves to {toOwner || "new owner"}.
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >Cancel</button>
            <button
              onClick={submit} disabled={saving || !toOwner}
              className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Reassign"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── History modal ─────────────────────────────────────────────────────────────
function HistoryModal({
  buyer, onClose,
}: { buyer: ResolvedBuyer; onClose: () => void }) {
  const [records, setRecords] = useState<OwnershipRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/ownership?canonicalBuyerCode=${encodeURIComponent(buyer.canonicalBuyerCode)}`)
      .then((r) => r.json())
      .then((d) => setRecords(d.records ?? []))
      .finally(() => setLoading(false))
  }, [buyer.canonicalBuyerCode])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">Ownership History</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <p className="text-sm text-gray-500 mt-1">{buyer.canonicalBuyerName}</p>

        {loading ? (
          <div className="mt-4 h-20 bg-gray-100 rounded animate-pulse" />
        ) : records.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400 text-center py-6">No reassignment history.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {records.map((r) => (
              <div key={r.id} className="border border-gray-200 rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">
                    {r.fromOwner} → {r.toOwner}
                  </span>
                  <span className="text-xs text-gray-400">{r.effectiveDate}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">By {r.transferredBy}</p>
                {r.reason && <p className="text-xs text-gray-600 mt-1">"{r.reason}"</p>}
                <div className="flex gap-3 mt-2 text-xs text-gray-500">
                  <span>Historical: {r.historicalActual} ctrs</span>
                  <span>Inherited target: {r.inheritedTarget} ctrs</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function OwnershipAdminClient({ userRole, allSalesPersons }: Props) {
  const [data,    setData]    = useState<BuyersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")
  const [country, setCountry] = useState("")
  const [page,    setPage]    = useState(1)
  const [reassignBuyer, setReassignBuyer] = useState<ResolvedBuyer | null>(null)
  const [historyBuyer,  setHistoryBuyer]  = useState<ResolvedBuyer | null>(null)

  const isManager = userRole === "MANAGER" || userRole === "DIRECTOR"

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search)  params.set("search",  search)
    if (country) params.set("country", country)
    params.set("page",  String(page))
    params.set("limit", "10")
    try {
      const res = await fetch(`/api/buyers?${params}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [search, country, page])

  useEffect(() => { fetchData() }, [fetchData])

  if (!isManager) return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800 text-sm">
      Only managers and directors can access ownership reassignment.
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <input
          type="text" placeholder="Search buyer name / code…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="flex-1 min-w-[200px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <select
          value={country}
          onChange={(e) => { setCountry(e.target.value); setPage(1) }}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          <option value="">All countries</option>
          {(data?.filterOptions.countries ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
          {loading ? "Loading…" : `${data?.pagination.total ?? 0} buyers`}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["Buyer","Country","Tier","Primary Owner","Backup","Target","Actual","Actions"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data?.buyers ?? []).map((b) => (
                <tr key={b.canonicalBuyerCode} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 max-w-[220px]">
                    <p className="font-medium text-gray-800 truncate">
                      {b.isKeyAccount && <span className="text-violet-500 mr-1">★</span>}
                      {b.canonicalBuyerName}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">{b.buyerCode}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">{b.country}</td>
                  <td className="px-3 py-2.5"><TierBadge tier={b.tier} /></td>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-gray-800">{b.primaryOwner || "–"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{b.backupOwner || <span className="text-gray-300">–</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{formatNumber(b.target, 0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{formatNumber(b.actual, 0)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setReassignBuyer(b)}
                        className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                      >Reassign</button>
                      <button
                        onClick={() => setHistoryBuyer(b)}
                        className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded hover:bg-gray-50"
                      >History</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-100">
          {(data?.buyers ?? []).map((b) => (
            <div key={b.canonicalBuyerCode} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{b.canonicalBuyerName}</p>
                  <p className="text-xs text-gray-400">{b.country} · {b.buyerCode}</p>
                </div>
                <TierBadge tier={b.tier} />
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                <p>Primary: <strong className="text-gray-800">{b.primaryOwner || "–"}</strong></p>
                <p>Backup: <strong className="text-gray-700">{b.backupOwner || "–"}</strong></p>
                <p>Target/Actual: <strong>{formatNumber(b.target, 0)} / {formatNumber(b.actual, 0)}</strong></p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setReassignBuyer(b)}
                  className="flex-1 text-xs px-2 py-1.5 bg-green-600 text-white rounded font-semibold"
                >Reassign</button>
                <button
                  onClick={() => setHistoryBuyer(b)}
                  className="flex-1 text-xs px-2 py-1.5 border border-gray-200 text-gray-600 rounded"
                >History</button>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <button
              onClick={() => setPage(page - 1)}
              disabled={!data.pagination.hasPrev || loading}
              className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
            >← Prev</button>
            <span className="text-xs text-gray-500">Page {page} of {data.pagination.totalPages}</span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={!data.pagination.hasNext || loading}
              className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
            >Next →</button>
          </div>
        )}
      </div>

      {/* Modals */}
      {reassignBuyer && (
        <ReassignForm
          buyer={reassignBuyer}
          salesPersons={allSalesPersons.length > 0 ? allSalesPersons : (data?.filterOptions.salesPersons ?? [])}
          onClose={() => setReassignBuyer(null)}
          onSaved={fetchData}
        />
      )}
      {historyBuyer && (
        <HistoryModal buyer={historyBuyer} onClose={() => setHistoryBuyer(null)} />
      )}
    </div>
  )
}
