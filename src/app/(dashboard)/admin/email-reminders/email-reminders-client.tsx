"use client"

import { useState } from "react"

interface SmtpResult {
  ok: boolean
  step?: string
  sentTo?: string
  messageId?: string
  reason?: string
  error?: string
  hint?: string
  diagEnv?: {
    SMTP_HOST: boolean
    SMTP_USER: boolean
    SMTP_PASS: boolean
    SMTP_PORT: string
    configured: boolean
  }
}

interface BatchResult {
  ranAt:           string
  skipped:         boolean
  skipReason?:     string
  candidates:      number
  alreadySent:     number
  batchSize:       number
  sent:            number
  failed:          number
  lastBatchSentAt: string | null
  nextBatchAfter:  string | null
  buyersSent: {
    buyerName:  string
    tier:       string
    recipients: number
    status:     "SENT" | "FAILED"
  }[]
  error?: string
}

function fmtIST(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-IN", {
    timeZone:  "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function EmailRemindersClient() {
  const [smtpLoading,  setSmtpLoading]  = useState(false)
  const [smtpResult,   setSmtpResult]   = useState<SmtpResult | null>(null)
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchResult,  setBatchResult]  = useState<BatchResult | null>(null)
  const [forceBatch,   setForceBatch]   = useState(false)

  async function testSmtp() {
    setSmtpLoading(true); setSmtpResult(null)
    try {
      const res = await fetch("/api/8020/test-email")
      setSmtpResult(await res.json())
    } catch (e) {
      setSmtpResult({ ok: false, error: e instanceof Error ? e.message : "Network error" })
    } finally { setSmtpLoading(false) }
  }

  async function sendBatch() {
    setBatchLoading(true); setBatchResult(null)
    try {
      const url = `/api/8020/cron-batch${forceBatch ? "?force=1" : ""}`
      const res = await fetch(url)
      setBatchResult(await res.json())
    } catch (e) {
      setBatchResult({
        ranAt: new Date().toISOString(), skipped: true,
        skipReason: e instanceof Error ? e.message : "Network error",
        candidates: 0, alreadySent: 0, batchSize: 0, sent: 0, failed: 0,
        lastBatchSentAt: null, nextBatchAfter: null, buyersSent: [],
      })
    } finally { setBatchLoading(false) }
  }

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">📧 Email Reminders</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage the automated 80/20 meeting reminder emails. Cron runs automatically every 2 hours during office hours (9:30 AM – 6:00 PM IST).
        </p>
      </div>

      {/* Schedule Overview */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h2 className="text-sm font-bold text-blue-800 mb-3 uppercase tracking-wide">🗓️ Automatic Schedule</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { utc: "04:00", ist: "9:30 AM" },
            { utc: "06:00", ist: "11:30 AM" },
            { utc: "08:00", ist: "1:30 PM" },
            { utc: "10:00", ist: "3:30 PM" },
            { utc: "12:00", ist: "5:30 PM" },
          ].map((t) => (
            <div key={t.utc} className="bg-white border border-blue-200 rounded-lg p-2 text-center">
              <p className="text-xs font-bold text-blue-700">{t.ist}</p>
              <p className="text-[10px] text-blue-400 mt-0.5">IST ({t.utc} UTC)</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-blue-700">
          <div><span className="font-semibold">Batch size:</span> 3 buyers per run</div>
          <div><span className="font-semibold">Gap:</span> Min 2 hours between batches</div>
          <div><span className="font-semibold">Max/day:</span> 15 buyers × 1–2 emails each</div>
        </div>
        <p className="mt-2 text-xs text-blue-600">
          Priority: OVERDUE first (most overdue → least), then DUE_SOON. Each buyer alerted at most once per day.
        </p>
      </div>

      {/* SMTP Test */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-1">🔌 SMTP Connection Test</h2>
        <p className="text-xs text-gray-500 mb-3">
          Sends a real test email to your account. Confirms Gmail App Password + credentials are working.
        </p>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            onClick={testSmtp}
            disabled={smtpLoading}
            className="px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {smtpLoading ? "Connecting…" : "Send SMTP Test Email →"}
          </button>
          <a
            href="/api/debug/smtp-check"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-indigo-50 text-indigo-700 text-sm font-semibold rounded-lg border border-indigo-200 hover:bg-indigo-100 transition-colors"
          >
            🔍 Check Env Vars
          </a>
        </div>

        {smtpResult && (
          <div className={`mt-4 rounded-lg p-4 border text-sm ${
            smtpResult.ok
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}>
            {smtpResult.ok ? (
              <>
                <p className="font-bold">✅ SMTP working!</p>
                <p className="text-xs mt-1">Email sent to <strong>{smtpResult.sentTo}</strong></p>
                {smtpResult.messageId && (
                  <p className="text-[10px] text-green-600 mt-1 font-mono">{smtpResult.messageId}</p>
                )}
              </>
            ) : (
              <>
                <p className="font-bold">❌ SMTP failed at step: {smtpResult.step}</p>
                <p className="text-xs mt-1">{smtpResult.error ?? smtpResult.reason}</p>
                {smtpResult.hint && (
                  <p className="text-xs mt-1 text-red-600 font-medium">{smtpResult.hint}</p>
                )}
                {smtpResult.diagEnv && (
                  <div className="mt-2 p-2 bg-red-100 rounded text-xs font-mono space-y-0.5">
                    <p className="font-semibold text-red-900 mb-1">Vercel env vars seen by server:</p>
                    {(["SMTP_HOST","SMTP_USER","SMTP_PASS"] as const).map(k => (
                      <p key={k}>
                        {smtpResult.diagEnv![k as "SMTP_HOST"|"SMTP_USER"|"SMTP_PASS"]
                          ? <span className="text-green-700">✓ {k} set</span>
                          : <span className="text-red-700">✗ {k} MISSING</span>
                        }
                      </p>
                    ))}
                    <p className="text-gray-600">SMTP_PORT: {smtpResult.diagEnv.SMTP_PORT}</p>
                    <p className={smtpResult.diagEnv.configured ? "text-green-700 font-bold" : "text-red-700 font-bold"}>
                      configured: {String(smtpResult.diagEnv.configured)}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Manual Batch Trigger */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-1">⚡ Manual Batch Trigger</h2>
        <p className="text-xs text-gray-500 mb-4">
          Fire one batch right now (same logic as the cron). Normal mode respects office hours + 2-hour gap.
          Force mode bypasses both — use for testing only.
        </p>

        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={forceBatch}
              onChange={(e) => setForceBatch(e.target.checked)}
              className="w-4 h-4 accent-red-600"
            />
            <span className={forceBatch ? "text-red-600 font-semibold" : "text-gray-600"}>
              Force mode (bypass office hours + 2-hour gap)
            </span>
          </label>
        </div>

        <button
          onClick={sendBatch}
          disabled={batchLoading}
          className={`px-4 py-2 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors ${
            forceBatch
              ? "bg-red-600 hover:bg-red-700"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {batchLoading
            ? "Sending…"
            : forceBatch
              ? "⚡ Force Send Batch"
              : "▶ Run Batch Now"}
        </button>

        {batchResult && (
          <div className="mt-4 space-y-3">
            {/* Skipped */}
            {batchResult.skipped && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm font-bold text-amber-800">⏭ Batch skipped</p>
                <p className="text-xs text-amber-700 mt-1">{batchResult.skipReason}</p>
                {batchResult.nextBatchAfter && (
                  <p className="text-xs text-amber-600 mt-1">
                    Next batch allowed after: <strong>{fmtIST(batchResult.nextBatchAfter)}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Summary */}
            {!batchResult.skipped && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm font-bold text-green-800">
                  ✅ Batch complete — {batchResult.sent} email{batchResult.sent !== 1 ? "s" : ""} sent
                  {batchResult.failed > 0 && `, ${batchResult.failed} failed`}
                </p>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <Stat label="Eligible" value={batchResult.candidates} />
                  <Stat label="This batch" value={batchResult.batchSize} />
                  <Stat label="Already sent today" value={batchResult.alreadySent} />
                </div>
              </div>
            )}

            {/* Buyers sent */}
            {batchResult.buyersSent.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-lg divide-y divide-gray-50">
                {batchResult.buyersSent.map((b, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <span className="font-medium text-gray-800">{b.buyerName}</span>
                      <span className="ml-2 text-xs text-gray-400">{b.tier}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{b.recipients} recipient{b.recipients !== 1 ? "s" : ""}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        b.status === "SENT"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        {b.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Timing info */}
            <p className="text-[10px] text-gray-400">
              Ran at {fmtIST(batchResult.ranAt)} IST
              {batchResult.lastBatchSentAt && ` · Last batch: ${fmtIST(batchResult.lastBatchSentAt)} IST`}
            </p>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-3">ℹ️ How it works</h2>
        <ol className="space-y-2 text-xs text-gray-600 list-decimal list-inside">
          <li>Vercel Cron fires <strong>/api/8020/cron-batch</strong> 5 times a day (9:30, 11:30, 1:30, 3:30, 5:30 PM IST)</li>
          <li>Each run checks if it's within office hours <strong>and</strong> at least 2 hours since last batch</li>
          <li>Reads <strong>ALERT_LOG_8020</strong> sheet — any buyer already emailed today is skipped</li>
          <li>Sorts remaining by urgency: OVERDUE first (most overdue wins), then DUE_SOON</li>
          <li>Sends <strong>3 buyers</strong> per batch — coordinator + responsible person both receive the email</li>
          <li>Each email has a <strong>"✓ Mark as Done"</strong> button → leads to the done form, saves outcome to sheet</li>
          <li>If coordinator marks done → meeting history logged → next due date auto-calculated</li>
        </ol>
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs font-semibold text-yellow-800">⚠️ Required: Vercel Pro or higher</p>
          <p className="text-xs text-yellow-700 mt-0.5">
            Vercel Cron Jobs require a Pro plan ($20/mo). On the free plan, set up an external cron
            (cron-job.org, GitHub Actions, etc.) to hit <code className="bg-yellow-100 px-1 rounded">/api/8020/cron-batch</code> every 2 hours.
          </p>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
    </div>
  )
}
