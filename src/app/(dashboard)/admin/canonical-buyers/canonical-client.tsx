"use client"

import { useState, useEffect, useCallback } from "react"
import { segmentBg, segmentLabel, brandCategoryBg, brandCategoryLabel, ALL_BUYER_SEGMENTS } from "@/lib/utils"
import { invalidateBrandMap } from "@/components/ui/brand-pill"
import type { CanonicalBuyer, BuyerSegment, BrandCategory, UserRole } from "@/types"

interface CanonicalResponse {
  configured:    boolean
  message?:      string
  canonicalBuyers: CanonicalBuyer[]
  aliases:       AliasEntry[]
  unmatched:     AliasEntry[]
  mapped:        AliasEntry[]
  summary?: {
    totalCanonical: number
    totalAliases:   number
    mappedCount:    number
    unmatchedCount: number
  }
}

interface AliasEntry {
  aliasName:          string
  canonicalBuyerCode: string
  buyerCode:          string
  matchConfidence:    string
}

interface Props { userRole?: UserRole }

const SEGMENTS: BuyerSegment[] = ALL_BUYER_SEGMENTS

// ── Map Alias modal ───────────────────────────────────────────────────────────
function MapAliasModal({
  alias, canonicalBuyers, onClose, onSaved,
}: {
  alias: AliasEntry
  canonicalBuyers: CanonicalBuyer[]
  onClose: () => void
  onSaved: () => void
}) {
  const [code,   setCode]   = useState("")
  const [conf,   setConf]   = useState<"HIGH" | "MEDIUM">("HIGH")
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState("")

  const submit = async () => {
    if (!code) { setErr("Pick a canonical buyer"); return }
    setSaving(true); setErr("")
    try {
      const res = await fetch("/api/admin/canonical", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aliasName:          alias.aliasName,
          canonicalBuyerCode: code,
          matchConfidence:    conf,
        }),
      })
      if (!res.ok) throw new Error()
      onSaved(); onClose()
    } catch { setErr("Failed to save mapping") }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">Map Alias to Canonical</h3>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm">
          <p className="text-gray-500 text-xs">Alias from PI data:</p>
          <p className="font-mono text-gray-800 mt-0.5">{alias.aliasName}</p>
          {alias.buyerCode && <p className="text-xs text-gray-400 mt-1">buyer code: {alias.buyerCode}</p>}
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Canonical buyer *</label>
          <select
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            <option value="">Select canonical buyer…</option>
            {canonicalBuyers
              .sort((a, b) => a.canonicalBuyerName.localeCompare(b.canonicalBuyerName))
              .map((c) => (
                <option key={c.canonicalBuyerCode} value={c.canonicalBuyerCode}>
                  {c.canonicalBuyerName} ({c.country})
                </option>
              ))}
          </select>
        </div>
        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer">
            <input type="radio" name="conf" checked={conf === "HIGH"} onChange={() => setConf("HIGH")} className="mr-1.5" />
            <span className="text-sm">HIGH match</span>
          </label>
          <label className="flex-1 cursor-pointer">
            <input type="radio" name="conf" checked={conf === "MEDIUM"} onChange={() => setConf("MEDIUM")} className="mr-1.5" />
            <span className="text-sm">MEDIUM match</span>
          </label>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving || !code} className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save Mapping"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── New Canonical Buyer modal ─────────────────────────────────────────────────
