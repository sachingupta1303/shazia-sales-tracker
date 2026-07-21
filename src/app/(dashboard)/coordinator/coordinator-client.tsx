"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { formatNumber } from "@/lib/utils"

interface OrderLine { date: string; piNo: string; brand: string; variety: string; description: string; qtyMT: number; rate: number }
interface Buyer {
  buyerName: string; country: string
  salesPerson: string; salesPersonEmail: string
  salesCoordinator: string; salesCoordinatorEmail: string
  tier: string; target: number
  ordersPrevFY: number; ordersCurrFY: number
  containersPrevFY: number; containersCurrFY: number
  qtyMTPrevFY: number; qtyMTCurrFY: number
  avgCycleDays: number; varieties: string[]; last5Orders: OrderLine[]
}
interface Data { buyers: Buyer[]; filters: { salesCoordinators: string[]; salesPersons: string[]; countries: string[] }; meta: { currFY: string; prevFY: string; total: number } }

const TIER_STYLE: Record<string, string> = {
  TIER1: "bg-purple-100 text-purple-700", TIER2: "bg-blue-100 text-blue-700",
  TIER3: "bg-emerald-100 text-emerald-700", OTHERS: "bg-gray-100 text-gray-500",
}

const COLS = [
  { key: "client",  label: "Client",       w: 260, align: "left"  },
  { key: "country", label: "Country",      w: 110, align: "left"  },
  { key: "coord",   label: "Coordinator",  w: 130, align: "left"  },
  { key: "sp",      label: "Sales Person", w: 130, align: "left"  },
  { key: "target",  label: "Target",       w: 80,  align: "right" },
  { key: "ctrs",    label: "Containers",   w: 120, align: "right" },
] as const

