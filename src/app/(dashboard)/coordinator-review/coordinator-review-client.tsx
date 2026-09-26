"use client"

import { useEffect, useState, useCallback } from "react"
import type { CoordinatorRiskBuyer, CoordinatorReviewRow } from "@/types"

interface CoordRow {
  coordinator: string
  email:       string
  riskCount:   number
  submitted:   number
  pending:     number
  isDone:      boolean
  link:        string
  buyers:      CoordinatorRiskBuyer[]
}
interface Data {
  fy: string; week: number
  coordinators: CoordRow[]
  reviews: CoordinatorReviewRow[]
}

export function CoordinatorReviewClient() {
  const [data, setData]   = useState<Data | null>(null)
  const [loading, setLoad] = useState(true)
  const [error, setError] = useState("")
  const [sending, setSending] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [msg, setMsg]     = useState("")
  const [open, setOpen]   = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoad(true); setError("")
    try {
      const res = await fetch("/api/coordinator-review")
      const d = await res.json()
      if (!res.ok) { setError(d.error || "Load failed"); return }
      setData(d)
    } catch { setError("Load failed") }
    finally { setLoad(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const sendAll = async () => {
    setSending(true); setMsg("")
    try {
      const res = await fetch("/api/coordinator-review", { method: "POST" })
      const d = await res.json()
      if (!res.ok) { setMsg(d.error || "Send failed"); return }
      setMsg(`✓ ${d.sent} sent · ${d.skipped} skipped · ${d.failed} failed (${d.pending} pending)`)
      load()
    } catch { setMsg("Send failed") }
    finally { setSending(false) }
  }

  const copyLink = async (c: CoordRow) => {
    try { await navigator.clipboard.writeText(c.link); setCopied(c.coordinator); setTimeout(() => setCopied(null), 1500) }
    catch { /* ignore */ }
  }

  const reviewsByCoord = (coord: string) =>
    (data?.reviews ?? []).filter((r) => r.salesCoordinator.toLowerCase() === coord.toLowerCase())

  const downloadPDF = async () => {
    if (!data) return
    setPdfBusy(true)
    try { await generatePDF(data) } catch (e) { console.error(e) } finally { setPdfBusy(false) }
  }

  if (loading) return <div className="text-sm text-gray-500 p-4">Loading…</div>
  if (error)   return <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm">{error}</div>
  if (!data)   return null

  const totalRisk    = data.coordinators.reduce((s, c) => s + c.riskCount, 0)
  const doneCount    = data.coordinators.filter((c) => c.isDone).length
  const pendingCoord = data.coordinators.filter((c) => !c.isDone)

  return (
    <div className="space-y-4">
      {/* Summary + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-3 flex-wrap">
          <Card label="Coordinators" value={`${data.coordinators.length}`} />
          <Card label="Risk buyers" value={`${totalRisk}`} />
          <Card label="Submitted" value={`${doneCount}/${data.coordinators.length}`} color="text-green-700" />
          <Card label="Week" value={`W${data.week} · ${data.fy}`} />
        </div>
        <div className="flex gap-2">
          <button onClick={sendAll} disabled={sending || pendingCoord.length === 0}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40">
            {sending ? "Sending…" : `📧 Send links to pending (${pendingCoord.length})`}
          </button>
          <button onClick={downloadPDF} disabled={pdfBusy || data.reviews.length === 0}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40">
            {pdfBusy ? "…" : "⬇ Download PDF"}
          </button>
        </div>
      </div>
      {msg && <div className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-xl px-4 py-2">{msg}</div>}

      {/* Coordinator cards */}
      <div className="space-y-3">
        {data.coordinators.map((c) => {
          const isOpen = open === c.coordinator
          const subs = reviewsByCoord(c.coordinator)
          return (
            <div key={c.coordinator} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap cursor-pointer hover:bg-gray-50"
                   onClick={() => setOpen(isOpen ? null : c.coordinator)}>
                <div className="flex items-center gap-2">
                  <span className={`text-gray-400 text-[10px] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                  <span className="font-bold text-gray-900">{c.coordinator}</span>
                  <span className="text-xs text-gray-400">{c.email || "no email"}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c.riskCount} risk buyers</span>
                  {c.isDone
                    ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">✓ {c.submitted} submitted</span>
                    : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Pending</span>}
                  <button onClick={(e) => { e.stopPropagation(); copyLink(c) }}
                    className="text-xs px-2 py-1 rounded border border-gray-200 hover:border-gray-400 text-gray-600">
                    {copied === c.coordinator ? "✓ Copied" : "🔗 Copy link"}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                        <th className="px-3 py-2">Buyer</th>
                        <th className="px-3 py-2">Country</th>
                        <th className="px-3 py-2 text-right">Target</th>
                        <th className="px-3 py-2 text-right">Actual</th>
                        <th className="px-3 py-2">Last order</th>
                        <th className="px-3 py-2">Reason</th>
                        <th className="px-3 py-2">Action plan</th>
                        <th className="px-3 py-2">Expected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {c.buyers.map((b) => {
                        const sub = subs.find((s) => s.buyerName.toLowerCase() === b.buyerName.toLowerCase())
                        return (
                          <tr key={b.buyerName} className={sub ? "" : "bg-amber-50/40"}>
                            <td className="px-3 py-2 font-semibold text-gray-800">{b.buyerName}</td>
                            <td className="px-3 py-2 text-gray-500">{b.country} · {b.tier.replace("TIER", "T")}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{b.target}</td>
                            <td className={`px-3 py-2 text-right tabular-nums font-bold ${b.actual === 0 ? "text-red-600" : ""}`}>{b.actual}</td>
                            <td className="px-3 py-2 text-gray-500">{b.lastOrderDate || "—"}{b.daysSinceOrder != null ? ` (${b.daysSinceOrder}d)` : ""}</td>
                            <td className="px-3 py-2">{sub?.reason ? <span className="font-medium text-gray-800">{sub.reason}</span> : <span className="text-amber-600 text-xs">pending</span>}</td>
                            <td className="px-3 py-2 text-gray-600">{sub?.actionPlan || "—"}</td>
                            <td className="px-3 py-2 text-gray-600">{sub?.expectedOrder || "—"}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-2">
      <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-black ${color ?? "text-gray-900"}`}>{value}</div>
    </div>
  )
}

// ── PDF for the director ─────────────────────────────────────────────────────
async function generatePDF(data: Data) {
  const { default: jsPDF } = await import("jspdf")
  const autoTable = (await import("jspdf-autotable")).default
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const W = doc.internal.pageSize.getWidth()
  const ML = 12

  doc.setFillColor(15, 118, 110); doc.rect(0, 0, W, 22, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5)
  doc.text("SHAZIA RICE · CONFIDENTIAL · INTERNAL", ML, 7)
  doc.setFontSize(15); doc.text("Weekly Coordinator Review", ML, 15)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text(`Week ${data.week} · FY ${data.fy}`, W - ML, 15, { align: "right" })

  let y = 28
  for (const c of data.coordinators) {
    const subs = data.reviews.filter((r) => r.salesCoordinator.toLowerCase() === c.coordinator.toLowerCase())
    const body = c.buyers.map((b) => {
      const s = subs.find((x) => x.buyerName.toLowerCase() === b.buyerName.toLowerCase())
      return [
        b.buyerName, `${b.country} · ${b.tier.replace("TIER", "T")}`,
        String(b.target), String(b.actual), b.lastOrderDate || "—",
        s?.reason || "—", s?.remark || "—", s?.actionPlan || "—", s?.expectedOrder || "—",
      ]
    })
    doc.setTextColor(15, 118, 110); doc.setFont("helvetica", "bold"); doc.setFontSize(10)
    if (y > 180) { doc.addPage(); y = 20 }
    doc.text(`${c.coordinator}  (${c.submitted}/${c.riskCount} submitted)`, ML, y); y += 2
    autoTable(doc, {
      startY: y + 2,
      head: [["Buyer", "Country/Tier", "Target", "Actual", "Last order", "Reason", "Remark", "Action plan", "Expected"]],
      body,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [15, 118, 110], fontSize: 7 },
      columnStyles: { 5: { cellWidth: 30 }, 6: { cellWidth: 45 }, 7: { cellWidth: 45 } },
      margin: { left: ML, right: ML },
      theme: "grid",
    })
    // @ts-expect-error autotable augments doc
    y = (doc.lastAutoTable?.finalY ?? y) + 8
  }
  doc.save(`Coordinator-Review-W${data.week}-${data.fy}.pdf`)
}
