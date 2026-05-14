"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { formatNumber, statusBg, cn } from "@/lib/utils"
import { BrandPill } from "@/components/ui/brand-pill"
import { StatusBadge, SegmentTag } from "@/components/ui/status-badge"
import type { UserRole, PerformanceStatus, PIRecord } from "@/types"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { 
  setGlobalFilterSP, setGlobalFilterCountry, setVariety, setFYMonth, setFYWeek, setFYQuarter 
} from "@/store/slices/uiSlice"

interface KPIs {
  previousYearContainers: number
  targetContainers: number
  targetDueTillWeek: number
  actualTillWeek: number
  gaping: number
  currentFYWeek: number
  status: PerformanceStatus
  achievementPercent: number
}

interface CountryRow {
  country: string
  target: number
  targetDue: number
  actual: number
  prevYear: number
  gap: number
  status: PerformanceStatus
}

interface DashboardData {
  kpis: KPIs
  countryBreakdown: CountryRow[]
  filterOptions: { countries: string[]; salesPersons: string[] }
  meta: { currentFY: string; previousFY: string; currentWeek: number }
}

interface Props {
  userRole?: UserRole
  salesPerson?: string
}

function KPICard({
  label,
  value,
  subLabel,
  color,
}: {
  label: string
  value: string | number
  subLabel?: string
  color?: string
}) {
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${color ?? "bg-white border-gray-200"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
        {label}
      </p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {subLabel && <p className="text-xs text-gray-400 mt-1">{subLabel}</p>}
    </div>
  )
}

const STATUS_CARD_COLOR: Record<PerformanceStatus, string> = {
  ACHIEVED:  "bg-green-50 border-green-200",
  MISSED:    "bg-red-50 border-red-200",
  ON_TRACK:  "bg-blue-50 border-blue-200",
  NO_TARGET: "bg-gray-50 border-gray-200",
}

