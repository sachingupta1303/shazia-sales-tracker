"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { FilterBar, type FilterState } from "@/components/ui/filter-bar"
import { SummaryCard } from "@/components/ui/page-header"
import { StatusBadge, TierBadge, GapCell, AchievementBar, SegmentTag } from "@/components/ui/status-badge"
import { BrandPill } from "@/components/ui/brand-pill"
import { formatNumber } from "@/lib/utils"
import type { PIRecord, UserRole, BuyerSegment } from "@/types"

interface EnrichedPI extends PIRecord {
  segment: BuyerSegment;
  isKeyAccount: boolean;
  canonicalCode: string;
  isNewBuyer: boolean;
}

interface SalesResponse {
  records: EnrichedPI[]
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean }
  summary:    { totalContainers: number; totalMTs: number; uniqueBuyers: number; uniqueCountries: number }
  filterOptions: { countries: string[]; salesPersons: string[]; varieties: string[] }
}

interface Props { userRole?: UserRole; salesPerson?: string }

// ── Columns config ─────────────────────────────────────────────────────────────
const COLUMNS = [
  { key: "piNumber",        label: "PI No.",     mobile: true  },
  { key: "piDate",          label: "PI Date",    mobile: true  },
  { key: "buyerCompanyName",label: "Buyer",      mobile: true  },
  { key: "countries",       label: "Country",    mobile: true  },
  { key: "varieties",       label: "Variety",    mobile: false },
  { key: "brand",           label: "Brand",      mobile: false },
  { key: "description",     label: "Description",mobile: false },
  { key: "totalContainers", label: "Containers", mobile: true  },
  { key: "qtyMTs",          label: "MTs",        mobile: false },
  { key: "salesPerson",     label: "Sales Person",mobile: false},
  { key: "fyWeekNo",        label: "FY Week",    mobile: false },
]

function formatDate(d: string) {
  try {
    const date = new Date(d)
    return date.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })
  } catch { return d }
}

