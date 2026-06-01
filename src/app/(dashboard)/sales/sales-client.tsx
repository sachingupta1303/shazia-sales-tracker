"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { FilterBar, type FilterState } from "@/components/ui/filter-bar"
import { SummaryCard } from "@/components/ui/page-header"
import { SegmentTag } from "@/components/ui/status-badge"
import { BrandPill } from "@/components/ui/brand-pill"
import { formatNumber } from "@/lib/utils"
import type { PIRecord, UserRole, BuyerSegment } from "@/types"

// ── Column resize helpers ─────────────────────────────────────────────────────
const DEFAULT_COL_WIDTHS: Record<string, number> = {
  piNumber:         88,
  piDate:           110,
  buyerCompanyName: 200,
  countries:        88,
  varieties:        88,
  brand:            180,
  description:      220,
  totalContainers:  88,
  qtyMTs:           72,
  salesPerson:      110,
  fyWeekNo:         68,
}

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
  const [piPage,      setPiPage]      = useState(1)
  const [expandedPIs, setExpandedPIs] = useState<Set<string>>(new Set())
  const [colWidths,   setColWidths]   = useState<Record<string, number>>(DEFAULT_COL_WIDTHS)
  const searchRef  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const resizeRef  = useRef<{ col: string; startX: number; startWidth: number } | null>(null)

  const startResize = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault()
    resizeRef.current = { col, startX: e.clientX, startWidth: colWidths[col] ?? 100 }
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const delta    = ev.clientX - resizeRef.current.startX
      const newWidth = Math.max(50, resizeRef.current.startWidth + delta)
      setColWidths(prev => ({ ...prev, [resizeRef.current!.col]: newWidth }))
    }
    const onUp = () => {
      resizeRef.current = null
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }, [colWidths])

  const PI_PER_PAGE = 10

  const togglePI = (pi: string) =>
    setExpandedPIs(prev => {
      const next = new Set(prev)
      next.has(pi) ? next.delete(pi) : next.add(pi)
      return next
    })

  // Reset expanded rows and PI page whenever the dataset changes
  useEffect(() => { setExpandedPIs(new Set()); setPiPage(1) }, [data])

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
    params.set("limit", "10000")   // fetch all filtered products; paginate by PI client-side
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

  // ── Client-side PI pagination (10 PIs per page) ──────────────────────────────
  const piTotalPages = Math.max(1, Math.ceil(groupedRecords.length / PI_PER_PAGE))
  const safePiPage   = Math.min(piPage, piTotalPages)
  const pagedGroups  = useMemo(
    () => groupedRecords.slice((safePiPage - 1) * PI_PER_PAGE, safePiPage * PI_PER_PAGE),
    [groupedRecords, safePiPage]
  )

  // Totals for the current page (10 PIs)
  const pageContainers = pagedGroups.reduce((s, g) => s + g.containers, 0)
  const pageMTs        = pagedGroups.reduce((s, g) => s + g.totalMTs, 0)

  // Grand totals across the whole filtered dataset (from API summary)
  const grandContainers = data?.summary.totalContainers ?? groupedRecords.reduce((s, g) => s + g.containers, 0)
  const grandMTs        = data?.summary.totalMTs        ?? groupedRecords.reduce((s, g) => s + g.totalMTs, 0)

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
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-2">
          <span className="text-sm font-semibold text-gray-700">
            {loading
              ? "Loading…"
              : `${groupedRecords.length} PIs · ${data?.pagination.total ?? 0} products`}
          </span>
          {!loading && groupedRecords.length > 0 && (
            <span className="text-xs text-gray-500 font-medium">
              Showing PI {(safePiPage - 1) * PI_PER_PAGE + 1}–{Math.min(safePiPage * PI_PER_PAGE, groupedRecords.length)} · Page {safePiPage} of {piTotalPages}
            </span>
          )}
        </div>

        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50">{error}</div>
        )}

        {/* ── Desktop table ─────────────────────────────────────────────── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="table-fixed text-[11px]" style={{ width: Object.values(colWidths).reduce((a,b) => a+b, 0) + "px" }}>
            <colgroup>
              {COLUMNS.map(col => (
                <col key={col.key} style={{ width: colWidths[col.key] + "px" }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="relative text-left px-3 py-2.5 text-[10px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap select-none"
                    style={{ width: colWidths[col.key] }}
                  >
                    {col.label}
                    {/* Resize handle */}
                    <span
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center group z-10"
                      onMouseDown={(e) => startResize(col.key, e)}
                    >
                      <span className="w-px h-4 bg-gray-300 group-hover:bg-blue-400 group-hover:w-0.5 transition-all" />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="px-3 py-3">
                        <div className="h-3 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                pagedGroups.map((group) => {
                  const isExpanded = expandedPIs.has(group.piNumber)
                  return (
                    <React.Fragment key={group.piNumber}>

                      {/* ── PI summary row (collapsed) ──────────────────── */}
                      <tr
                        onClick={() => togglePI(group.piNumber)}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer select-none"
                      >
                        {/* PI No. + expand arrow */}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-block text-[8px] text-gray-400 transition-transform duration-150 ${isExpanded ? "rotate-90" : "rotate-0"}`}>
                              ▶
                            </span>
                            <span className="font-mono text-[11px] text-gray-800 font-semibold">{group.piNumber}</span>
                          </div>
                        </td>

                        {/* PI Date */}
                        <td className="px-3 py-2 text-gray-700 text-[11px] whitespace-nowrap">
                          {formatDate(group.piDate)}
                        </td>

                        {/* Buyer */}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 font-bold text-gray-900">
                            <SegmentTag segment={group.segment} isKeyAccount={group.isKeyAccount} />
                            <a
                              href={`/buyers/${encodeURIComponent(group.canonicalCode)}`}
                              className="hover:text-green-700 transition-colors break-words"
                              onClick={e => e.stopPropagation()}
                            >
                              {group.buyerCompanyName}
                            </a>
                          </div>
                        </td>

                        {/* Country */}
                        <td className="px-3 py-2">
                          <a
                            href={`/countries/${encodeURIComponent(group.country)}`}
                            className="bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hover:bg-blue-100 transition-colors whitespace-nowrap"
                            onClick={e => e.stopPropagation()}
                          >
                            {group.country}
                          </a>
                        </td>

                        {/* Variety – show product count when collapsed */}
                        <td className="px-3 py-2 text-gray-500 text-[11px]">
                          {group.products.length} product{group.products.length > 1 ? "s" : ""}
                        </td>

                        {/* Brand / Description – empty when collapsed */}
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2" />

                        {/* Containers */}
                        <td className="px-3 py-2 font-black text-gray-900 text-center tabular-nums">
                          {group.containers}
                        </td>

                        {/* MTs total */}
                        <td className="px-3 py-2 text-gray-800 text-center tabular-nums font-bold">
                          {group.totalMTs.toFixed(0)}
                        </td>

                        {/* Sales Person */}
                        <td className="px-3 py-2 text-gray-700 text-[11px] font-semibold">
                          <a
                            href={`/sales-persons/${encodeURIComponent(group.salesPerson)}`}
                            className="hover:text-green-700 transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            {group.salesPerson}
                          </a>
                        </td>

                        {/* FY Week */}
                        <td className="px-3 py-2 text-center text-[11px] text-gray-500 font-medium">
                          W{group.fyWeekNo}
                        </td>
                      </tr>

                      {/* ── Expanded: individual product rows ───────────── */}
                      {isExpanded && group.products.map((product, idx) => (
                        <tr key={`${group.piNumber}-p${idx}`} className="bg-slate-50/70 border-b border-slate-100">
                          <td className="pl-7 pr-3 py-1.5 text-gray-300 text-[10px]">└</td>
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5" />

                          {/* Variety */}
                          <td className="px-3 py-1.5">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${product.varieties === "BASMATI" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-700"}`}>
                              {product.varieties}
                            </span>
                          </td>

                          {/* Brand — full text, no truncate */}
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {product.brand && <BrandPill brand={product.brand} />}
                              <span className="text-gray-800 text-[11px] font-medium break-words">{product.brand || "–"}</span>
                            </div>
                          </td>

                          {/* Description — full text, no truncate */}
                          <td className="px-3 py-1.5 text-gray-800 text-[11px] break-words leading-snug">
                            {product.description}
                          </td>

                          {/* Containers */}
                          <td className="px-3 py-1.5 text-center text-gray-600 text-[11px] tabular-nums">
                            {product.totalContainers}
                          </td>

                          {/* Individual MTs */}
                          <td className="px-3 py-1.5 text-center text-gray-800 tabular-nums font-medium text-[11px]">
                            {product.qtyMTs?.toFixed(0)}
                          </td>

                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5" />
                        </tr>
                      ))}

                      {/* ── Expanded: totals row ─────────────────────────── */}
                      {isExpanded && (
                        <tr className="bg-slate-100 border-b-2 border-slate-300">
                          <td colSpan={7} className="px-3 py-1.5 text-right text-[11px] font-semibold text-gray-600 pr-6">
                            Total
                          </td>
                          <td className="px-3 py-1.5 text-center font-black text-gray-900 tabular-nums text-[11px]">
                            {group.containers}
                          </td>
                          <td className="px-3 py-1.5 text-center font-bold text-blue-700 tabular-nums text-[11px]">
                            {group.totalMTs.toFixed(0)}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      )}

                    </React.Fragment>
                  )
                })
              )}

              {/* ── Page total + Grand total footer ─────────────────────── */}
              {!loading && pagedGroups.length > 0 && (
                <>
                  {/* This page's total */}
                  <tr className="bg-blue-50 border-t-2 border-blue-200">
                    <td colSpan={7} className="px-3 py-2.5 text-right text-[11px] font-bold text-blue-900 uppercase tracking-wide">
                      Page {safePiPage} Total ({pagedGroups.length} PIs)
                    </td>
                    <td className="px-3 py-2.5 text-center font-black text-blue-900 tabular-nums text-[12px]">
                      {formatNumber(pageContainers)}
                    </td>
                    <td className="px-3 py-2.5 text-center font-black text-blue-900 tabular-nums text-[12px]">
                      {pageMTs.toFixed(0)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                  {/* Grand total across whole filtered dataset */}
                  <tr className="bg-green-50 border-t border-green-300">
                    <td colSpan={7} className="px-3 py-2.5 text-right text-[11px] font-bold text-green-900 uppercase tracking-wide">
                      Grand Total ({groupedRecords.length} PIs · all pages)
                    </td>
                    <td className="px-3 py-2.5 text-center font-black text-green-800 tabular-nums text-[12px]">
                      {formatNumber(grandContainers)}
                    </td>
                    <td className="px-3 py-2.5 text-center font-black text-green-800 tabular-nums text-[12px]">
                      {formatNumber(grandMTs, 0)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </>
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
            : pagedGroups.map((group) => {
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

          {/* Mobile: page total + grand total */}
          {!loading && pagedGroups.length > 0 && (
            <div className="divide-y divide-gray-100">
              <div className="px-4 py-3 flex items-center justify-between text-xs font-bold bg-blue-50 text-blue-900">
                <span className="uppercase tracking-wide">Page {safePiPage} Total ({pagedGroups.length} PIs)</span>
                <div className="flex items-center gap-3 tabular-nums">
                  <span>{formatNumber(pageContainers)} ctrs</span>
                  <span>{pageMTs.toFixed(0)} MTs</span>
                </div>
              </div>
              <div className="px-4 py-3 flex items-center justify-between text-xs font-bold bg-green-50 text-green-900">
                <span className="uppercase tracking-wide">Grand Total ({groupedRecords.length} PIs)</span>
                <div className="flex items-center gap-3 tabular-nums">
                  <span>{formatNumber(grandContainers)} ctrs</span>
                  <span>{formatNumber(grandMTs, 0)} MTs</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── PI Pagination (10 PIs per page) ───────────────────────────── */}
        {!loading && piTotalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <button
              onClick={() => setPiPage(p => Math.max(1, p - 1))}
              disabled={safePiPage <= 1}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(7, piTotalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(piTotalPages - 6, safePiPage - 3)) + i
                return (
                  <button
                    key={p}
                    onClick={() => setPiPage(p)}
                    className={`w-8 h-8 text-xs rounded-lg transition-colors ${p === safePiPage ? "bg-green-600 text-white font-semibold" : "text-gray-600 hover:bg-gray-100"}`}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setPiPage(p => Math.min(piTotalPages, p + 1))}
              disabled={safePiPage >= piTotalPages}
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