function NewCanonicalModal({
  onClose, onSaved,
}: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<CanonicalBuyer>>({
    canonicalBuyerName: "",
    country:            "",
    segment:            "EXISTING",
    primaryOwner:       "",
    targetFY2026:       0,
    isKeyAccount:       false,
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState("")

  const submit = async () => {
    if (!form.canonicalBuyerName) { setErr("Buyer name required"); return }
    setSaving(true); setErr("")
    try {
      const res = await fetch("/api/admin/canonical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      onSaved(); onClose()
    } catch { setErr("Failed to create canonical buyer") }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">New Canonical Buyer</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Buyer name *</label>
            <input
              type="text" value={form.canonicalBuyerName ?? ""}
              onChange={(e) => setForm({ ...form, canonicalBuyerName: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-green-400"
              placeholder="e.g. ELEZZ COMPANY FOR IMPORT AND EXPORT"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Country</label>
            <input
              type="text" value={form.country ?? ""}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg p-2 uppercase"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">HRB code</label>
            <input
              type="text" value={form.buyerCode ?? ""}
              onChange={(e) => setForm({ ...form, buyerCode: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg p-2 font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Segment</label>
            <select
              value={form.segment ?? "EXISTING"}
              onChange={(e) => setForm({ ...form, segment: e.target.value as BuyerSegment })}
              className="w-full text-sm border border-gray-200 rounded-lg p-2"
            >
              {SEGMENTS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Target FY2026</label>
            <input
              type="number" value={form.targetFY2026 ?? 0} min={0}
              onChange={(e) => setForm({ ...form, targetFY2026: Number(e.target.value) })}
              className="w-full text-sm border border-gray-200 rounded-lg p-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Primary owner</label>
            <input
              type="text" value={form.primaryOwner ?? ""}
              onChange={(e) => setForm({ ...form, primaryOwner: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg p-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Backup owner</label>
            <input
              type="text" value={form.backupOwner ?? ""}
              onChange={(e) => setForm({ ...form, backupOwner: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg p-2"
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              type="checkbox" id="key" checked={form.isKeyAccount ?? false}
              onChange={(e) => setForm({ ...form, isKeyAccount: e.target.checked })}
            />
            <label htmlFor="key" className="text-sm text-gray-700">★ Key Account</label>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Notes</label>
            <textarea
              rows={2} value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none"
            />
          </div>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
            {saving ? "Saving…" : "Create Buyer"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Canonical Buyer (segment swap + key fields) ────────────────────────
function EditCanonicalModal({
  buyer, onClose, onSaved,
}: {
  buyer: CanonicalBuyer
  onClose: () => void
  onSaved: () => void
}) {
  const [segment, setSegment] = useState<BuyerSegment>(buyer.segment)
  const [isKey,   setIsKey]   = useState<boolean>(buyer.isKeyAccount)
  const [target,  setTarget]  = useState<number>(buyer.targetFY2026)
  const [primary, setPrimary] = useState(buyer.primaryOwner)
  const [backup,  setBackup]  = useState(buyer.backupOwner)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState("")

  const submit = async () => {
    setSaving(true); setErr("")
    try {
      const res = await fetch(`/api/admin/canonical/${encodeURIComponent(buyer.canonicalBuyerCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment,
          isKeyAccount: isKey,
          targetFY2026: target,
          primaryOwner: primary,
          backupOwner:  backup,
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
        <h3 className="text-lg font-bold text-gray-900">Edit Canonical Buyer</h3>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
          <p className="font-semibold text-gray-800">{buyer.canonicalBuyerName}</p>
          <p className="text-xs text-gray-500 mt-0.5">{buyer.country} · {buyer.canonicalBuyerCode}</p>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-2">Segment</label>
          <div className="grid grid-cols-2 gap-1.5">
            {SEGMENTS.map((s) => (
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Target FY2026</label>
            <input
              type="number" min={0} value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className="w-full text-sm border border-gray-200 rounded-lg p-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Primary Owner</label>
            <input
              type="text" value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg p-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Backup Owner</label>
            <input
              type="text" value={backup}
              onChange={(e) => setBackup(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg p-2"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isKey} onChange={(e) => setIsKey(e.target.checked)} />
              <span className="text-sm text-gray-700">★ Key Account</span>
            </label>
          </div>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Brands tab ────────────────────────────────────────────────────────────────
interface BrandRow {
  brand:    string
  category: BrandCategory
  mapped:   boolean
}
interface BrandsResponse {
  configured: boolean
  list:       BrandRow[]
  summary:    { total: number; mapped: number; ourBrand: number; privateBrand: number; unclassified: number }
}

function BrandsTab() {
  const [data,    setData]    = useState<BrandsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")
  const [filter,  setFilter]  = useState<BrandCategory | "ALL" | "UNMAPPED">("ALL")
  const [busy,    setBusy]    = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/brands")
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const setCategory = async (brand: string, category: BrandCategory) => {
    setBusy(brand)
    try {
      const res = await fetch("/api/admin/brands", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, category }),
      })
      if (res.ok) {
        invalidateBrandMap()
        await load()
      }
    } finally { setBusy(null) }
  }

  if (loading) return (
    <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
    ))}</div>
  )
  if (!data) return null

  const filtered = data.list.filter((b) => {
    if (search && !b.brand.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === "ALL") return true
    if (filter === "UNMAPPED") return !b.mapped
    return b.category === filter
  })

  return (
    <div className="space-y-3">
      {!data.configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          ⚠️ Canonical map sheet not configured — categorisation changes won't persist. Set CANONICAL_BUYER_MAP_SHEET_ID first.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-white border border-gray-200 rounded-lg p-2.5 text-center">
          <p className="text-xs text-gray-500">Total brands</p>
          <p className="text-xl font-bold text-gray-900">{data.summary.total}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-center">
          <p className="text-xs text-green-600">OUR BRAND</p>
          <p className="text-xl font-bold text-green-700">{data.summary.ourBrand}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5 text-center">
          <p className="text-xs text-purple-600">PRIVATE BRAND</p>
          <p className="text-xl font-bold text-purple-700">{data.summary.privateBrand}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-center">
          <p className="text-xs text-gray-500">Unclassified</p>
          <p className="text-xl font-bold text-gray-700">{data.summary.unclassified}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text" placeholder="Search brand…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] text-sm border border-gray-200 rounded-lg px-3 py-1.5"
        />
        <div className="flex gap-1.5">
          {(["ALL", "OUR_BRAND", "PRIVATE_BRAND", "UNCLASSIFIED", "UNMAPPED"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-2.5 py-1.5 rounded-full border font-medium transition-all ${
                filter === f
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {f === "ALL" ? "All" : f === "UNMAPPED" ? "Unmapped" : f.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Brand list */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No brands match the filter.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.slice(0, 200).map((b) => (
              <div key={b.brand} className="p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${brandCategoryBg(b.category)} flex-shrink-0`}>
                    {brandCategoryLabel(b.category)}
                  </span>
                  <p className="text-sm text-gray-800 truncate">{b.brand}</p>
                  {!b.mapped && <span className="text-[10px] text-gray-400 italic">(guessed)</span>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {(["OUR_BRAND", "PRIVATE_BRAND", "UNCLASSIFIED"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(b.brand, c)}
                      disabled={busy === b.brand || (b.mapped && b.category === c)}
                      title={`Set as ${c.replace("_", " ")}`}
                      className={`text-[10px] px-2 py-1 rounded font-semibold border transition-all ${
                        b.mapped && b.category === c
                          ? `${brandCategoryBg(c)} ring-1 ring-current`
                          : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {brandCategoryLabel(c)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {filtered.length > 200 && (
              <div className="p-3 text-center text-xs text-gray-400">
                Showing first 200 of {filtered.length}. Use search to narrow.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function CanonicalAdminClient({ userRole }: Props) {
  const [data,    setData]    = useState<CanonicalResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<"unmatched" | "mapped" | "canonical" | "brands">("unmatched")
  const [search,  setSearch]  = useState("")
  const [mapAlias, setMapAlias] = useState<AliasEntry | null>(null)
  const [showNew,  setShowNew]  = useState(false)
  const [editBuyer, setEditBuyer] = useState<CanonicalBuyer | null>(null)

  const isManager = userRole === "MANAGER" || userRole === "DIRECTOR"

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/canonical")
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  if (!isManager) return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800 text-sm">
      Only managers and directors can access canonical buyer admin.
    </div>
  )

  if (loading) return (
    <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
    ))}</div>
  )

  if (!data?.configured) return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 space-y-3">
      <h3 className="font-semibold text-amber-900">Canonical Buyer Map not configured</h3>
      <p className="text-sm text-amber-800">
        {data?.message ?? "Set CANONICAL_BUYER_MAP_SHEET_ID in .env.local and restart."}
      </p>
      <ol className="text-sm text-amber-800 space-y-1 ml-4 list-decimal">
        <li>Create a new Google Sheet called "Buyer Canonical Map"</li>
        <li>Import <code className="bg-amber-100 px-1 rounded">out/CANONICAL_BUYER_MASTER.csv</code> as tab <code>CANONICAL_BUYER_MASTER</code></li>
        <li>Import <code className="bg-amber-100 px-1 rounded">out/BUYER_ALIAS_MAP.csv</code> as tab <code>BUYER_ALIAS_MAP</code></li>
        <li>Share with the service account (editor)</li>
        <li>Copy the sheet ID into <code>CANONICAL_BUYER_MAP_SHEET_ID</code></li>
      </ol>
    </div>
  )

  const filteredCanon  = data.canonicalBuyers.filter(
    (c) => !search || c.canonicalBuyerName.toLowerCase().includes(search.toLowerCase()) || c.country.toLowerCase().includes(search.toLowerCase())
  )
  const filteredUnmatched = data.unmatched.filter(
    (a) => !search || a.aliasName.toLowerCase().includes(search.toLowerCase())
  )
  const filteredMapped = data.mapped.filter(
    (a) => !search || a.aliasName.toLowerCase().includes(search.toLowerCase()) || a.canonicalBuyerCode.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Canonical buyers</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.summary?.totalCanonical}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total aliases</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.summary?.totalAliases}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <p className="text-xs text-green-600 uppercase tracking-wide">Mapped</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{data.summary?.mappedCount}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs text-amber-600 uppercase tracking-wide">Unmatched</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{data.summary?.unmatchedCount}</p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text" placeholder="Search…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700"
        >
          + New Canonical Buyer
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([
          { key: "unmatched",  label: `Unmatched (${data.unmatched.length})` },
          { key: "mapped",     label: `Mapped (${data.mapped.length})` },
          { key: "canonical",  label: `Canonical Buyers (${data.canonicalBuyers.length})` },
          { key: "brands",     label: `Brand Categories` },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t.key ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* Unmatched tab */}
      {tab === "unmatched" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {filteredUnmatched.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              {data.summary?.unmatchedCount === 0 ? "🎉 All aliases mapped!" : "No matches for current search."}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredUnmatched.slice(0, 100).map((a) => (
                <div key={a.aliasName} className="p-3 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-gray-800 truncate">{a.aliasName}</p>
                    {a.buyerCode && <p className="text-xs text-gray-400 mt-0.5">code: {a.buyerCode}</p>}
                  </div>
                  <button
                    onClick={() => setMapAlias(a)}
                    className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 font-semibold flex-shrink-0"
                  >Map →</button>
                </div>
              ))}
              {filteredUnmatched.length > 100 && (
                <div className="p-3 text-center text-xs text-gray-400">
                  Showing first 100 of {filteredUnmatched.length}. Use search to narrow.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mapped tab */}
      {tab === "mapped" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {filteredMapped.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No mapped aliases yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredMapped.slice(0, 100).map((a) => (
                <div key={a.aliasName} className="p-3 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-gray-800 truncate">{a.aliasName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">→ {a.canonicalBuyerCode}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    a.matchConfidence === "HIGH" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                  }`}>{a.matchConfidence}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Canonical tab */}
      {tab === "canonical" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {["#","Name","Country","Segment","Owner","Target","Actions"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredCanon.map((c, i) => (
                  <tr key={c.canonicalBuyerCode} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-800 max-w-[220px]">
                      <div className="truncate">
                        {c.isKeyAccount && <span className="text-violet-500 mr-1">★</span>}{c.canonicalBuyerName}
                      </div>
                      <p className="text-[10px] text-gray-400 font-mono truncate">{c.canonicalBuyerCode}</p>
                    </td>
                    <td className="px-3 py-2 text-xs">{c.country}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${segmentBg(c.segment)}`}>
                        {segmentLabel(c.segment)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{c.primaryOwner}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.targetFY2026}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setEditBuyer(c)}
                        className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 font-semibold"
                      >Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {filteredCanon.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 text-gray-800 uppercase text-xs tracking-wide" colSpan={4}>
                      Grand Total ({filteredCanon.length})
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                      {filteredCanon.reduce((s, c) => s + c.targetFY2026, 0)}
                    </td>
                    <td className="px-3 py-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {tab === "brands" && <BrandsTab />}

      {/* Modals */}
      {mapAlias && (
        <MapAliasModal
          alias={mapAlias} canonicalBuyers={data.canonicalBuyers}
          onClose={() => setMapAlias(null)} onSaved={refresh}
        />
      )}
      {showNew && <NewCanonicalModal onClose={() => setShowNew(false)} onSaved={refresh} />}
      {editBuyer && (
        <EditCanonicalModal
          buyer={editBuyer}
          onClose={() => setEditBuyer(null)}
          onSaved={refresh}
        />
      )}
    </div>
  )
}
