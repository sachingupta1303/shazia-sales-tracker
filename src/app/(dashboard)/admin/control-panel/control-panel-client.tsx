"use client"

import { useState, useEffect, useCallback } from "react"
import { formatNumber } from "@/lib/utils"

// ── Types ───────────────────────────────────────────────────────────────────
interface BuyerTargetRow {
  buyerName: string; country: string; salesPerson: string; financialYear: string
  target: number; actual: number; targetDue: number; gap: number; achievementPct: number
}
interface CountryTargetRow {
  country: string; planned2026: number; buyerTargetSum: number; actual: number; hasPlanRow: boolean
}

type MainTab = "targets" | "buyers" | "meetings"
type TargetSub = "buyer" | "country"

// ── Tab definitions ───────────────────────────────────────────────────────────
const MAIN_TABS: { key: MainTab; label: string; icon: string; ready: boolean }[] = [
  { key: "targets",  label: "Targets",  icon: "🎯", ready: true  },
  { key: "buyers",   label: "Buyers · Tier · VIP", icon: "👥", ready: false },
  { key: "meetings", label: "Meetings", icon: "🤝", ready: false },
]

export function ControlPanelClient({ userRole }: { userRole: string }) {
  const [tab, setTab] = useState<MainTab>("targets")

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {MAIN_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <span className="mr-1.5">{t.icon}</span>{t.label}
            {!t.ready && <span className="ml-1.5 text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full align-middle">SOON</span>}
          </button>
        ))}
      </div>

      {tab === "targets"  && <TargetsTab />}
      {tab === "buyers"   && <ComingSoon what="Buyer tier & VIP/segment editing" />}
      {tab === "meetings" && <ComingSoon what="Per-buyer meeting reschedule & bulk date-shift" />}
    </div>
  )
}