export function SalesClient({ userRole, salesPerson }: Props) {
  const [data,     setData]     = useState<SalesResponse | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState("")
  const [filters,  setFilters]  = useState<FilterState>({})
  const [page,     setPage]     = useState(1)
  const searchRef  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fetchData = useCallback(async (f: FilterState, p: number) => {
    setLoading(true)
    setError("")
    const params = new URLSearchParams()
    if (f.country)     params.set("country",     f.country)
    if (f.salesPerson) params.set("salesPerson", f.salesPerson)
    if (f.variety)     params.set("variety",     f.variety)
    if (f.fyMonth)     params.set("fyMonth",     f.fyMonth)
    if (f.fyQuarter)   params.set("fyQuarter",   f.fyQuarter)
    if (f.fy)          params.set("fy",          f.fy)
    if (f.search)      params.set("search",      f.search)
    params.set("page",  String(p))
    params.set("limit", "10")

    try {
      const res  = await fetch(`/api/sales?${params}`)
      if (!res.ok) throw new Error("Failed")
      setData(await res.json())
    } catch {
      setError("Failed to load sales data.")
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce search
  useEffect(() => {
    clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => {
      setPage(1)
      fetchData(filters, 1)
    }, filters.search ? 400 : 0)
    return () => clearTimeout(searchRef.current)
  }, [filters, fetchData])

  const handleFilterChange = (f: FilterState) => { setFilters(f); setPage(1) }
  const handlePage = (p: number) => { setPage(p); fetchData(filters, p) }

  const isSP = userRole === "SALES_PERSON"

  return (
    <div className="space-y-4">
      {/* Filters */}
      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        options={data?.filterOptions}
        showSearch={true}
        showFY={true}
        showSP={!isSP}
      />

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Total Containers" value={formatNumber(data.summary.totalContainers)} color="bg-green-50 border-green-200" />
          <SummaryCard label="Total MTs"        value={formatNumber(data.summary.totalMTs, 0)}     color="bg-blue-50 border-blue-200" />
          <SummaryCard label="Unique Buyers"    value={data.summary.uniqueBuyers}                  color="bg-purple-50 border-purple-200" />
          <SummaryCard label="Countries"        value={data.summary.uniqueCountries}               color="bg-amber-50 border-amber-200" />
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Table header row */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-700">
            {loading ? "Loading…" : `${data?.pagination.total ?? 0} records`}
          </span>
          {data && (
            <span className="text-xs text-gray-400">
              Page {data.pagination.page} of {data.pagination.totalPages}
            </span>
          )}
        </div>

        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50">{error}</div>
        )}

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && !data ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="px-4 py-3">
                        <div className="h-3 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                data?.records.map((r) => (
                  <tr key={`${r.piNumber}-${r.buyerCode}`} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400 group-hover:text-gray-900">{r.piNumber}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{formatDate(r.piDate)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 font-bold text-gray-800">
                          <SegmentTag segment={r.segment} isKeyAccount={r.isKeyAccount} />
                          <a 
                            href={`/buyers/${encodeURIComponent(r.buyerCode || r.buyerCompanyName)}`}
                            className="hover:text-green-700 transition-colors truncate max-w-[200px]"
                          >
                            {r.buyerCompanyName}
                          </a>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <a 
                        href={`/countries/${encodeURIComponent(r.countries)}`}
                        className="bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hover:bg-blue-100 transition-colors"
                      >
                        {r.countries}
                      </a>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${r.varieties === "BASMATI" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                        {r.varieties}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs max-w-[140px]">
                      <div className="flex items-center gap-1.5">
                        {r.brand && <BrandPill brand={r.brand} />}
                        <span className="text-gray-500 truncate">{r.brand || "–"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 max-w-[160px] truncate text-[10px]">{r.description}</td>
                    <td className="px-4 py-2.5 font-black text-gray-900 text-center tabular-nums">{r.totalContainers}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-center tabular-nums font-medium">{r.qtyMTs?.toFixed(0)}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs font-semibold">
                      <a 
                        href={`/sales-persons/${encodeURIComponent(r.salesPerson)}`}
                        className="hover:text-green-700 transition-colors"
                      >
                        {r.salesPerson}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-gray-400 font-medium">W{r.fyWeekNo}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-100">
          {loading && !data
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 space-y-2 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              ))
            : data?.records.map((r) => (
                <div key={`${r.piNumber}-mobile`} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <SegmentTag segment={r.segment} isKeyAccount={r.isKeyAccount} />
                      <p className="font-bold text-gray-900 text-sm leading-tight truncate">{r.buyerCompanyName}</p>
                    </div>
                    <span className="font-bold text-gray-900 text-sm tabular-nums flex-shrink-0">{r.totalContainers} ctrs</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{r.countries}</span>
                    <span className={`px-2 py-0.5 rounded-full ${r.varieties === "BASMATI" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{r.varieties}</span>
                    <span className="text-gray-400">PI {r.piNumber}</span>
                    <span className="text-gray-400">{formatDate(r.piDate)}</span>
                    <span className="text-gray-400">W{r.fyWeekNo}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    {r.brand && <BrandPill brand={r.brand} />}
                    <span>{r.salesPerson} · {r.brand}</span>
                  </div>
                </div>
              ))
          }
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <button
              onClick={() => handlePage(page - 1)}
              disabled={!data.pagination.hasPrev || loading}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, data.pagination.totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(data.pagination.totalPages - 4, page - 2)) + i
                return (
                  <button
                    key={p}
                    onClick={() => handlePage(p)}
                    className={`w-8 h-8 text-xs rounded-lg transition-colors ${p === page ? "bg-green-600 text-white font-semibold" : "text-gray-600 hover:bg-gray-100"}`}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => handlePage(page + 1)}
              disabled={!data.pagination.hasNext || loading}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
