"use client"

import { useEffect, useState, useCallback } from "react"

interface SourceCheck {
  name: string
  count: number
  ok: boolean
  detail?: string
  sample?: unknown[]
  error?: string
}

interface HealthResponse {
  currentFY: string
  previousFY: string
  serverTime: string
  spreadsheetTabs: string[]
  eightyTwentyTab: string | null
  eightyTwentyHeaders: string[]
  eightyTwentyRowCount: number
  verdict: string[]
  sources: SourceCheck[]
}

export function DiagnosticsClient() {
  const [data, setData]       = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const run = useCallback(async (force = false) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/debug/data-health${force ? "?force=1" : ""}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { run(false) }, [run])

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4 max-w-screen-xl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🩺 Data Health Diagnostics</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Shows the real state of every Google Sheet the app depends on. If a dashboard looks empty, the answer is here.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => run(false)}
            disabled={loading}
            className="text-xs px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-60"
          >
            {loading ? "Checking…" : "↻ Re-check (use cache)"}
          </button>
          <button
            onClick={() => run(true)}
            disabled={loading}
            className="text-xs px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60 font-semibold"
            title="Clears every memo + re-fetches from Google Sheets. Use this if data looks empty or stale."
          >
            ⚡ Force-refresh (clear all caches)
          </button>
        </div>
      </div>

      {loading && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-sm text-gray-500">
          Loading data from Google Sheets… first run can take 10–20 seconds.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
          <p className="font-semibold">Diagnostic failed</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}

      {data && (
        <>
          {/* Verdict */}
          <div className={`rounded-xl p-5 border ${
            data.verdict.every((v) => v.startsWith("✅"))
              ? "bg-green-50 border-green-200"
              : data.verdict.some((v) => v.startsWith("❌"))
                ? "bg-red-50 border-red-200"
                : "bg-amber-50 border-amber-200"
          }`}>
            <h2 className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wide">Verdict</h2>
            <ul className="space-y-1.5 text-sm text-gray-800">
              {data.verdict.map((v, i) => <li key={i} className="leading-relaxed">{v}</li>)}
            </ul>
          </div>

          {/* Top facts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FactCard label="Current FY"        value={data.currentFY} />
            <FactCard label="Previous FY"       value={data.previousFY} />
            <FactCard label="80/20 Tab"         value={data.eightyTwentyTab ?? "(not found)"} />
            <FactCard label="80/20 Sheet Rows"  value={data.eightyTwentyRowCount.toString()} />
          </div>

          {/* Spreadsheet tabs */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-gray-700 mb-2">Available tabs in spreadsheet</h3>
            <div className="flex flex-wrap gap-1.5">
              {data.spreadsheetTabs.length === 0 && <span className="text-xs text-gray-400">(none)</span>}
              {data.spreadsheetTabs.map((t) => (
                <span
                  key={t}
                  className={`text-xs px-2 py-1 rounded-full border ${
                    t === data.eightyTwentyTab
                      ? "bg-green-100 text-green-800 border-green-200 font-semibold"
                      : "bg-gray-50 text-gray-600 border-gray-200"
                  }`}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* 80/20 headers */}
          {data.eightyTwentyTab && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-bold text-gray-700 mb-2">
                Columns detected in "{data.eightyTwentyTab}"
              </h3>
              <p className="text-xs text-gray-500 mb-2">
                Code looks for: <code className="bg-gray-100 px-1 rounded">Buyer Company Name</code> /
                <code className="bg-gray-100 px-1 rounded mx-1">Buyer Name</code>,
                <code className="bg-gray-100 px-1 rounded mr-1">Countries</code>,
                <code className="bg-gray-100 px-1 rounded mr-1">Tier</code>,
                <code className="bg-gray-100 px-1 rounded mr-1">Annual Target</code> /
                <code className="bg-gray-100 px-1 rounded">Current Year Target Containers</code>,
                <code className="bg-gray-100 px-1 rounded mx-1">Resposible</code>,
                <code className="bg-gray-100 px-1 rounded">resposible mail</code>,
                <code className="bg-gray-100 px-1 rounded mx-1">sales Coordinators</code>,
                <code className="bg-gray-100 px-1 rounded">sales cood mail</code>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.eightyTwentyHeaders.length === 0 && <span className="text-xs text-gray-400">(no headers found)</span>}
                {data.eightyTwentyHeaders.map((h) => (
                  <span key={h} className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {h || "(blank)"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Per-source breakdown */}
          <div className="space-y-3">
            {data.sources.map((s, i) => (
              <div
                key={i}
                className={`bg-white border rounded-xl p-5 ${s.ok ? "border-green-200" : "border-red-200"}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 font-mono">{s.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{s.detail}</p>
                  </div>
                  <span className={`flex-shrink-0 text-xs px-2 py-1 rounded-full font-bold ${
                    s.ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
                  }`}>
                    {s.ok ? "✓" : "✗"} {s.count} rows
                  </span>
                </div>
                {s.sample && s.sample.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700">
                      View {s.sample.length} sample row{s.sample.length === 1 ? "" : "s"} →
                    </summary>
                    <pre className="mt-2 bg-gray-50 border border-gray-100 rounded-lg p-3 text-[10px] text-gray-700 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(s.sample, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 text-center pt-2">
            Server time: {data.serverTime}
          </p>
        </>
      )}
    </div>
  )
}

function FactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-gray-900 mt-1 break-all">{value}</p>
    </div>
  )
}