function ComingSoon({ what }: { what: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
      🚧 <b>{what}</b> — agle update me aa raha hai. (Next phase)
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TARGETS TAB
// ══════════════════════════════════════════════════════════════════════════════
function TargetsTab() {
  const [sub, setSub] = useState<TargetSub>("buyer")
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([["buyer", "Buyer Targets"], ["country", "Country Targets"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSub(k as TargetSub)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              sub === k ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {sub === "buyer"   ? <BuyerTargets /> : <CountryTargets />}
    </div>
  )
}

// ── Buyer targets ─────────────────────────────────────────────────────────────
function BuyerTargets() {
  const [rows, setRows]       = useState<BuyerTargetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)
  const [search, setSearch]   = useState("")
  const [fy, setFy]           = useState("")
  const [editing, setEditing] = useState<BuyerTargetRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch("/api/admin/targets")
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      const data = await res.json()
      setRows(data.rows); setFy(data.meta?.currentFY ?? "")
    } catch (e: any) { setErr(e.message || "Failed to load") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = rows.filter((r) =>
    !search ||
    r.buyerName.toLowerCase().includes(search.toLowerCase()) ||
    r.country.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <Skeleton />
  if (err)     return <ErrBox msg={err} onRetry={load} />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search buyer / country…"
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <span className="text-xs text-gray-400">FY {fy} · {filtered.length} buyers</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900 text-white text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left">Buyer</th>
              <th className="px-3 py-2.5 text-left">Country</th>
              <th className="px-3 py-2.5 text-left">Sales Person</th>
              <th className="px-3 py-2.5 text-right">Target</th>
              <th className="px-3 py-2.5 text-right">Actual</th>
              <th className="px-3 py-2.5 text-right">Achieve</th>
              <th className="px-3 py-2.5 text-center">Edit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={`${r.buyerName}-${i}`} className={`border-b border-gray-100 ${i % 2 ? "bg-slate-50/50" : ""}`}>
                <td className="px-3 py-2 font-semibold text-slate-900">{r.buyerName}</td>
                <td className="px-3 py-2 text-gray-600">{r.country}</td>
                <td className="px-3 py-2 text-gray-500">{r.salesPerson}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">{formatNumber(r.target, 1)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatNumber(r.actual, 1)}</td>
                <td className="px-3 py-2 text-right">
                  <span className={`text-xs font-bold ${r.achievementPct >= 100 ? "text-green-600" : r.achievementPct >= 60 ? "text-amber-600" : "text-red-500"}`}>
                    {r.achievementPct}%
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => setEditing(r)} className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 font-semibold hover:bg-green-100 transition-colors">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditBuyerTargetModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function EditBuyerTargetModal({ row, onClose, onSaved }: { row: BuyerTargetRow; onClose: () => void; onSaved: () => void }) {
  const [value, setValue]   = useState(String(row.target))
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState("")

  const save = async () => {
    const num = parseFloat(value)
    if (isNaN(num) || num < 0) { setErr("Enter a valid target (>= 0)"); return }
    if (!reason.trim()) { setErr("Reason is required (audit log)"); return }
    setSaving(true); setErr("")
    try {
      const res = await fetch("/api/admin/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerName: row.buyerName, financialYear: row.financialYear, newTarget: num, reason: reason.trim() }),
      })
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Save failed"); return }
      onSaved()
    } catch { setErr("Save failed") }
    finally { setSaving(false) }
  }

  return (
    <Modal title={`Edit Target · ${row.buyerName}`} onClose={onClose}>
      <p className="text-xs text-gray-500">{row.country} · {row.salesPerson} · FY {row.financialYear}</p>
      <label className="block text-xs font-medium text-gray-600">Target Containers</label>
      <input type="number" value={value} onChange={(e) => setValue(e.target.value)}
        className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-green-500" />
      <label className="block text-xs font-medium text-gray-600">Reason (audit log) *</label>
      <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="Why is this changing?"
        className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-green-500" />
      {err && <p className="text-xs text-red-600">{err}</p>}
      <ModalActions onClose={onClose} onSave={save} saving={saving} />
    </Modal>
  )
}

// ── Country targets ─────────────────────────────────────────────────────────────
function CountryTargets() {
  const [rows, setRows]       = useState<CountryTargetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)
  const [search, setSearch]   = useState("")
  const [editing, setEditing] = useState<CountryTargetRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch("/api/admin/country-target")
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      const data = await res.json()
      setRows(data.rows)
    } catch (e: any) { setErr(e.message || "Failed to load") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = rows.filter((r) => !search || r.country.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <Skeleton />
  if (err)     return <ErrBox msg={err} onRetry={load} />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search country…"
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <span className="text-xs text-gray-400">{filtered.length} countries</span>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-[11px] text-blue-800">
        ℹ️ <b>Country Plan Target (2026)</b> set karta hai. Note: jis country ke buyer-level targets set hain, wahan views me <b>buyer targets ka sum</b> dikhta hai (neeche reference column). Plan target tab use hota hai jab buyer-level target na ho.
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900 text-white text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left">Country</th>
              <th className="px-3 py-2.5 text-right">Plan Target (2026)</th>
              <th className="px-3 py-2.5 text-right">Buyer Target Sum</th>
              <th className="px-3 py-2.5 text-right">Actual</th>
              <th className="px-3 py-2.5 text-center">Edit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.country} className={`border-b border-gray-100 ${i % 2 ? "bg-slate-50/50" : ""}`}>
                <td className="px-3 py-2 font-semibold text-slate-900">{r.country}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">{r.planned2026 > 0 ? formatNumber(r.planned2026, 1) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">{r.buyerTargetSum > 0 ? formatNumber(r.buyerTargetSum, 1) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatNumber(r.actual, 1)}</td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => setEditing(r)}
                    disabled={!r.hasPlanRow}
                    title={r.hasPlanRow ? "" : "No plan row in COUNTRY_TARGET sheet for this country"}
                    className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 font-semibold hover:bg-green-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditCountryTargetModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function EditCountryTargetModal({ row, onClose, onSaved }: { row: CountryTargetRow; onClose: () => void; onSaved: () => void }) {
  const [value, setValue]   = useState(String(row.planned2026))
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState("")

  const save = async () => {
    const num = parseFloat(value)
    if (isNaN(num) || num < 0) { setErr("Enter a valid target (>= 0)"); return }
    setSaving(true); setErr("")
    try {
      const res = await fetch("/api/admin/country-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: row.country, planned2026: num }),
      })
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Save failed"); return }
      onSaved()
    } catch { setErr("Save failed") }
    finally { setSaving(false) }
  }

  return (
    <Modal title={`Country Plan Target · ${row.country}`} onClose={onClose}>
      <label className="block text-xs font-medium text-gray-600">Plan Target Containers (2026)</label>
      <input type="number" value={value} onChange={(e) => setValue(e.target.value)}
        className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-green-500" />
      {err && <p className="text-xs text-red-600">{err}</p>}
      <ModalActions onClose={onClose} onSave={save} saving={saving} />
    </Modal>
  )
}

// ── Shared UI bits ──────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        {children}
      </div>
    </div>
  )
}
function ModalActions({ onClose, onSave, saving }: { onClose: () => void; onSave: () => void; saving: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button onClick={onClose} className="text-sm px-4 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
      <button onClick={onSave} disabled={saving}
        className="text-sm px-4 py-1.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50">
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  )
}
function Skeleton() {
  return <div className="space-y-2 animate-pulse">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}</div>
}
function ErrBox({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center justify-between">
      <span>⚠️ {msg}</span>
      <button onClick={onRetry} className="text-xs px-3 py-1 rounded-lg border border-red-300 hover:bg-red-100">Retry</button>
    </div>
  )
}
