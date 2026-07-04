"use client"

import { useState } from "react"

type StatusFilter = "" | "ACHIEVED" | "ON_TRACK" | "CRITICAL"

const STATUS_PILLS: { val: StatusFilter; label: string; active: string }[] = [
  { val: "",         label: "All",         active: "bg-gray-800 text-white border-gray-800" },
  { val: "ACHIEVED", label: "✓ Achieved",  active: "bg-green-600 text-white border-green-600" },
  { val: "ON_TRACK", label: "On Track",    active: "bg-amber-500 text-white border-amber-500" },
  { val: "CRITICAL", label: "✕ Critical",  active: "bg-red-600 text-white border-red-600" },
]

const TIER_LBL: Record<string, string> = { TIER1: "T1", TIER2: "T2", TIER3: "T3", OTHERS: "Others" }
const ST_LBL: Record<string, string> = { OVER_ACHIEVED: "Over Achieved", ON_TRACK: "On Track", CRITICAL: "Critical", NO_TARGET: "No Target" }
const ST_RGB: Record<string, [number, number, number]> = { OVER_ACHIEVED: [5,150,105], ON_TRACK: [217,119,6], CRITICAL: [220,38,38], NO_TARGET: [107,114,128] }
const fmt = (n: number, d = 0) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })

export function DailyReportClient({ loginEmail }: { loginEmail: string }) {
  const [to, setTo]       = useState("")
  const [busy, setBusy]   = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [status, setStatus]   = useState<StatusFilter>("")
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const statusQS = status ? `&status=${status}` : ""

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

  const downloadPDF = async () => {
    setPdfBusy(true)
    try {
      const res  = await fetch(`/api/reports/daily-buyer?${status ? `status=${status}` : ""}`)
      const data = await res.json()
      const { default: jsPDF }     = await import("jspdf")
      const { default: autoTable } = await import("jspdf-autotable")

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
      const dateLabel = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      const s = data.summary
      const tillNowTarget = s.yearTarget > 0 ? (s.yearTarget / 52) * data.week : 0
      const overallPct = tillNowTarget > 0 ? Math.round((s.fytdActual / tillNowTarget) * 100) : 0

      doc.setFontSize(14); doc.setTextColor(15, 23, 42)
      doc.text("Daily Buyer Performance Report", 14, 13)
      doc.setFontSize(9); doc.setTextColor(100)
      doc.text(`Shazia Rice · ${dateLabel} · ${data.monthName} · FY ${data.fy} · Till Week ${data.week}${status ? `  ·  Filter: ${ST_LBL[status === "ACHIEVED" ? "OVER_ACHIEVED" : status] ?? status}` : ""}`, 14, 19)
      doc.setFontSize(8)
      doc.text(`Year Target ${fmt(s.yearTarget)}  ·  Till-now Target ${fmt(tillNowTarget)}  ·  Actual ${fmt(s.fytdActual)}  ·  Till-now ${overallPct}%   |   Critical ${s.critical} · On Track ${s.onTrack} · Over Ach ${s.overAchieved}`, 14, 24)

      const body = data.rows.map((r: any, i: number) => [
        String(i + 1),
        r.buyerName,
        r.country,
        r.salesPerson + (r.salesCoordinator ? `\nCoord: ${r.salesCoordinator}` : ""),
        TIER_LBL[r.tier] ?? r.tier,
        fmt(r.monthTarget, 1),
        fmt(r.monthActual),
        fmt(r.weekTarget, 1),
        fmt(r.weekActual),
        r.tillNowPct === null ? "—" : `${r.tillNowPct}%`,
        ST_LBL[r.status] ?? r.status,
        fmt(r.yearTarget),
      ])

      autoTable(doc, {
        head: [["#", "Buyer", "Country", "Sales Person", "Tier", "Month Tgt", "Month Act", "Till Wk Tgt", "Till Wk Act", "Till-now %", "Status", "Year Tgt"]],
        body,
        startY: 28,
        styles: { fontSize: 7, cellPadding: 1.5, valign: "middle" },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 7, halign: "center" },
        columnStyles: {
          0: { halign: "center", cellWidth: 8 },
          1: { cellWidth: 48 },
          4: { halign: "center", cellWidth: 12 },
          5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" },
          9: { halign: "right" }, 10: { halign: "center" }, 11: { halign: "right" },
        },
        didParseCell: (d: any) => {
          if (d.section === "body" && d.column.index === 10) {
            const raw = data.rows[d.row.index]?.status
            const rgb = ST_RGB[raw]
            if (rgb) { d.cell.styles.textColor = rgb; d.cell.styles.fontStyle = "bold" }
          }
        },
      })

      doc.save(`Daily-Buyer-Report-${new Date().toISOString().slice(0, 10)}${status ? `-${status}` : ""}.pdf`)
    } catch (e) {
      console.error(e)
      setResult({ ok: false, msg: "⚠️ PDF generate failed" })
    } finally { setPdfBusy(false) }
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-800">Send a test · Download · Filter</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={loginEmail ? `Default: ${loginEmail}` : "your@email.com"}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button onClick={send} disabled={busy}
            className="text-sm px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50">
            {busy ? "Sending…" : "📧 Send to my email"}
          </button>
          <button onClick={downloadPDF} disabled={pdfBusy}
            className="text-sm px-4 py-2 rounded-lg bg-slate-800 text-white font-semibold hover:bg-slate-900 disabled:opacity-50">
            {pdfBusy ? "Generating…" : "⬇ Download PDF"}
          </button>
          <button onClick={() => setRefreshKey((k) => k + 1)}
            className="text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            ↻ Refresh preview
          </button>
        </div>

        {/* Status filter pills (apply to preview + PDF) */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="text-xs text-gray-500">Filter:</span>
          {STATUS_PILLS.map(({ val, label, active }) => (
            <button key={val || "all"} onClick={() => setStatus(val)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                status === val ? active : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}>
              {label}
            </button>
          ))}
          <span className="text-[11px] text-gray-400">(preview + PDF ispe filter honge; email full jata hai)</span>
        </div>

        <p className="text-xs text-gray-400">
          Email khaali chhodo to aapki login email ({loginEmail || "—"}) pe jayega. PDF me saare buyers aate hain — kuch missing nahi.
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
          Live Preview {status && `· ${STATUS_PILLS.find((p) => p.val === status)?.label}`}
        </div>
        <iframe
          key={`${refreshKey}-${status}`}
          src={`/api/reports/daily-buyer?format=html${statusQS}&_=${refreshKey}`}
          title="Daily Buyer Report preview"
          className="w-full"
          style={{ height: "70vh", border: "none" }}
        />
      </div>
    </div>
  )
}