export function CoordinatorClient() {
  const [data, setData]       = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState("")
  const [search, setSearch]   = useState("")
  const [coord, setCoord]     = useState("")
  const [sp, setSP]           = useState("")
  const [selected, setSelected] = useState<Buyer | null>(null)
  const [widths, setWidths]   = useState<number[]>(COLS.map((c) => c.w))
  const resizing = useRef<{ i: number; startX: number; startW: number } | null>(null)

  useEffect(() => {
    fetch("/api/coordinator")
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setErr("Failed to load."))
      .finally(() => setLoading(false))
  }, [])

  // Column resize handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizing.current
      if (!r) return
      const w = Math.max(56, r.startW + (e.clientX - r.startX))
      setWidths((prev) => prev.map((x, idx) => (idx === r.i ? w : x)))
    }
    const onUp = () => { resizing.current = null; document.body.style.cursor = "" }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
  }, [])
  const startResize = (i: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    resizing.current = { i, startX: e.clientX, startW: widths[i] }
    document.body.style.cursor = "col-resize"
  }

  const rows = useMemo(() => {
    if (!data) return []
    const q = search.toLowerCase().trim()
    return data.buyers.filter((b) =>
      (!coord || b.salesCoordinator === coord) &&
      (!sp || b.salesPerson === sp) &&
      (!q || b.buyerName.toLowerCase().includes(q) || b.country.toLowerCase().includes(q))
    )
  }, [data, search, coord, sp])

  if (loading) return <div className="text-sm text-gray-400">Loading…</div>
  if (err || !data) return <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{err}</div>

  const fy = data.meta

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search buyer / country…"
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-green-500" />
        <select value={coord} onChange={(e) => setCoord(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">All Coordinators</option>
          {data.filters.salesCoordinators.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sp} onChange={(e) => setSP(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">All Sales Persons</option>
          {data.filters.salesPersons.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{rows.length} buyers · FY {fy.currFY}</span>
      </div>

      {/* Full width by default; split when a buyer is selected */}
      <div className={`grid gap-3 ${selected ? "lg:grid-cols-5" : "grid-cols-1"}`}>
        {/* Left — buyer list (resizable columns) */}
        <div className={`${selected ? "lg:col-span-3" : ""} bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto`}>
          <table className="text-sm" style={{ tableLayout: "fixed", width: "100%", borderCollapse: "collapse" }}>
            <colgroup>{COLS.map((c, i) => <col key={c.key} style={{ width: widths[i] }} />)}</colgroup>
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] uppercase tracking-wide">
                {COLS.map((c, i) => (
                  <th key={c.key} className="px-3 py-2.5 relative select-none" style={{ textAlign: c.align as any }}>
                    {c.label}
                    <span
                      onMouseDown={(e) => startResize(i, e)}
                      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/30"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((b, i) => (
                <tr key={`${b.buyerName}-${i}`}
                  onClick={() => setSelected(b)}
                  className={`border-b border-gray-100 cursor-pointer align-top ${selected?.buyerName === b.buyerName ? "bg-green-50" : i % 2 ? "bg-slate-50/50" : ""} hover:bg-green-50/60`}>
                  <td className="px-3 py-2 font-semibold text-slate-900" style={{ wordBreak: "break-word", whiteSpace: "normal" }}>
                    {b.buyerName}
                    <span className={`ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded ${TIER_STYLE[b.tier] ?? TIER_STYLE.OTHERS}`}>{b.tier === "OTHERS" ? "—" : b.tier.replace("TIER", "T")}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-600" style={{ wordBreak: "break-word", whiteSpace: "normal" }}>{b.country}</td>
                  <td className="px-3 py-2 text-gray-600" style={{ wordBreak: "break-word", whiteSpace: "normal" }}>{b.salesCoordinator || "—"}</td>
                  <td className="px-3 py-2 text-gray-600" style={{ wordBreak: "break-word", whiteSpace: "normal" }}>{b.salesPerson || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{b.target ? formatNumber(b.target) : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="tabular-nums font-bold text-slate-900 text-[15px] leading-tight">{b.containersPrevFY} / {b.containersCurrFY}</div>
                    <div className="text-[10px] text-gray-400 tabular-nums">{formatNumber(b.qtyMTPrevFY)} / {formatNumber(b.qtyMTCurrFY)} MT</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right — detail (only when selected) */}
        {selected && (
          <div className="lg:col-span-2">
            <BuyerDetail b={selected} fy={fy} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2.5">
      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-base font-bold text-slate-900">{value}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  )
}

function BuyerDetail({ b, fy, onClose }: { b: Buyer; fy: { currFY: string; prevFY: string }; onClose: () => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 sticky top-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-900">{b.buyerName}</h3>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TIER_STYLE[b.tier] ?? TIER_STYLE.OTHERS}`}>{b.tier === "OTHERS" ? "Others" : b.tier.replace("TIER", "Tier ")}</span>
          </div>
          <p className="text-xs text-gray-500">{b.country}</p>
          <p className="text-xs text-gray-500 mt-1">Coordinator: <b className="text-slate-700">{b.salesCoordinator || "—"}</b> · Sales: <b className="text-slate-700">{b.salesPerson || "—"}</b></p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label={`Orders ${fy.prevFY}`} value={String(b.ordersPrevFY)} />
        <Stat label={`Orders ${fy.currFY}`} value={String(b.ordersCurrFY)} />
        {/* Containers = primary; Qty MT small below */}
        <div className="bg-slate-50 rounded-lg p-2.5">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Containers · {fy.prevFY}/{fy.currFY}</p>
          <p className="text-lg font-extrabold text-slate-900 leading-tight">{b.containersPrevFY} / {b.containersCurrFY}</p>
          <p className="text-[10px] text-gray-400 tabular-nums">Qty: {formatNumber(b.qtyMTPrevFY)} / {formatNumber(b.qtyMTCurrFY)} MT</p>
        </div>
        <Stat label="FY Target" value={formatNumber(b.target)} sub="containers" />
        <Stat label="Avg Cycle" value={b.avgCycleDays > 0 ? `${b.avgCycleDays} days` : "—"} sub="between orders" />
      </div>

      {b.varieties.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Qualities buying</p>
          <div className="flex flex-wrap gap-1">
            {b.varieties.map((v) => <span key={v} className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{v}</span>)}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Last 5 orders</p>
        {b.last5Orders.length === 0 ? (
          <p className="text-xs text-gray-400">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-600 uppercase text-[9px] tracking-wide">
                  <th className="px-2 py-1.5 text-left">Date</th>
                  <th className="px-2 py-1.5 text-left">PI</th>
                  <th className="px-2 py-1.5 text-left">Variety</th>
                  <th className="px-2 py-1.5 text-left">Brand</th>
                  <th className="px-2 py-1.5 text-right">Qty MT</th>
                  <th className="px-2 py-1.5 text-right">Rate/MT</th>
                </tr>
              </thead>
              <tbody>
                {b.last5Orders.map((o, i) => (
                  <tr key={i} className={`border-t border-gray-100 ${i % 2 ? "bg-slate-50/50" : ""}`}>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-700">{o.date}</td>
                    <td className="px-2 py-1.5 text-slate-700">{o.piNo}</td>
                    <td className="px-2 py-1.5 text-gray-600">{o.description || o.variety || "—"}</td>
                    <td className="px-2 py-1.5 text-gray-600">{o.brand || "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{formatNumber(o.qtyMT)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{formatNumber(o.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