export function DashboardClient({ userRole, salesPerson }: Props) {
  const router = useRouter()
  const dispatch = useAppDispatch()
  
  // Select specific properties to avoid unnecessary re-renders when other UI state changes
  const globalFilterSP = useAppSelector(state => state.ui.globalFilterSP)
  const globalFilterCountry = useAppSelector(state => state.ui.globalFilterCountry)
  const variety = useAppSelector(state => state.ui.variety)
  const fyMonth = useAppSelector(state => state.ui.fyMonth)
  const fyWeek = useAppSelector(state => state.ui.fyWeek)
  const fyQuarter = useAppSelector(state => state.ui.fyQuarter)

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const periodActive = !!(fyMonth || fyWeek || fyQuarter)

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<PerformanceStatus | "">("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    setPage(1)
    const params = new URLSearchParams()
    if (globalFilterCountry) params.set("country",       globalFilterCountry)
    if (globalFilterSP)      params.set("salesPerson",   globalFilterSP)
    if (variety)             params.set("variety",       variety)
    if (fyMonth)             params.set("fyMonth",       fyMonth)
    if (fyWeek)              params.set("fyWeek",        fyWeek)
    if (fyQuarter)           params.set("fyQuarter",     fyQuarter)

    try {
      const res = await fetch(`/api/dashboard?${params}`)
      if (!res.ok) throw new Error("Failed to load dashboard data.")
      const d = await res.json()
      setData(d)
    } catch (err: any) {
      setError(err.message || "An error occurred.")
    } finally {
      setLoading(false)
    }
  }, [globalFilterCountry, globalFilterSP, variety, fyMonth, fyWeek, fyQuarter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) return <DashboardSkeleton />
  if (error)   return <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm">{error}</div>
  if (!data)   return null

  const { kpis, countryBreakdown, filterOptions, meta } = data

  const filteredCountryBreakdown = statusFilter 
    ? countryBreakdown.filter(c => c.status === statusFilter)
    : countryBreakdown

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filters</span>

          {/* Country */}
          <select
            value={globalFilterCountry}
            onChange={(e) => dispatch(setGlobalFilterCountry(e.target.value))}
            className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Countries</option>
            {filterOptions.countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Sales Person — hidden for sales_person role */}
          {userRole !== "SALES_PERSON" && (
            <select
              value={globalFilterSP}
              onChange={(e) => dispatch(setGlobalFilterSP(e.target.value))}
              className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All Sales Persons</option>
              {filterOptions.salesPersons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {/* Variety */}
          <select
            value={variety}
            onChange={(e) => dispatch(setVariety(e.target.value))}
            className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Varieties</option>
            <option value="BASMATI">Basmati</option>
            <option value="NON BASMATI">Non Basmati</option>
          </select>

          {/* Month */}
          <select
            value={fyMonth}
            onChange={(e) => { 
              dispatch(setFYMonth(e.target.value))
              if (e.target.value) { 
                dispatch(setFYWeek(""))
                dispatch(setFYQuarter(""))
              } 
            }}
            className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Months</option>
            {["April","May","June","July","August","September","October","November","December","January","February","March"].map((m, i) => (
              <option key={m} value={String(i + 1)}>{m}</option>
            ))}
          </select>

          {/* Week */}
          <select
            value={fyWeek}
            onChange={(e) => { 
              dispatch(setFYWeek(e.target.value))
              if (e.target.value) { 
                dispatch(setFYMonth(""))
                dispatch(setFYQuarter(""))
              } 
            }}
            className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Weeks</option>
            {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
              <option key={w} value={String(w)}>Week {w}</option>
            ))}
          </select>

          {/* Quarter */}
          <select
            value={fyQuarter}
            onChange={(e) => { 
              dispatch(setFYQuarter(e.target.value))
              if (e.target.value) { 
                dispatch(setFYMonth(""))
                dispatch(setFYWeek(""))
              } 
            }}
            className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Quarters</option>
            <option value="1">Q1 (Apr–Jun)</option>
            <option value="2">Q2 (Jul–Sep)</option>
            <option value="3">Q3 (Oct–Dec)</option>
            <option value="4">Q4 (Jan–Mar)</option>
          </select>

          {(globalFilterCountry || globalFilterSP || variety || fyMonth || fyWeek || fyQuarter || statusFilter) && (
            <button
              onClick={() => { 
                dispatch(setGlobalFilterCountry(""))
                dispatch(setGlobalFilterSP(""))
                dispatch(setVariety(""))
                dispatch(setFYMonth(""))
                dispatch(setFYWeek(""))
                dispatch(setFYQuarter(""))
                setStatusFilter("")
              }}
              className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
            >
              Clear filters
            </button>
          )}

          <div className="ml-auto text-xs text-gray-400">
            Week {meta.currentWeek} · {meta.currentFY}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <KPICard
          label="Previous Year"
          value={formatNumber(kpis.previousYearContainers)}
          subLabel={`FY ${meta.previousFY}`}
          color="bg-amber-50 border-amber-200"
        />
        <KPICard
          label="Target (Annual)"
          value={formatNumber(kpis.targetContainers, 0)}
          subLabel="FY 2026-27"
          color="bg-purple-50 border-purple-200"
        />
        <KPICard
          label="Target Due"
          value={formatNumber(kpis.targetDueTillWeek)}
          subLabel={`Till Week ${kpis.currentFYWeek}`}
          color="bg-orange-50 border-orange-200"
        />
        <KPICard
          label="Actual Till Week"
          value={formatNumber(kpis.actualTillWeek)}
          subLabel={`W${kpis.currentFYWeek} · ${kpis.achievementPercent}% of due`}
          color="bg-green-50 border-green-200"
        />
        <KPICard
          label="Gap"
          value={(kpis.gaping >= 0 ? "+" : "") + formatNumber(kpis.gaping)}
          subLabel={kpis.gaping >= 0 ? "Ahead of target" : "Behind target"}
          color={kpis.gaping >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}
        />
        <KPICard
          label="Current Week"
          value={`Week ${kpis.currentFYWeek}`}
          subLabel="FY Week"
          color="bg-blue-50 border-blue-200"
        />
        <div 
          onClick={() => setStatusFilter(prev => prev === kpis.status ? "" : kpis.status)}
          className={`rounded-xl border p-5 shadow-sm cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] ${STATUS_CARD_COLOR[kpis.status]} ${statusFilter === kpis.status ? "ring-2 ring-offset-2 ring-gray-400" : ""}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Status</p>
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold border ${statusBg(kpis.status)}`}>
            {kpis.status === "ACHIEVED" ? "✅ Achieved" : kpis.status === "MISSED" ? "❌ Missed" : kpis.status === "ON_TRACK" ? "🔵 On Track" : "—"}
          </span>
          <p className="text-[10px] text-gray-400 mt-2 font-medium">Click to filter table</p>
        </div>
      </div>

      {/* Country Breakdown Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Country-wise Performance</h2>
            {statusFilter && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${statusBg(statusFilter)}`}>
                Filtering: {statusFilter}
                <button onClick={() => setStatusFilter("")} className="ml-1 hover:text-red-600">✕</button>
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 font-medium italic">Click status badge to filter</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Country</th>
                <th className="text-right px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Target</th>
                <th className="text-right px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actual</th>
                <th className="text-right px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Gap</th>
                <th className="text-center px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredCountryBreakdown.map((c) => (
                <tr 
                  key={c.country} 
                  className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                  onClick={() => router.push(`/countries/${encodeURIComponent(c.country)}`)}
                >
                  <td className="px-5 py-3.5 font-bold text-gray-800 group-hover:text-blue-600 flex items-center gap-2">
                    {c.country}
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400">→</span>
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-gray-500 font-medium">{formatNumber(c.target, 0)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums font-black text-gray-900">{formatNumber(c.actual, 1)}</td>
                  <td className={`px-5 py-3.5 text-right tabular-nums font-bold ${c.gap >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {c.gap >= 0 ? "+" : ""}{formatNumber(c.gap, 1)}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        setStatusFilter(prev => prev === c.status ? "" : c.status)
                      }}
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black border transition-all hover:scale-110 active:scale-95 ${statusBg(c.status)}`}
                    >
                      {c.status}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {countryBreakdown.length > 0 && (() => {
              const totals = countryBreakdown.reduce(
                (acc, r) => ({
                  target:    acc.target    + r.target,
                  actual:    acc.actual    + r.actual,
                  gap:       acc.gap       + r.gap,
                }), { target: 0, actual: 0, gap: 0 }
              )
              return (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                    <td className="px-5 py-3 text-gray-800 uppercase text-xs tracking-wide">Grand Total</td>
                    <td className="px-5 py-3 text-right text-gray-800 tabular-nums">{formatNumber(totals.target, 0)}</td>
                    <td className="px-5 py-3 text-right text-gray-900 tabular-nums">{formatNumber(totals.actual, 1)}</td>
                    <td className={`px-5 py-3 text-right tabular-nums ${totals.gap >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {(totals.gap >= 0 ? "+" : "") + formatNumber(totals.gap, 1)}
                    </td>
                    <td className="px-5 py-3" />
                  </tr>
                </tfoot>
              )
            })()}
          </table>
        </div>
        {countryBreakdown.length > 10 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
            >← Prev</button>
            <span className="text-xs text-gray-500">
              Page {page} of {Math.ceil(countryBreakdown.length / 10)}
            </span>
            <button
              onClick={() => setPage(p => Math.min(Math.ceil(countryBreakdown.length / 10), p + 1))}
              disabled={page === Math.ceil(countryBreakdown.length / 10)}
              className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
            >Next →</button>
          </div>
        )}
      </div>

      {/* PI-level drilldown — visible when any period filter is active */}
      {periodActive && (
        <PIDrilldownPanel
          country={globalFilterCountry}
          salesPerson={globalFilterSP}
          variety={variety}
          fyMonth={fyMonth}
          fyWeek={fyWeek}
          fyQuarter={fyQuarter}
        />
      )}
    </div>
  )
}

