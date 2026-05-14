"use client"

import { cn } from "@/lib/utils"
import { getCurrentFY, getPreviousFY } from "@/lib/fy-utils"

export interface FilterState {
  country?:     string
  salesPerson?: string
  variety?:     string
  fyMonth?:     string
  fyQuarter?:   string
  fyWeek?:      string
  fy?:          string
  search?:      string
}

interface FilterBarProps {
  filters:       FilterState
  onChange:      (filters: FilterState) => void
  options?:      { countries?: string[]; salesPersons?: string[] }
  showSearch?:   boolean
  showFY?:       boolean
  showVariety?:  boolean
  showSP?:       boolean   // hide for SALES_PERSON role
  className?:    string
}

const FY_MONTHS = [
  "April","May","June","July","August","September",
  "October","November","December","January","February","March",
]

export function FilterBar({
  filters, onChange, options,
  showSearch = false, showFY = false,
  showVariety = true, showSP = true, className,
}: FilterBarProps) {
  const set = (key: keyof FilterState, val: string) =>
    onChange({ ...filters, [key]: val || undefined })

  const hasActive = Object.values(filters).some(Boolean)

  return (
    <div className={cn("bg-white border border-gray-200 rounded-xl p-3 shadow-sm", className)}>
      <div className="flex flex-wrap gap-2 items-center">

        {/* Search */}
        {showSearch && (
          <input
            type="text"
            placeholder="Search buyer / PI…"
            value={filters.search || ""}
            onChange={(e) => set("search", e.target.value)}
            className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        )}

        {/* Country */}
        <select
          value={filters.country || ""}
          onChange={(e) => set("country", e.target.value)}
          className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 max-w-[160px]"
        >
          <option value="">All Countries</option>
          {options?.countries?.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Sales Person */}
        {showSP && (
          <select
            value={filters.salesPerson || ""}
            onChange={(e) => set("salesPerson", e.target.value)}
            className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 max-w-[160px]"
          >
            <option value="">All Sales Persons</option>
            {options?.salesPersons?.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {/* Variety */}
        {showVariety && (
          <select
            value={filters.variety || ""}
            onChange={(e) => set("variety", e.target.value)}
            className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Varieties</option>
            <option value="BASMATI">Basmati</option>
            <option value="NON BASMATI">Non Basmati</option>
          </select>
        )}

        {/* Month */}
        <select
          value={filters.fyMonth || ""}
          onChange={(e) => set("fyMonth", e.target.value)}
          className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">All Months</option>
          {FY_MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1)}>{m}</option>
          ))}
        </select>

        {/* Quarter */}
        <select
          value={filters.fyQuarter || ""}
          onChange={(e) => set("fyQuarter", e.target.value)}
          className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">All Quarters</option>
          <option value="1">Q1 (Apr–Jun)</option>
          <option value="2">Q2 (Jul–Sep)</option>
          <option value="3">Q3 (Oct–Dec)</option>
          <option value="4">Q4 (Jan–Mar)</option>
        </select>

        {/* FY Year */}
        {showFY && (
          <select
            value={filters.fy || getCurrentFY()}
            onChange={(e) => set("fy", e.target.value)}
            className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value={getCurrentFY()}>{getCurrentFY()}</option>
            <option value={getPreviousFY(getCurrentFY())}>{getPreviousFY(getCurrentFY())}</option>
          </select>
        )}

        {/* Clear */}
        {hasActive && (
          <button
            onClick={() => onChange({})}
            className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1.5 rounded hover:bg-red-50 transition-colors whitespace-nowrap"
          >
            ✕ Clear
          </button>
        )}
      </div>
    </div>
  )
}
