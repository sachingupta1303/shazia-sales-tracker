"use client"

import { useState } from "react"

export function DailyReportClient({ loginEmail }: { loginEmail: string }) {
  const [to, setTo]       = useState("")
  const [busy, setBusy]   = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const send = async () => {
    setBusy(true); setResult(null)
    try {
      const qs = to.trim() ? `?send=1&to=${encodeURIComponent(to.trim())}` : "?send=1"
      const res = await fetch(`/api/reports/daily-buyer${qs}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setResult({ ok: true, msg: `✅ Sent to ${data.sentTo} · ${data.buyers} buyers · ${data.critical} critical` })
      } else {
        setResult({ ok: false, msg: `⚠️ ${data.reason || data.error || "Send failed"}` })
      }
    } catch {
      setResult({ ok: false, msg: "⚠️ Send failed" })
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-800">Send a test to yourself</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={loginEmail ? `Default: ${loginEmail}` : "your@email.com"}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-72 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={send}
            disabled={busy}
            className="text-sm px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            {busy ? "Sending…" : "📧 Send to my email"}
          </button>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            ↻ Refresh preview
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Email khaali chhodo to aapki login email ({loginEmail || "—"}) pe jayega. Doosri email chahiye to upar daal do.
        </p>
        {result && (
          <div className={`text-sm rounded-lg px-3 py-2 ${result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {result.msg}
          </div>
        )}
      </div>

      {/* Live preview */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Live Preview
        </div>
        <iframe
          key={refreshKey}
          src={`/api/reports/daily-buyer?format=html&_=${refreshKey}`}
          title="Daily Buyer Report preview"
          className="w-full"
          style={{ height: "70vh", border: "none" }}
        />
      </div>
    </div>
  )
}
