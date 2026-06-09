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
  { key: "buyers",   label: "Buyers · Tier · VIP", icon: "👥", ready: true  },
  { key: "meetings", label: "Meetings", icon: "🤝", ready: true  },
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
      {tab === "buyers"   && <BuyersTab />}
      {tab === "meetings" && <MeetingsTab />}
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

// ══════════════════════════════════════════════════════════════════════════════
// BUYERS TAB — Tier + Segment/VIP
// ══════════════════════════════════════════════════════════════════════════════
interface BuyerControlRow {
  buyerName: string; country: string; tier: string; annualTarget: number
  responsiblePerson: string; canonicalCode: string; segment: string; isKeyAccount: boolean
}

const TIER_STYLE: Record<string, string> = {
  TIER1: "bg-purple-50 text-purple-700 border-purple-200",
  TIER2: "bg-blue-50 text-blue-700 border-blue-200",
  TIER3: "bg-emerald-50 text-emerald-700 border-emerald-200",
  OTHERS:"bg-gray-50 text-gray-500 border-gray-200",
}
const TIER_CADENCE: Record<string, string> = {
  TIER1: "every 15 days", TIER2: "every 20 days", TIER3: "every 30 days", OTHERS: "no schedule",
}

function BuyersTab() {
  const [rows, setRows]       = useState<BuyerControlRow[]>([])
  const [tiers, setTiers]     = useState<string[]>([])
  const [segments, setSegs]   = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)
  const [search, setSearch]   = useState("")
  const [savingKey, setSaving]= useState<string | null>(null)
  const [toast, setToast]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch("/api/admin/buyer-control")
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      const data = await res.json()
      setRows(data.rows); setTiers(data.tiers); setSegs(data.segments)
    } catch (e: any) { setErr(e.message || "Failed to load") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const saveTier = async (row: BuyerControlRow, tier: string) => {
    const key = `${row.buyerName}-tier`
    setSaving(key)
    try {
      const res = await fetch("/api/admin/buyer-control", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tier", buyerName: row.buyerName, country: row.country, tier }),
      })
      if (!res.ok) { flash("⚠️ " + ((await res.json().catch(() => ({}))).error || "Tier save failed")); return }
      setRows((prev) => prev.map((r) => r.buyerName === row.buyerName && r.country === row.country ? { ...r, tier } : r))
      flash(`✅ ${row.buyerName}: tier → ${tier} (${TIER_CADENCE[tier]})`)
    } catch { flash("⚠️ Tier save failed") }
    finally { setSaving(null) }
  }

  const saveSegment = async (row: BuyerControlRow, segment: string, isKeyAccount: boolean) => {
    const key = `${row.buyerName}-seg`
    setSaving(key)
    try {
      const res = await fetch("/api/admin/buyer-control", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "segment", buyerName: row.buyerName, country: row.country,
          canonicalCode: row.canonicalCode || undefined, segment, isKeyAccount,
        }),
      })
      if (!res.ok) { flash("⚠️ " + ((await res.json().catch(() => ({}))).error || "Segment save failed")); return }
      const data = await res.json()
      setRows((prev) => prev.map((r) => r.buyerName === row.buyerName && r.country === row.country
        ? { ...r, segment, isKeyAccount, canonicalCode: r.canonicalCode || data.canonicalCode } : r))
      flash(`✅ ${row.buyerName}: segment → ${segment}`)
    } catch { flash("⚠️ Segment save failed") }
    finally { setSaving(null) }
  }

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
        <span className="text-xs text-gray-400">{filtered.length} buyers · tier change updates meeting cadence automatically</span>
      </div>

      {toast && <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 inline-block">{toast}</div>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900 text-white text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left">Buyer</th>
              <th className="px-3 py-2.5 text-left">Country</th>
              <th className="px-3 py-2.5 text-left">Owner</th>
              <th className="px-3 py-2.5 text-right">Target</th>
              <th className="px-3 py-2.5 text-left">Tier (cadence)</th>
              <th className="px-3 py-2.5 text-left">Segment</th>
              <th className="px-3 py-2.5 text-center">VIP / Key</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const tierSaving = savingKey === `${r.buyerName}-tier`
              const segSaving  = savingKey === `${r.buyerName}-seg`
              return (
                <tr key={`${r.buyerName}-${r.country}-${i}`} className={`border-b border-gray-100 ${i % 2 ? "bg-slate-50/50" : ""}`}>
                  <td className="px-3 py-2 font-semibold text-slate-900">{r.buyerName}</td>
                  <td className="px-3 py-2 text-gray-600">{r.country}</td>
                  <td className="px-3 py-2 text-gray-500">{r.responsiblePerson || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatNumber(r.annualTarget, 0)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={r.tier} disabled={tierSaving}
                        onChange={(e) => saveTier(r, e.target.value)}
                        className={`text-xs font-bold border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500 ${TIER_STYLE[r.tier] ?? TIER_STYLE.OTHERS}`}
                      >
                        {tiers.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span className="text-[10px] text-gray-400">{tierSaving ? "saving…" : TIER_CADENCE[r.tier]}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.segment} disabled={segSaving}
                      onChange={(e) => saveSegment(r, e.target.value, r.isKeyAccount)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      {segments.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      disabled={segSaving}
                      onClick={() => saveSegment(r, r.segment, !r.isKeyAccount)}
                      title="Toggle VIP / Key Account"
                      className={`text-base transition-transform hover:scale-110 ${r.isKeyAccount ? "" : "opacity-25 grayscale"}`}
                    >
                      ⭐
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MEETINGS TAB — reschedule + bulk date-shift
// ══════════════════════════════════════════════════════════════════════════════
interface MeetingRow {
  id: string; buyerName: string; country: string; tier: string
  responsiblePerson: string; lastMeetingDate: string | null
  nextDueDate: string; displayStatus: string; daysRemaining: number
}

const MEETING_STATUS_STYLE: Record<string, string> = {
  OVERDUE:  "bg-red-50 text-red-600 border-red-200",
  DUE_SOON: "bg-amber-50 text-amber-700 border-amber-200",
  UPCOMING: "bg-emerald-50 text-emerald-700 border-emerald-200",
}

function MeetingsTab() {
  const [rows, setRows]       = useState<MeetingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)
  const [search, setSearch]   = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [shiftDays, setShiftDays] = useState(7)
  const [busy, setBusy]       = useState(false)
  const [toast, setToast]     = useState<string | null>(null)
  const [rowDate, setRowDate] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch("/api/admin/meetings")
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      const data = await res.json()
      setRows(data.rows); setSelected(new Set())
    } catch (e: any) { setErr(e.message || "Failed to load") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  // Count meetings per due-date so same-date clusters are visible
  const dateCount: Record<string, number> = {}
  for (const r of rows) dateCount[r.nextDueDate] = (dateCount[r.nextDueDate] ?? 0) + 1

  const filtered = rows.filter((r) =>
    !search ||
    r.buyerName.toLowerCase().includes(search.toLowerCase()) ||
    r.country.toLowerCase().includes(search.toLowerCase()) ||
    r.nextDueDate.includes(search)
  )

  const toggle = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () =>
    setSelected((prev) => prev.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id)))
  const selectDate = (date: string) =>
    setSelected(new Set(rows.filter((r) => r.nextDueDate === date).map((r) => r.id)))

  const rescheduleOne = async (row: MeetingRow) => {
    const newDueDate = rowDate[row.id]
    if (!newDueDate) { flash("⚠️ Pick a date first"); return }
    setBusy(true)
    try {
      const res = await fetch("/api/admin/meetings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "single", meetingId: row.id, newDueDate }),
      })
      if (!res.ok) { flash("⚠️ " + ((await res.json().catch(() => ({}))).error || "Reschedule failed")); return }
      flash(`✅ ${row.buyerName} → ${newDueDate}`)
      await load()
    } catch { flash("⚠️ Reschedule failed") }
    finally { setBusy(false) }
  }

  const bulkShift = async () => {
    if (!selected.size) { flash("⚠️ Select meetings first"); return }
    if (!shiftDays)     { flash("⚠️ Shift days can't be 0"); return }
    setBusy(true)
    try {
      const res = await fetch("/api/admin/meetings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulkShift", meetingIds: [...selected], shiftDays }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { flash("⚠️ " + (data.error || "Bulk shift failed")); return }
      flash(`✅ Shifted ${data.shifted}/${data.total} meetings by ${shiftDays > 0 ? "+" : ""}${shiftDays} days`)
      await load()
    } catch { flash("⚠️ Bulk shift failed") }
    finally { setBusy(false) }
  }

  if (loading) return <Skeleton />
  if (err)     return <ErrBox msg={err} onRetry={load} />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search buyer / country / date (YYYY-MM-DD)…"
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-72 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <span className="text-xs text-gray-400">{filtered.length} meetings · sorted by due date</span>
      </div>

      {/* Bulk shift bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-slate-700">{selected.size} selected</span>
        <span className="text-gray-300">·</span>
        <label className="text-xs text-gray-600">Shift by</label>
        <input type="number" value={shiftDays} onChange={(e) => setShiftDays(parseInt(e.target.value) || 0)}
          className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500" />
        <span className="text-xs text-gray-500">days (Sundays skipped)</span>
        <div className="flex gap-1">
          {[-7, -3, -1, 1, 3, 7].map((d) => (
            <button key={d} onClick={() => setShiftDays(d)}
              className={`text-[11px] px-2 py-1 rounded-lg border ${shiftDays === d ? "bg-green-600 text-white border-green-600" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              {d > 0 ? `+${d}` : d}
            </button>
          ))}
        </div>
        <button onClick={bulkShift} disabled={busy || !selected.size}
          className="text-sm px-4 py-1.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-40 ml-auto">
          {busy ? "Working…" : `Shift ${selected.size} meeting${selected.size === 1 ? "" : "s"}`}
        </button>
      </div>

      {toast && <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 inline-block">{toast}</div>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900 text-white text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-center">
                <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2.5 text-left">Buyer</th>
              <th className="px-3 py-2.5 text-left">Country</th>
              <th className="px-3 py-2.5 text-center">Tier</th>
              <th className="px-3 py-2.5 text-left">Last Meeting</th>
              <th className="px-3 py-2.5 text-left">Next Due</th>
              <th className="px-3 py-2.5 text-center">Status</th>
              <th className="px-3 py-2.5 text-left">Reschedule to</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const cluster = dateCount[r.nextDueDate] > 1
              return (
                <tr key={r.id} className={`border-b border-gray-100 ${selected.has(r.id) ? "bg-green-50/60" : i % 2 ? "bg-slate-50/50" : ""}`}>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{r.buyerName}</td>
                  <td className="px-3 py-2 text-gray-600">{r.country}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TIER_STYLE[r.tier] ?? TIER_STYLE.OTHERS}`}>{r.tier}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{r.lastMeetingDate || "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="font-semibold text-slate-800">{r.nextDueDate || "—"}</span>
                    {cluster && (
                      <button onClick={() => selectDate(r.nextDueDate)}
                        title="Select all meetings on this date"
                        className="ml-1.5 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full hover:bg-amber-100">
                        {dateCount[r.nextDueDate]} on this day
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${MEETING_STATUS_STYLE[r.displayStatus] ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
                      {r.displayStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <input type="date" value={rowDate[r.id] ?? ""} disabled={busy}
                        onChange={(e) => setRowDate((p) => ({ ...p, [r.id]: e.target.value }))}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500" />
                      <button onClick={() => rescheduleOne(r)} disabled={busy || !rowDate[r.id]}
                        className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 font-semibold hover:bg-green-100 disabled:opacity-40">
                        Set
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
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