// ── PI-level drilldown panel ─────────────────────────────────────────────────
interface PIDrilldownProps {
  country?:     string
  salesPerson?: string
  variety?:     string
  fyMonth?:     string
  fyWeek?:      string
  fyQuarter?:   string
}

function PIDrilldownPanel(props: PIDrilldownProps) {
  const [records, setRecords] = useState<PIRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState("")
  const [page,    setPage]    = useState(1)
  const [total,   setTotal]   = useState(0)
  const [collapsed, setCollapsed] = useState(false)

  const periodLabel = props.fyMonth
    ? `Month ${props.fyMonth}`
    : props.fyWeek
    ? `Week ${props.fyWeek}`
    : props.fyQuarter
    ? `Q${props.fyQuarter}`
    : ""

  useEffect(() => {
    setLoading(true); setError("")
    const params = new URLSearchParams()
    if (props.country)     params.set("country",     props.country)
    if (props.salesPerson) params.set("salesPerson", props.salesPerson)
    if (props.variety)     params.set("variety",     props.variety)
    if (props.fyMonth)     params.set("fyMonth",     props.fyMonth)
    if (props.fyWeek)      params.set("fyWeek",      props.fyWeek)
    if (props.fyQuarter)   params.set("fyQuarter",   props.fyQuarter)
    params.set("page", String(page))
    params.set("limit", "10")

    fetch(`/api/sales?${params}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => { setRecords(d.records ?? []); setTotal(d.pagination?.total ?? 0) })
      .catch(() => setError("Failed to load PI details."))
      .finally(() => setLoading(false))
  }, [props.country, props.salesPerson, props.variety, props.fyMonth, props.fyWeek, props.fyQuarter, page])

  // Compute totals across the current page
  const totals = records.reduce(
    (acc, r) => ({
      containers: acc.containers  + (r.totalContainers ?? 0),
      amount:     acc.amount      + (r.totalAmount     ?? 0),
    }), { containers: 0, amount: 0 }
  )

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-800">📋 PI-level Details · {periodLabel}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? "Loading…" : `${total} PIs match the active period filter${total > 50 ? " · showing first 50 (paginate below)" : ""}`}
          </p>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200"
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {!collapsed && (
        <>
          {error && <div className="p-4 text-sm text-red-600 bg-red-50">{error}</div>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {["#","PI No.","PI Date","Buyer","Country","Brand","Variety","Containers","Rate","Total Amount","Sales Person"].map((h) => (
                    <th key={h} className={cn("px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap", ["Containers","Rate","Total Amount"].includes(h) ? "text-center" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 11 }).map((_, j) => (
                        <td key={j} className="px-3 py-2.5"><div className="h-3 bg-gray-100 rounded animate-pulse" /></td>
                      ))}</tr>
                    ))
                  : records.map((r, i) => (
                      <tr key={`${r.piNumber}-${i}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2.5 text-gray-400 tabular-nums">{(page - 1) * 10 + i + 1}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.piNumber}</td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.piDate}</td>
                        <td className="px-3 py-2.5 font-bold text-gray-800">
                          <div className="flex items-center gap-1.5">
                            <SegmentTag segment={r.segment} isKeyAccount={r.isKeyAccount} />
                            <span className="truncate max-w-[150px]">{r.buyerCompanyName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 text-xs">{r.countries}</td>
                        <td className="px-3 py-2.5 text-xs max-w-[140px]">
                          <div className="flex items-center gap-1.5">
                            {r.brand && <BrandPill brand={r.brand} />}
                            <span className="text-gray-600 truncate">{r.brand || "–"}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.varieties === "BASMATI" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                            {r.varieties}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900">{r.totalContainers}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-600 text-xs">{r.rate ? formatNumber(r.rate, 0) : "–"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 text-xs">{r.totalAmount ? formatNumber(r.totalAmount, 0) : "–"}</td>
                        <td className="px-3 py-2.5 text-gray-600 text-xs">{r.salesPerson}</td>
                      </tr>
                    ))
                }
              </tbody>
              {!loading && records.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 text-gray-800 uppercase text-xs tracking-wide" colSpan={6}>
                      Page Total ({records.length} PIs)
                    </td>
                    <td className="px-3 py-3 text-right text-gray-900 tabular-nums">{totals.containers}</td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 text-right text-gray-700 tabular-nums">{formatNumber(totals.amount, 0)}</td>
                    <td className="px-3 py-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Pagination */}
          {total > 10 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setPage(page - 1)} disabled={page === 1 || loading}
                className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
              >← Prev</button>
              <span className="text-xs text-gray-500">
                Page {page} of {Math.ceil(total / 10)}
                <span className="ml-2 text-gray-400">({total} records · 10/page)</span>
              </span>
              <button
                onClick={() => setPage(page + 1)} disabled={page >= Math.ceil(total / 10) || loading}
                className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
              >Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-16 bg-gray-100 rounded-xl" />
      <div className="grid grid-cols-7 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-28 bg-gray-100 rounded-xl" />
        ))}
      </div>
      <div className="h-80 bg-gray-100 rounded-xl" />
    </div>
  )
}
