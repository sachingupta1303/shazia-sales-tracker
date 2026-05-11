"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  SummaryCard, 
  PageHeader 
} from "@/components/ui/page-header"
import { 
  StatusBadge, 
  GapCell, 
  AchievementBar,
  SegmentTag
} from "@/components/ui/status-badge"
import { formatNumber } from "@/lib/utils"
import type { PerformanceStatus, BuyerSegment, PIRecord } from "@/types"

interface SalesPersonData {
  salesPerson: {
    name: string
    performance: {
      target: number
      actual: number
      prevActual: number
      targetDue: number
      gap: number
      achievementPct: number
      status: PerformanceStatus
    }
  }
  summary: {
    totalBuyers: number
    vipCount: number
    strategicCount: number
    nbdCount: number
    otherCount: number
  }
  buyers: any[]
  countries: any[]
  piHistory: PIRecord[]
  meta: { currentFY: string; currentWeek: number }
}

interface Props {
  salesPersonName: string
  userRole: string
  userName: string
}

export function SalesPersonWorkspaceClient({ salesPersonName }: Props) {
  const router = useRouter()
  const [data, setData] = useState<SalesPersonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<"buyers" | "history" | "countries">("buyers")

  useEffect(() => {
    async function fetchWorkspace() {
      try {
        const res = await fetch(`/api/sales-persons/${encodeURIComponent(salesPersonName)}`)
        if (!res.ok) throw new Error("Failed to load workspace")
        setData(await res.json())
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchWorkspace()
  }, [salesPersonName])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading Workspace...</div>
  if (error || !data) return <div className="bg-red-50 text-red-600 p-6 rounded-2xl">{error || "Data not found"}</div>

  const { salesPerson, summary, buyers, countries, piHistory, meta } = data

  return (
    <div className="space-y-6">
      <PageHeader 
        title={salesPerson.name}
        subtitle={`Sales Person Workspace • FY ${meta.currentFY} (Week ${meta.currentWeek})`}
        onBack={() => router.back()}
      />

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard 
          label="Annual Target" 
          value={formatNumber(salesPerson.performance.target, 0)} 
          sub="Containers"
          color="bg-white border-gray-200"
        />
        <SummaryCard 
          label="Actual Sales" 
          value={formatNumber(salesPerson.performance.actual)} 
          sub={`${salesPerson.performance.achievementPct}% Achieved`}
          color="bg-green-50 border-green-200"
        />
        <SummaryCard 
          label="Target Due" 
          value={formatNumber(salesPerson.performance.targetDue)} 
          sub={`Till W${meta.currentWeek}`}
          color="bg-blue-50 border-blue-200"
        />
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Gap to Target</span>
          <div className="mt-2 flex items-baseline gap-2">
            <GapCell gap={salesPerson.performance.gap} className="text-2xl font-black" />
          </div>
          <span className="text-[10px] text-gray-400 font-medium">Auto Status:</span>
          <StatusBadge status={salesPerson.performance.status} />
        </div>
        <SummaryCard 
          label="Prev Year" 
          value={formatNumber(salesPerson.performance.prevActual)} 
          sub="Historical"
          color="bg-gray-50 border-gray-200"
        />
      </div>

      {/* Portfolio Summary Card */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 grid grid-cols-2 md:grid-cols-5 gap-6">
          <div className="flex flex-col">
            <span className="text-gray-400 text-[10px] uppercase font-black tracking-[0.2em] mb-1">Total Buyers</span>
            <span className="text-3xl font-black">{summary.totalBuyers}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-violet-400 text-[10px] uppercase font-black tracking-[0.2em] mb-1">VIP Accounts</span>
            <div className="flex items-center gap-2">
               <span className="text-3xl font-black text-violet-100">{summary.vipCount}</span>
               <span className="text-violet-400 text-xl">★</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-orange-400 text-[10px] uppercase font-black tracking-[0.2em] mb-1">Strategic</span>
            <div className="flex items-center gap-2">
               <span className="text-3xl font-black text-orange-100">{summary.strategicCount}</span>
               <span className="text-orange-400 text-xl">★</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-emerald-400 text-[10px] uppercase font-black tracking-[0.2em] mb-1">New Biz (NBD)</span>
            <span className="text-3xl font-black text-emerald-100">{summary.nbdCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-gray-400 text-[10px] uppercase font-black tracking-[0.2em] mb-1">Other Clients</span>
            <span className="text-3xl font-black text-gray-200">{summary.otherCount}</span>
          </div>
        </div>
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-green-500/10 rounded-full -ml-24 -mb-24 blur-3xl" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-px">
        {[
          { id: "buyers", label: "Client Portfolio", icon: "👤" },
          { id: "history", label: "Order History", icon: "📋" },
          { id: "countries", label: "Market Distribution", icon: "🌍" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-6 py-3 text-sm font-bold flex items-center gap-2 transition-all border-b-2 ${
              tab === t.id 
                ? "border-green-600 text-green-700 bg-green-50/50 rounded-t-xl" 
                : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden min-h-[400px]">
        {tab === "buyers" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Buyer Name</th>
                  <th className="text-left px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Country</th>
                  <th className="text-center px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Segment</th>
                  <th className="text-center px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Target</th>
                  <th className="text-center px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Actual</th>
                  <th className="text-center px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Achievement</th>
                  <th className="text-center px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {buyers.map((b) => (
                  <tr key={b.code} className="hover:bg-green-50/30 transition-colors group cursor-pointer" onClick={() => router.push(`/buyers/${encodeURIComponent(b.code)}`)}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <SegmentTag segment={b.segment} isKeyAccount={b.isKeyAccount} />
                        <span className="font-bold text-gray-900 group-hover:text-green-700">{b.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{b.country}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        b.segment === "VIP" ? "bg-violet-100 text-violet-700" :
                        b.segment === "STRATEGIC" ? "bg-orange-100 text-orange-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {b.segment}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center tabular-nums text-gray-400">{formatNumber(b.target, 0)}</td>
                    <td className="px-6 py-4 text-center tabular-nums font-black text-gray-900">{formatNumber(b.actual)}</td>
                    <td className="px-6 py-4 min-w-[140px]">
                      <AchievementBar pct={b.achievementPct} status={b.status} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "history" && (
          <div className="p-4 space-y-4">
             <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">PI No</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Buyer</th>
                    <th className="text-center px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Variety</th>
                    <th className="text-center px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Qty (MT)</th>
                    <th className="text-center px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Containers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {piHistory.map((pi) => (
                    <tr key={pi.piNumber} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{pi.piNumber}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 font-medium">{new Date(pi.piDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-4 py-3 font-bold text-gray-800">{pi.buyerCompanyName}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${pi.varieties === "BASMATI" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                          {pi.varieties}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-gray-600 font-medium">{pi.qtyMTs.toFixed(1)}</td>
                      <td className="px-4 py-3 text-center tabular-nums font-black text-gray-900">{pi.totalContainers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "countries" && (
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {countries.map(c => (
               <div key={c.country} className="bg-gray-50 p-6 rounded-3xl border border-gray-100 hover:border-green-200 hover:bg-white transition-all group cursor-pointer" onClick={() => router.push(`/countries/${encodeURIComponent(c.country)}`)}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                       <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Market</span>
                       <h3 className="text-xl font-black text-gray-900 group-hover:text-green-700">{c.country}</h3>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs">
                       <span className="text-gray-500">Target</span>
                       <span className="font-bold text-gray-800 tabular-nums">{formatNumber(c.target, 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                       <span className="text-gray-500">Actual</span>
                       <span className="font-black text-gray-900 tabular-nums">{formatNumber(c.actual)}</span>
                    </div>
                    <AchievementBar pct={c.achievementPct} status={c.status} />
                  </div>
               </div>
             ))}
          </div>
        )}
      </div>
    </div>
  )
}
