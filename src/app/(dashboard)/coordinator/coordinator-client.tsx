"use client"

import { useState, useEffect, useMemo } from "react"
import { formatNumber } from "@/lib/utils"

interface OrderLine { date: string; piNo: string; brand: string; variety: string; qtyMT: number; rate: number }
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

export function CoordinatorClient() {
  const [data, setData]       = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState("")
  const [search, setSearch]   = useState("")
  const [coord, setCoord]     = useState("")
  const [sp, setSP]           = useState("")
  const [selected, setSelected] = useState<Buyer | null>(null)

  useEffect(() => {
    fetch("/api/coordinator")
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setErr("Failed to load."))
      .finally(() => setLoading(false))
  }, [])

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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* Left — buyer list */}
        <div className="lg:col-span-3 bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] uppercase tracking-wide">
                <th className="px-3 py-2.5 text-left">Client</th>
                <th className="px-3 py-2.5 text-left">Country</th>
                <th className="px-3 py-2.5 text-left">Coordinator</th>
                <th className="px-3 py-2.5 text-left">Sales Person</th>
                <th className="px-3 py-2.5 text-right">Ctrs {fy.prevFY.slice(0,4)}/{fy.currFY.slice(2)}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b, i) => (
                <tr key={`${b.buyerName}-${i}`}
                  onClick={() => setSelected(b)}
                  className={`border-b border-gray-100 cursor-pointer ${selected?.buyerName === b.buyerName ? "bg-green-50" : i % 2 ? "bg-slate-50/50" : ""} hover:bg-green-50/60`}>
                  <td className="px-3 py-2 font-semibold text-slate-900">{b.buyerName}
                    <span className={`ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded ${TIER_STYLE[b.tier] ?? TIER_STYLE.OTHERS}`}>{b.tier === "OTHERS" ? "—" : b.tier.replace("TIER", "T")}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{b.country}</td>
                  <td className="px-3 py-2 text-gray-600">{b.salesCoordinator || "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{b.salesPerson || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{b.containersPrevFY} / {b.containersCurrFY}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right — detail */}
        <div className="lg:col-span-2">
          {selected ? <BuyerDetail b={selected} fy={fy} /> : (
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-sm text-gray-400 text-center">
              Kisi buyer pe click karo — poori detail yahan aayegi
            </div>
          )}
        </div>
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

function BuyerDetail({ b, fy }: { b: Buyer; fy: { currFY: string; prevFY: string } }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 sticky top-4">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-bold text-slate-900">{b.buyerName}</h3>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TIER_STYLE[b.tier] ?? TIER_STYLE.OTHERS}`}>{b.tier === "OTHERS" ? "Others" : b.tier.replace("TIER", "Tier ")}</span>
        </div>
        <p className="text-xs text-gray-500">{b.country}</p>
        <p className="text-xs text-gray-500 mt-1">Coordinator: <b className="text-slate-700">{b.salesCoordinator || "—"}</b> · Sales: <b className="text-slate-700">{b.salesPerson || "—"}</b></p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label={`Orders ${fy.prevFY}`} value={String(b.ordersPrevFY)} />
        <Stat label={`Orders ${fy.currFY}`} value={String(b.ordersCurrFY)} />
        <Stat label="Containers" value={`${b.containersPrevFY} / ${b.containersCurrFY}`} sub={`${fy.prevFY} / ${fy.currFY}`} />
        <Stat label="Qty MT" value={`${formatNumber(b.qtyMTPrevFY)} / ${formatNumber(b.qtyMTCurrFY)}`} sub={`${fy.prevFY} / ${fy.currFY}`} />
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
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Last 5 orders · Date · PI · Brand · Variety · Qty MT · Rate/MT</p>
        <div className="space-y-1.5">
          {b.last5Orders.length === 0 && <p className="text-xs text-gray-400">No orders yet.</p>}
          {b.last5Orders.map((o, i) => (
            <div key={i} className="text-[11px] border border-gray-100 rounded-lg p-2 bg-slate-50/50">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-800">{o.date} · PI {o.piNo}</span>
                <span className="font-bold text-slate-900">{o.qtyMT} MT · ₹/$ {o.rate}</span>
              </div>
              <div className="text-gray-500 mt-0.5">{o.brand || "—"} · {o.variety || "—"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
