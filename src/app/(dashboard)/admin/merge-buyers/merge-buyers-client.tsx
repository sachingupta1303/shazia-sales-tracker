"use client"

import { useState, useEffect } from "react"

interface NameOpt { name: string; country: string }

export function MergeBuyersClient() {
  const [names, setNames]     = useState<NameOpt[]>([])
  const [primary, setPrimary] = useState("")
  const [variant, setVariant] = useState("")
  const [busy, setBusy]       = useState(false)
  const [result, setResult]   = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    fetch("/api/admin/merge-buyers")
      .then((r) => r.json())
      .then((d) => setNames(d.names || []))
      .catch(() => {})
  }, [])

  const merge = async () => {
    if (!primary.trim() || !variant.trim()) { setResult({ ok: false, msg: "⚠️ Dono naam chuno" }); return }
    if (primary.trim().toLowerCase() === variant.trim().toLowerCase()) { setResult({ ok: false, msg: "⚠️ Dono naam alag hone chahiye" }); return }
    setBusy(true); setResult(null)
    try {
      const res = await fetch("/api/admin/merge-buyers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryName: primary.trim(), variantName: variant.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.ok) {
        setResult({ ok: true, msg: `✅ Merge ho gaya! "${d.variantName}" ab "${d.primaryName}" me jud gaya. Ab 80/20 Dashboard pe "Refresh (sync sheet)" dabao ya thodi der me sab jagah ek dikhega.` })
        setVariant("")
      } else {
        setResult({ ok: false, msg: `⚠️ ${d.error || "Merge failed"}` })
      }
    } catch {
      setResult({ ok: false, msg: "⚠️ Merge failed" })
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* How it works */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 space-y-1">
        <p className="font-semibold">Kaise use karein:</p>
        <p>1. <b>Rakhna kaunsa naam hai</b> (jispe target laga hai) — wo <b>Primary</b> me chuno.</p>
        <p>2. <b>Doosra naam</b> (jo isi buyer ka hai) — <b>Variant</b> me chuno.</p>
        <p>3. <b>Merge</b> dabao. Variant ab primary me jud jayega — target + actual ek jagah.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        {/* Primary */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Primary — ye naam rahega (target waala)</label>
          <input
            list="buyer-names"
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            placeholder="Type ya select karo…"
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div className="text-center text-gray-400 text-lg">⬇ merge into ⬆</div>

        {/* Variant */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Variant — ye naam primary me jud jayega</label>
          <input
            list="buyer-names"
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            placeholder="Type ya select karo…"
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <datalist id="buyer-names">
          {names.map((n) => (
            <option key={n.name} value={n.name}>{n.country ? `${n.name} — ${n.country}` : n.name}</option>
          ))}
        </datalist>

        <button
          onClick={merge}
          disabled={busy}
          className="w-full text-sm px-4 py-2.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50"
        >
          {busy ? "Merging…" : "🔗 Merge"}
        </button>

        {result && (
          <div className={`text-sm rounded-lg px-3 py-2 ${result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {result.msg}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        {names.length} buyer names loaded. Ek buyer ke 3-4 naam hon to variant ek-ek karke merge karte jao (primary same rakho).
      </p>
    </div>
  )
}
