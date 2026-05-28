"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { FilterBar, type FilterState } from "@/components/ui/filter-bar"
import { SummaryCard } from "@/components/ui/page-header"
import { SegmentTag } from "@/components/ui/status-badge"
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

interface PIGroup {
  piNumber:        string
  products:        EnrichedPI[]
  totalMTs:        number
  containers:      number
  piDate:          string
  buyerCompanyName:string
  buyerCode:       string
  country:         string
  salesPerson:     string
  fyWeekNo:        number
  segment:         BuyerSegment
  isKeyAccount:    boolean
  canonicalCode:   string
}

const COLUMNS = [
  { key: "piNumber",         label: "PI No.",      mobile: true  },
  { key: "piDate",           label: "PI Date",     mobile: true  },
  { key: "buyerCompanyName", label: "Buyer",       mobile: true  },
  { key: "countries",        label: "Country",     mobile: true  },
  { key: "varieties",        label: "Variety",     mobile: false },
  { key: "brand",            label: "Brand",       mobile: false },
  { key: "description",      label: "Description", mobile: false },
  { key: "totalContainers",  label: "Containers",  mobile: true  },
  { key: "qtyMTs",           label: "MTs",         mobile: false },
  { key: "salesPerson",      label: "Sales Person",mobile: false },
  { key: "fyWeekNo",         label: "FY Week",     mobile: false },
]

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  } catch { return d }
}

export function SalesClient({ userRole, salesPerson }: Props) {
  const [data,        setData]        = useState<SalesResponse | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState("")
  const [filters,     setFilters]     = useState<FilterState>({})
  const [page,        setPage]        = useState(1)
  const [expandedPIs, setExpandedPIs] = useState<Set<string>>(new Set())
  const searchRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const togglePI = (pi: string) =>
    setExpandedPIs(prev => {
      const next = new Set(prev)
      next.has(pi) ? next.delete(pi) : next.add(pi)
      return next
    })

  // Reset expanded rows whenever the dataset changes
  useEffect(() => { setExpandedPIs(new Set()) }, [data])

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
    params.set("limit", "200")
    try {
      const res = await fetch(`/api/sales?${params}`)
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

  // Group flat product records by PI number
  const groupedRecords = useMemo<PIGroup[]>(() => {
    if (!data?.records) return []
    const map = new Map<string, EnrichedPI[]>()
    for (const r of data.records) {
      if (!map.has(r.piNumber)) map.set(r.piNumber, [])
      map.get(r.piNumber)!.push(r)
    }
    return Array.from(map.entries()).map(([piNumber, products]) => ({
      piNumber,
      products,
      totalMTs:         products.reduce((s, p) => s + p.qtyMTs, 0),
      containers:       products[0].totalContainers,
      piDate:           products[0].piDate,
      buyerCompanyName: products[0].buyerCompanyName,
      buyerCode:        products[0].buyerCode || "",
      country:          products[0].countries,
      salesPerson:      products[0].salesPerson,
      fyWeekNo:         products[0].fyWeekNo,
      segment:          products[0].segment,
      isKeyAccount:     products[0].isKeyAccount,
      canonicalCode:    products[0].canonicalCode,
    }))
  }, [data?.records])

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
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-700">
            {loading
              ? "Loading…"
              : `${groupedRecords.length} PIs · ${data?.pagination.total ?? 0} products`}
          </span>
          {data && data.pagination.totalPages > 1 && (
            <span className="text-xs text-gray-400">
              Page {data.pagination.page} of {data.pagination.totalPages}
            </span>
          )}
        </div>

        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50">{error}</div>
        )}

        {/* ── Desktop table ─────────────────────────────────────────────── */}
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
            <tbody>
              {loading && !data ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="px-4 py-3">
                        <div className="h-3 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                groupedRecords.map((group) => {
                  const isExpanded = expandedPIs.has(group.piNumber)
                  return (
                    <React.Fragment key={group.piNumber}>

                      {/* ── PI summary row (collapsed) ──────────────────── */}
                      <tr
                        onClick={() => togglePI(group.piNumber)}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer select-none"
                      >
                        {/* PI No. + expand arrow */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-block text-[9px] text-gray-400 transition-transform duration-150 ${isExpanded ? "rotate-90" : "rotate-0"}`}
                            >
                              ▶
                            </span>
                            <span className="font-mono text-xs text-gray-500 font-semibold">{group.piNumber}</span>
                          </div>
                        </td>

                        {/* PI Date */}
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                          {formatDate(group.piDate)}
                        </td>

                        {/* Buyer */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 font-bold text-gray-800">
                            <SegmentTag segment={group.segment} isKeyAccount={group.isKeyAccount} />
                            <a
                              href={`/buyers/${encodeURIComponent(group.canonicalCode)}`}
                              className="hover:text-green-700 transition-colors truncate max-w-[200px]"
                              onClick={e => e.stopPropagation()}
                            >
                              {group.buyerCompanyName}
                            </a>
                          </div>
                        </td>

                        {/* Country */}
                        <td className="px-4 py-2.5">
                          <a
                            href={`/countries/${encodeURIComponent(group.country)}`}
                            className="bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hover:bg-blue-100 transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            {group.country}
                          </a>
                        </td>

                        {/* Variety – show product count when collapsed */}
                        <td className="px-4 py-2.5 text-gray-400 text-[11px]">
                          {group.products.length} product{group.products.length > 1 ? "s" : ""}
                        </td>

                        {/* Brand / Description – empty when collapsed */}
                        <td className="px-4 py-2.5" />
                        <td className="px-4 py-2.5" />

                        {/* Containers (PI-level, same for all products) */}
                        <td className="px-4 py-2.5 font-black text-gray-900 text-center tabular-nums">
                          {group.containers}
                        </td>

                        {/* MTs total */}
                        <td className="px-4 py-2.5 text-gray-700 text-center tabular-nums font-bold">
                          {group.totalMTs.toFixed(0)}
                        </td>

                        {/* Sales Person */}
                        <td className="px-4 py-2.5 text-gray-600 text-xs font-semibold">
                          <a
                            href={`/sales-persons/${encodeURIComponent(group.salesPerson)}`}
                            className="hover:text-green-700 transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            {group.salesPerson}
                          </a>
                        </td>

                        {/* FY Week */}
                        <td className="px-4 py-2.5 text-center text-xs text-gray-400 font-medium">
                          W{group.fyWeekNo}
                        </td>
                      </tr>

                      {/* ── Expanded: individual product rows ───────────── */}
                      {isExpanded && group.products.map((product, idx) => (
                        <tr key={`${group.piNumber}-p${idx}`} className="bg-slate-50/70 border-b border-slate-100">
                          <td className="pl-9 pr-4 py-2 text-gray-300 text-xs">└</td>
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2" />

                          {/* Variety */}
                          <td className="px-4 py-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${product.varieties === "BASMATI" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                              {product.varieties}
                            </span>
                          </td>

                          {/* Brand */}
                          <td className="px-4 py-2 text-xs max-w-[140px]">
                            <div className="flex items-center gap-1.5">
                              {product.brand && <BrandPill brand={product.brand} />}
                              <span className="text-gray-500 truncate">{product.brand || "–"}</span>
                            </div>
                          </td>

                          {/* Description */}
                          <td className="px-4 py-2 text-gray-400 max-w-[160px] truncate text-[10px]">
                            {product.description}
                          </td>

                          {/* Containers (same value repeated per product) */}
                          <td className="px-4 py-2 text-center text-gray-400 text-xs tabular-nums">
                            {product.totalContainers}
                          </td>

                          {/* Individual MTs */}
                          <td className="px-4 py-2 text-center text-gray-600 tabular-nums font-medium">
                            {product.qtyMTs?.toFixed(0)}
                          </td>

                          <td className="px-4 py-2" />
                          <td className="px-4 py-2" />
                        </tr>
                      ))}

                      {/* ── Expanded: totals row ─────────────────────────── */}
                      {isExpanded && (
                        <tr className="bg-slate-100 border-b-2 border-slate-300">
                          <td colSpan={7} className="px-4 py-2 text-right text-xs font-semibold text-gray-500 pr-6">
                            Total
                          </td>
                          {/* Containers – same value, not summed */}
                          <td className="px-4 py-2 text-center font-black text-gray-900 tabular-nums">
                            {group.containers}
                          </td>
                          {/* MTs – summed */}
                          <td className="px-4 py-2 text-center font-bold text-blue-700 tabular-nums text-sm">
                            {group.totalMTs.toFixed(0)}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      )}

                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Mobile cards ──────────────────────────────────────────────── */}
        <div className="md:hidden divide-y divide-gray-100">
          {loading && !data
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 space-y-2 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              ))
            : groupedRecords.map((group) => {
                const isExpanded = expandedPIs.has(group.piNumber)
                return (
                  <div key={`${group.piNumber}-mobile`}>
                    {/* PI header card */}
                    <div
                      className="p-4 space-y-2 cursor-pointer select-none"
                      onClick={() => togglePI(group.piNumber)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className={`inline-block text-[9px] text-gray-400 transition-transform duration-150 ${isExpanded ? "rotate-90" : "rotate-0"}`}>▶</span>
                          <SegmentTag segment={group.segment} isKeyAccount={group.isKeyAccount} />
                          <p className="font-bold text-gray-900 text-sm leading-tight truncate">{group.buyerCompanyName}</p>
                        </div>
                        <span className="font-bold text-gray-900 text-sm tabular-nums flex-shrink-0">{group.containers} ctrs</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{group.country}</span>
                        <span className="text-gray-400">PI {group.piNumber}</span>
                        <span className="text-gray-400">{formatDate(group.piDate)}</span>
                        <span className="text-gray-400">{group.products.length} product{group.products.length > 1 ? "s" : ""}</span>
                        <span className="font-semibold text-blue-600">{group.totalMTs.toFixed(0)} MTs</span>
                      </div>
                    </div>

                    {/* Expanded product list */}
                    {isExpanded && (
                      <div className="bg-slate-50 border-t border-slate-200 divide-y divide-slate-100">
                        {group.products.map((product, idx) => (
                          <div key={idx} className="px-6 py-2.5 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${product.varieties === "BASMATI" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                                  {product.varieties}
                                </span>
                                {product.brand && <BrandPill brand={product.brand} />}
                                <span className="text-gray-500">{product.brand}</span>
                              </div>
                              <span className="text-gray-600 font-medium tabular-nums flex-shrink-0">
                                {product.qtyMTs?.toFixed(0)} MTs
                              </span>
                            </div>
                            <p className="text-gray-400 mt-1 truncate">{product.description}</p>
                          </div>
                        ))}
                        {/* Total row */}
                        <div className="px-6 py-2.5 flex items-center justify-between text-xs font-semibold bg-slate-100">
                          <span className="text-gray-500">Total</span>
                          <div className="flex items-center gap-4">
                            <span className="text-gray-900">{group.containers} ctrs</span>
                            <span className="text-blue-700">{group.totalMTs.toFixed(0)} MTs</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
          }
        </div>

        {/* Pagination (only shown when data spans multiple pages) */}
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
