"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { FilterBar, type FilterState } from "@/components/ui/filter-bar"
import { StatusBadge, TierBadge, GapCell, AchievementBar, SegmentTag } from "@/components/ui/status-badge"
import { SummaryCard } from "@/components/ui/page-header"
import { formatNumber } from "@/lib/utils"
import type { UserRole, CountryPerformance, BuyerPerformance, SalesPersonPerformance } from "@/types"

// ── Total helpers ────────────────────────────────────────────────────────────
function sumField<T>(rows: T[], field: keyof T): number {
  return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0)
}

// ── 3-state status (pace-adjusted: achievement % = actual ÷ due-till-now) ───────
//   Achieved ≥ 100% · On Track 70–99% · Critical < 70% · No Target (no target set)
type St3 = "ACHIEVED" | "ON_TRACK" | "CRITICAL" | "NO_TARGET"
function deriveStatus3(r: { target: number; achievementPercent: number }): St3 {
  if (!r.target || r.target <= 0) return "NO_TARGET"
  const p = r.achievementPercent
  if (p >= 100) return "ACHIEVED"
  if (p >= 70)  return "ON_TRACK"
  return "CRITICAL"
}
const ST3_STYLE: Record<St3, string> = {
  ACHIEVED:  "bg-green-100 text-green-700",
  ON_TRACK:  "bg-amber-100 text-amber-700",
  CRITICAL:  "bg-red-100 text-red-600",
  NO_TARGET: "bg-gray-100 text-gray-500",
}
const ST3_LABEL: Record<St3, string> = {
  ACHIEVED: "✓ Achieved", ON_TRACK: "On Track", CRITICAL: "✕ Critical", NO_TARGET: "No Target",
}
function StatusBadge3({ row }: { row: { target: number; achievementPercent: number } }) {
  const s = deriveStatus3(row)
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${ST3_STYLE[s]}`}>{ST3_LABEL[s]}</span>
}

type Tab = "country" | "buyer" | "salesperson" | "coordinator" | "newbusiness"

interface Props { userRole?: UserRole; salesPerson?: string }

// ── Tab Button ────────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active ? "bg-green-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  )
}

// ── Country Table ─────────────────────────────────────────────────────────────
function CountryTable({ rows, week }: { rows: CountryPerformance[]; week: number }) {
  const router = useRouter()
  const totalGap = sumField(rows, "gap")
  const [page, setPage] = useState(1)
  const paginatedRows = rows.slice((page - 1) * 10, page * 10)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Country</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prev Year</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Due W{week}</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gap</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Achievement</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Buyers</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {paginatedRows.map((r, i) => (
            <tr
              key={r.country}
              onClick={() => router.push(`/countries/${encodeURIComponent(r.country)}`)}
              className="hover:bg-green-50 cursor-pointer transition-colors"
            >
              <td className="px-3 py-3 text-gray-400 tabular-nums text-center">{(page - 1) * 10 + i + 1}</td>
              <td className="px-4 py-3 font-semibold text-gray-800 hover:text-green-700 hover:underline">
                <div className="flex items-center gap-1.5">
                  {r.isDreamMarket && <span className="text-amber-500 font-bold" title="Dream Market">🌟</span>}
                  <span>{r.country}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-gray-500 tabular-nums text-center">{formatNumber(r.previousYear)}</td>
              <td className="px-4 py-3 text-gray-700 tabular-nums text-center font-medium">{formatNumber(r.target, 0)}</td>
              <td className="px-4 py-3 text-gray-600 tabular-nums text-center">{formatNumber(r.targetDue)}</td>
              <td className="px-4 py-3 font-bold text-gray-900 tabular-nums text-center">{formatNumber(r.actual)}</td>
              <td className="px-4 py-3 text-center"><GapCell gap={r.gap} /></td>
              <td className="px-4 py-3 min-w-[120px]"><AchievementBar pct={r.achievementPercent} status={r.status} /></td>
              <td className="px-4 py-3 text-center text-gray-500 text-xs">{r.activeBuyers}/{r.totalBuyers}</td>
              <td className="px-4 py-3 text-center"><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
              <td className="px-3 py-3" />
              <td className="px-4 py-3 text-gray-800 uppercase text-xs tracking-wide">Grand Total</td>
              <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatNumber(sumField(rows, "previousYear"))}</td>
              <td className="px-4 py-3 text-right text-gray-800 tabular-nums">{formatNumber(sumField(rows, "target"), 0)}</td>
              <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatNumber(sumField(rows, "targetDue"))}</td>
              <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{formatNumber(sumField(rows, "actual"))}</td>
              <td className={`px-4 py-3 text-right tabular-nums ${totalGap >= 0 ? "text-green-700" : "text-red-700"}`}>
                {(totalGap >= 0 ? "+" : "") + formatNumber(totalGap)}
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-center text-xs text-gray-500">
                {sumField(rows, "activeBuyers")}/{sumField(rows, "totalBuyers")}
              </td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        )}
      </table>
      {rows.length > 10 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
          >← Prev</button>
          <span className="text-xs text-gray-500">
            Page {page} of {Math.ceil(rows.length / 10)}
          </span>
          <button
            onClick={() => setPage(p => Math.min(Math.ceil(rows.length / 10), p + 1))}
            disabled={page === Math.ceil(rows.length / 10)}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
          >Next →</button>
        </div>
      )}
    </div>
  )
}

// ── Buyer Table ───────────────────────────────────────────────────────────────
function BuyerTable({ rows, week, showSP }: { rows: BuyerPerformance[]; week: number; showSP: boolean }) {
  const router = useRouter()
  const totalGap = sumField(rows, "gap")
  const [page, setPage] = useState(1)
  const paginatedRows = rows.slice((page - 1) * 10, page * 10)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[150px]">Buyer</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Country</th>
            {showSP && <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sales Person</th>}
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tier</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Prev Year</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Target</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Due W{week}</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Actual</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gap</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Achievement</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {paginatedRows.map((r, i) => (
            <tr
              key={`${r.buyerCode}-${i}`}
              onClick={() => router.push(`/buyers/${encodeURIComponent(r.buyerCode || r.buyerName)}`)}
              className="hover:bg-green-50 cursor-pointer transition-colors"
            >
              <td className="px-3 py-3 text-gray-400 tabular-nums text-center">{(page - 1) * 10 + i + 1}</td>
              <td className="px-4 py-3 text-gray-800 text-left">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 hover:text-green-700 font-bold">
                    <SegmentTag segment={r.segment} isKeyAccount={r.isKeyAccount} />
                    <span className="truncate">{r.buyerName}</span>
                  </div>
                </div>
                {r.lastOrderDate && (
                  <div className="text-[10px] text-gray-400 font-normal">Last: {r.lastOrderDate}</div>
                )}
              </td>
              <td className="px-4 py-3 text-left">
                <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{r.country}</span>
              </td>
              {showSP && (
                <td className="px-4 py-3 text-gray-600 text-xs text-left">
                  <a 
                    href={`/sales-persons/${encodeURIComponent(r.salesPerson)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-green-700 hover:underline"
                  >
                    {r.salesPerson}
                  </a>
                </td>
              )}
              <td className="px-4 py-3 text-center"><TierBadge tier={r.tier} /></td>
              <td className="px-4 py-3 text-gray-500 tabular-nums text-center">{formatNumber(r.previousYear)}</td>
              <td className="px-4 py-3 text-gray-700 tabular-nums text-center font-medium">{formatNumber(r.target, 0)}</td>
              <td className="px-4 py-3 text-gray-600 tabular-nums text-center">{formatNumber(r.targetDue)}</td>
              <td className="px-4 py-3 font-bold text-gray-900 tabular-nums text-center">{formatNumber(r.actual)}</td>
              <td className="px-4 py-3 text-center"><GapCell gap={r.gap} /></td>
              <td className="px-4 py-3 min-w-[120px]"><AchievementBar pct={r.achievementPercent} status={r.status} /></td>
              <td className="px-4 py-3 text-center"><StatusBadge3 row={r} /></td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
              <td className="px-3 py-3" />
              <td className="px-4 py-3 text-gray-800 uppercase text-xs tracking-wide" colSpan={showSP ? 4 : 3}>
                Grand Total ({rows.length} buyers)
              </td>
              <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatNumber(sumField(rows, "previousYear"))}</td>
              <td className="px-4 py-3 text-right text-gray-800 tabular-nums">{formatNumber(sumField(rows, "target"), 0)}</td>
              <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatNumber(sumField(rows, "targetDue"))}</td>
              <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{formatNumber(sumField(rows, "actual"))}</td>
              <td className={`px-4 py-3 text-right tabular-nums ${totalGap >= 0 ? "text-green-700" : "text-red-700"}`}>
                {(totalGap >= 0 ? "+" : "") + formatNumber(totalGap)}
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        )}
      </table>
      {rows.length > 10 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
          >← Prev</button>
          <span className="text-xs text-gray-500">
            Page {page} of {Math.ceil(rows.length / 10)}
          </span>
          <button
            onClick={() => setPage(p => Math.min(Math.ceil(rows.length / 10), p + 1))}
            disabled={page === Math.ceil(rows.length / 10)}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
          >Next →</button>
        </div>
      )}
    </div>
  )
}

// ── SP Table ──────────────────────────────────────────────────────────────────
//   Shared by the "By Sales Person" and "By Sales Coordinator" tabs — both use the
//   SalesPersonPerformance shape (name held in `salesPerson`). `nameLabel` sets the
//   header text; `linkBase` (when set) makes each name link to a detail page.
function SPTable({
  rows, week, nameLabel = "Sales Person", linkBase = "/sales-persons",
}: {
  rows: SalesPersonPerformance[]; week: number; nameLabel?: string; linkBase?: string | null
}) {
  const router = useRouter()
  const totalGap = sumField(rows, "gap")
  const [page, setPage] = useState(1)
  const paginatedRows = rows.slice((page - 1) * 10, page * 10)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{nameLabel}</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prev Year</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Due W{week}</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gap</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Achievement</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Buyers</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {paginatedRows.map((r, i) => (
            <tr
              key={r.salesPerson}
              className={`hover:bg-green-50 transition-colors group ${linkBase ? "cursor-pointer" : ""}`}
              onClick={linkBase ? () => router.push(`${linkBase}/${encodeURIComponent(r.salesPerson)}`) : undefined}
            >
              <td className="px-3 py-3 text-gray-400 tabular-nums text-center">{(page - 1) * 10 + i + 1}</td>
              <td className="px-4 py-3 font-bold text-gray-800 group-hover:text-green-700">{r.salesPerson}</td>
              <td className="px-4 py-3 text-gray-500 tabular-nums text-center">{formatNumber(r.previousYear)}</td>
              <td className="px-4 py-3 text-gray-800 tabular-nums text-center font-bold">{formatNumber(r.target, 0)}</td>
              <td className="px-4 py-3 text-gray-600 tabular-nums text-center">{formatNumber(r.targetDue)}</td>
              <td className="px-4 py-3 font-black text-gray-900 tabular-nums text-center">{formatNumber(r.actual)}</td>
              <td className="px-4 py-3 text-center"><GapCell gap={r.gap} /></td>
              <td className="px-4 py-3 min-w-[120px]"><AchievementBar pct={r.achievementPercent} status={r.status} /></td>
              <td className="px-4 py-3 text-center text-gray-500 text-xs font-medium">{r.activeBuyers}</td>
              <td className="px-4 py-3 text-center"><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
              <td className="px-3 py-3" />
              <td className="px-4 py-3 text-gray-800 uppercase text-xs tracking-wide text-left">Grand Total</td>
              <td className="px-4 py-3 text-center text-gray-700 tabular-nums">{formatNumber(sumField(rows, "previousYear"))}</td>
              <td className="px-4 py-3 text-center text-gray-800 tabular-nums">{formatNumber(sumField(rows, "target"), 0)}</td>
              <td className="px-4 py-3 text-center text-gray-700 tabular-nums">{formatNumber(sumField(rows, "targetDue"))}</td>
              <td className="px-4 py-3 text-center text-gray-900 tabular-nums">{formatNumber(sumField(rows, "actual"))}</td>
              <td className={`px-4 py-3 text-center tabular-nums ${totalGap >= 0 ? "text-green-700" : "text-red-700"}`}>
                {(totalGap >= 0 ? "+" : "") + formatNumber(totalGap)}
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-center text-xs text-gray-500">{sumField(rows, "activeBuyers")}</td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        )}
      </table>
      {rows.length > 10 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
          >← Prev</button>
          <span className="text-xs text-gray-500">
            Page {page} of {Math.ceil(rows.length / 10)}
          </span>
          <button
            onClick={() => setPage(p => Math.min(Math.ceil(rows.length / 10), p + 1))}
            disabled={page === Math.ceil(rows.length / 10)}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
          >Next →</button>
        </div>
      )}
    </div>
  )
}

// ── New Business PDF ──────────────────────────────────────────────────────────
async function generateNewBusinessPDF(opts: {
  newBuyers: BuyerPerformance[]
  newCountries: CountryPerformance[]
  showSP: boolean
  fyLabel: string
  periodLabel: string
}) {
  const { newBuyers, newCountries, showSP, fyLabel, periodLabel } = opts
  const { default: jsPDF }     = await import("jspdf")
  const { default: autoTable } = await import("jspdf-autotable")

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const W = 210, ML = 14, MR = 14
  const NAVY:  [number,number,number] = [30, 58, 138]
  const BLUE:  [number,number,number] = [29, 78, 216]
  const SKY:   [number,number,number] = [14, 165, 233]
  const GREEN: [number,number,number] = [5, 150, 105]
  const AMBER: [number,number,number] = [217, 119, 6]
  const PURPLE:[number,number,number] = [124, 58, 237]
  let y = 0

  const nbCtrs = newBuyers.reduce((s, b) => s + b.actual, 0)
  const ncCtrs = newCountries.reduce((s, c) => s + c.actual, 0)

  // ── Header ──
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 10, "F")
  doc.setFillColor(...BLUE); doc.rect(0, 10, W, 21, "F")
  doc.setFillColor(...SKY);  doc.rect(0, 31, W, 2.5, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5)
  doc.text("SHAZIA RICE EXPORT  ·  CONFIDENTIAL  ·  INTERNAL USE ONLY", ML, 7)
  doc.setFontSize(16); doc.text("New Business Report", ML, 20)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text(`${periodLabel}  ·  FY ${fyLabel}`, ML, 27.5)
  const gen = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
  doc.setFontSize(6.5); doc.text(`Generated: ${gen} IST`, W - MR, 27.5, { align: "right" })
  y = 40

  // ── Definition note ──
  doc.setTextColor(107, 114, 128); doc.setFontSize(7.5); doc.setFont("helvetica", "italic")
  doc.text("New Business = did business this year, none last year, and no target set (walk-in / unplanned accounts).", ML, y)
  doc.setFont("helvetica", "normal")
  y += 6

  // ── KPI cards ──
  const cards: Array<[string, string, [number,number,number]]> = [
    ["New Buyers",           String(newBuyers.length),   PURPLE],
    ["New-Buyer Containers", formatNumber(nbCtrs),       GREEN],
    ["New Countries",        String(newCountries.length),AMBER],
    ["New-Country Containers",formatNumber(ncCtrs),      SKY],
  ]
  const cw = (W - ML - MR - 3 * 3) / 4
  cards.forEach(([label, value, rgb], i) => {
    const cx = ML + i * (cw + 3)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(cx, y, cw, 20, 2, 2, "F")
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3); doc.roundedRect(cx, y, cw, 20, 2, 2, "S")
    doc.setFillColor(...rgb); doc.roundedRect(cx, y, cw, 6, 2, 2, "F"); doc.rect(cx, y + 3, cw, 3, "F")
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(5.4)
    doc.text(label.toUpperCase(), cx + cw / 2, y + 4.2, { align: "center" })
    doc.setTextColor(...NAVY); doc.setFontSize(13)
    doc.text(value, cx + cw / 2, y + 15, { align: "center" })
  })
  y += 26

  // ── Common table styling ──
  const tableStyle = (head: string[][], body: (string|number)[][], foot: (string|number)[][], colStyles: Record<number, object>, headFill: [number,number,number]) => {
    autoTable(doc, {
      startY: y, margin: { left: ML, right: MR }, head, body, foot,
      headStyles: { fillColor: headFill, textColor: [255,255,255], fontStyle: "bold", fontSize: 7, lineWidth: 0.2 },
      bodyStyles: { fontSize: 7, lineWidth: 0.15, lineColor: [219, 234, 254] },
      footStyles: { fillColor: NAVY, textColor: [255,255,255], fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      tableLineWidth: 0.2, tableLineColor: [203, 213, 225],
      columnStyles: colStyles, showFoot: "lastPage",
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ── New Buyers table ──
  doc.setTextColor(...NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(9)
  doc.text(`New Buyers  (${newBuyers.length})`, ML, y); y += 3
  if (newBuyers.length) {
    const head = showSP
      ? [["#", "Buyer", "Country", "Sales Person", "Tier", "Last Yr", "This Yr (Ctrs)"]]
      : [["#", "Buyer", "Country", "Tier", "Last Yr", "This Yr (Ctrs)"]]
    const body = newBuyers.map((b, i) => showSP
      ? [i + 1, b.buyerName, b.country, b.salesPerson || "—", b.tier, "0", formatNumber(b.actual)]
      : [i + 1, b.buyerName, b.country, b.tier, "0", formatNumber(b.actual)])
    const lastCol = showSP ? 6 : 5
    const foot = [[ "", "GRAND TOTAL", ...(showSP ? ["", ""] : [""]), "", "0", formatNumber(nbCtrs) ]]
    tableStyle(head, body, foot,
      { 0: { halign: "center", cellWidth: 8 }, [lastCol - 1]: { halign: "right" }, [lastCol]: { halign: "right" } },
      PURPLE)
  } else {
    doc.setTextColor(107,114,128); doc.setFont("helvetica","normal"); doc.setFontSize(8)
    doc.text("No new buyers in this period.", ML, y + 3); y += 8
  }

  // ── New Countries table ──
  if (y > 250) { doc.addPage(); y = 16 }
  doc.setTextColor(...NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(9)
  doc.text(`New Countries  (${newCountries.length})`, ML, y); y += 3
  if (newCountries.length) {
    tableStyle(
      [["#", "Country", "Last Yr", "This Yr (Ctrs)", "Buyers"]],
      newCountries.map((c, i) => [i + 1, c.country, "0", formatNumber(c.actual), c.activeBuyers]),
      [["", "GRAND TOTAL", "0", formatNumber(ncCtrs), ""]],
      { 0: { halign: "center", cellWidth: 8 }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "center" } },
      AMBER)
  } else {
    doc.setTextColor(107,114,128); doc.setFont("helvetica","normal"); doc.setFontSize(8)
    doc.text("No new countries in this period.", ML, y + 3)
  }

  // ── Footer on all pages ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pages = (doc as any).internal.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFillColor(...NAVY); doc.rect(0, 287, W, 10, "F")
    doc.setFillColor(...SKY);  doc.rect(0, 287, W, 0.8, "F")
    doc.setTextColor(156, 163, 175); doc.setFontSize(6); doc.setFont("helvetica", "normal")
    doc.text("Shazia Rice Export  ·  New Business Report  ·  Confidential", ML, 293)
    doc.text(`Page ${p} of ${pages}  ·  FY ${fyLabel}`, W - MR, 293, { align: "right" })
  }

  doc.save(`New-Business-FY${fyLabel}.pdf`)
}

// ── New Business View ───────────────────────────────────────────────────────────
//   New buyers & countries = business this year, NONE last year, NO target set.
//   No target/achievement columns here (new business has no target) — instead we
//   show Last Year (0) vs This Year to make the "brand-new" nature obvious.
function NewBusinessView({
  newBuyerRows, newCountryRows, showSP, fyLabel, periodLabel,
}: {
  newBuyerRows: BuyerPerformance[]; newCountryRows: CountryPerformance[]; showSP: boolean
  fyLabel: string; periodLabel: string
}) {
  const router = useRouter()
  const [pdfBusy, setPdfBusy] = useState(false)
  const handlePDF = async () => {
    setPdfBusy(true)
    try { await generateNewBusinessPDF({ newBuyers: newBuyerRows, newCountries: newCountryRows, showSP, fyLabel, periodLabel }) }
    catch (e) { console.error(e) }
    finally { setPdfBusy(false) }
  }
  const newBuyerCtrs   = sumField(newBuyerRows, "actual")
  const newCountryCtrs = sumField(newCountryRows, "actual")
  const cards = [
    { label: "🆕 New Buyers",          value: formatNumber(newBuyerRows.length, 0),   color: "bg-purple-50 border-purple-200" },
    { label: "New-Buyer Containers",   value: formatNumber(newBuyerCtrs),             color: "bg-green-50 border-green-200"   },
    { label: "🌍 New Countries",       value: formatNumber(newCountryRows.length, 0), color: "bg-amber-50 border-amber-200"   },
    { label: "New-Country Containers", value: formatNumber(newCountryCtrs),           color: "bg-blue-50 border-blue-200"     },
  ]

  const Th = ({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "center" | "right" }) => (
    <th className={`px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-${align}`}>{children}</th>
  )

  return (
    <div className="p-4 space-y-6">
      {/* Header + PDF export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-gray-800">New Business — {periodLabel} · FY {fyLabel}</p>
          <p className="text-xs text-gray-400">{newBuyerRows.length} new buyers · {newCountryRows.length} new countries</p>
        </div>
        <button
          onClick={handlePDF}
          disabled={pdfBusy || (newBuyerRows.length === 0 && newCountryRows.length === 0)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-40"
        >
          {pdfBusy
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating…</>
            : <>⬇ Download PDF</>}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => <SummaryCard key={c.label} {...c} />)}
      </div>

      {/* New Buyers */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-bold text-gray-800">New Buyers</span>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">{newBuyerRows.length}</span>
          <span className="text-xs text-gray-400">— business this year, none last year, no target</span>
        </div>
        {newBuyerRows.length > 0 ? (
          <div className="border border-gray-100 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <Th align="center">#</Th>
                  <Th>Buyer</Th>
                  <Th>Country</Th>
                  {showSP && <Th>Sales Person</Th>}
                  <Th align="center">Tier</Th>
                  <Th align="center">Last Year</Th>
                  <Th align="center">This Year (Ctrs)</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {newBuyerRows.map((r, i) => (
                  <tr key={`${r.buyerCode}-${i}`}
                    onClick={() => router.push(`/buyers/${encodeURIComponent(r.buyerCode || r.buyerName)}`)}
                    className="hover:bg-green-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-gray-400 tabular-nums text-center">{i + 1}</td>
                    <td className="px-4 py-3 font-bold text-gray-800 hover:text-green-700">
                      <span className="inline-flex items-center gap-1.5">
                        {r.buyerName}
                        <span className="text-[9px] bg-purple-600 text-white px-1.5 py-0.5 rounded font-bold">NEW</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-left"><span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{r.country}</span></td>
                    {showSP && <td className="px-4 py-3 text-gray-600 text-xs">{r.salesPerson}</td>}
                    <td className="px-4 py-3 text-center"><TierBadge tier={r.tier} /></td>
                    <td className="px-4 py-3 text-center text-gray-400 tabular-nums">0</td>
                    <td className="px-4 py-3 text-center font-black text-gray-900 tabular-nums">{formatNumber(r.actual)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-gray-800 uppercase text-xs tracking-wide" colSpan={showSP ? 4 : 3}>Grand Total ({newBuyerRows.length} new buyers)</td>
                  <td className="px-4 py-3 text-center text-gray-400 tabular-nums">0</td>
                  <td className="px-4 py-3 text-center text-gray-900 tabular-nums">{formatNumber(newBuyerCtrs)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : <p className="text-sm text-gray-400 py-3">No new buyers in this period — all business came from existing/targeted accounts.</p>}
      </div>

      {/* New Countries */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-bold text-gray-800">New Countries</span>
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{newCountryRows.length}</span>
          <span className="text-xs text-gray-400">— markets entered for the first time this year</span>
        </div>
        {newCountryRows.length > 0 ? (
          <div className="border border-gray-100 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <Th align="center">#</Th>
                  <Th>Country</Th>
                  <Th align="center">Last Year</Th>
                  <Th align="center">This Year (Ctrs)</Th>
                  <Th align="center">Buyers</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {newCountryRows.map((r, i) => (
                  <tr key={r.country}
                    onClick={() => router.push(`/countries/${encodeURIComponent(r.country)}`)}
                    className="hover:bg-green-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-gray-400 tabular-nums text-center">{i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800 hover:text-green-700">
                      <span className="inline-flex items-center gap-1.5">
                        {r.country}
                        <span className="text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold">NEW</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400 tabular-nums">0</td>
                    <td className="px-4 py-3 text-center font-black text-gray-900 tabular-nums">{formatNumber(r.actual)}</td>
                    <td className="px-4 py-3 text-center text-gray-500 text-xs">{r.activeBuyers}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-gray-800 uppercase text-xs tracking-wide">Grand Total ({newCountryRows.length} new countries)</td>
                  <td className="px-4 py-3 text-center text-gray-400 tabular-nums">0</td>
                  <td className="px-4 py-3 text-center text-gray-900 tabular-nums">{formatNumber(newCountryCtrs)}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : <p className="text-sm text-gray-400 py-3">No new countries in this period.</p>}
      </div>
    </div>
  )
}

// ── Mobile Card ───────────────────────────────────────────────────────────────
function MobilePerformanceCard({
  title, sub, target, actual, gap, pct, status, badge,
}: {
  title: string; sub?: string; target: number; actual: number;
  gap: number; pct: number; status: any; badge?: React.ReactNode
}) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-800 text-sm">{title}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
        {badge}
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div><p className="text-gray-400">Target</p><p className="font-semibold">{formatNumber(target, 0)}</p></div>
        <div><p className="text-gray-400">Actual</p><p className="font-bold text-gray-900">{formatNumber(actual)}</p></div>
        <div><p className="text-gray-400">Gap</p><GapCell gap={gap} /></div>
      </div>
      <AchievementBar pct={pct} status={status} />
      <StatusBadge status={status} />
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function TargetsClient({ userRole, salesPerson }: Props) {
  const [tab,      setTab]     = useState<Tab>("country")
  const [filters,    setFilters]    = useState<FilterState>({})
  const [tierFilter, setTierFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("")  // "" | ACHIEVED | ON_TRACK | CRITICAL
  const [loading,  setLoading] = useState(true)
  const [error,    setError]   = useState("")
  const [options,  setOptions] = useState<{ countries: string[]; salesPersons: string[]; salesCoordinators: string[] }>({ countries: [], salesPersons: [], salesCoordinators: [] })

  const [countryData, setCountryData] = useState<{ rows: CountryPerformance[]; meta: any } | null>(null)
  const [buyerData,   setBuyerData]   = useState<{ rows: BuyerPerformance[];   summary: any; meta: any } | null>(null)
  const [spData,      setSPData]      = useState<{ rows: SalesPersonPerformance[]; meta: any } | null>(null)
  const [coordData,   setCoordData]   = useState<{ rows: SalesPersonPerformance[]; meta: any } | null>(null)

  const isSP = userRole === "SALES_PERSON"

  const buildParams = useCallback((f: FilterState) => {
    const p = new URLSearchParams()
    if (f.country)          p.set("country",          f.country)
    if (f.salesPerson)      p.set("salesPerson",      f.salesPerson)
    if (f.salesCoordinator) p.set("salesCoordinator", f.salesCoordinator)
    if (f.fy)          p.set("fy",          f.fy)
    if (f.fyMonth)     p.set("fyMonth",     f.fyMonth)
    if (f.fyQuarter)   p.set("fyQuarter",   f.fyQuarter)
    if (f.fyWeek)      p.set("fyWeek",      f.fyWeek)
    return p.toString()
  }, [])

  const fetchTab = useCallback(async (t: Tab, f: FilterState) => {
    setLoading(true); setError("")
    const qs = buildParams(f)
    try {
      if (t === "country") {
        const res = await fetch(`/api/performance/countries?${qs}`)
        const d   = await res.json()
        setCountryData(d)
        const ctrs: string[] = d.rows.map((r: any) => r.country as string)
        setOptions((o) => ({ ...o, countries: Array.from(new Set(ctrs)) }))
      } else if (t === "buyer") {
        const res = await fetch(`/api/performance/buyers?${qs}`)
        const d   = await res.json()
        setBuyerData(d)
        if (d.filterOptions) {
          setOptions((o) => ({
            countries:         d.filterOptions.countries?.length ? d.filterOptions.countries : o.countries,
            salesPersons:      d.filterOptions.salesPersons ?? o.salesPersons,
            salesCoordinators: d.filterOptions.salesCoordinators ?? o.salesCoordinators,
          }))
        }
      } else if (t === "newbusiness") {
        // New Business needs BOTH buyer and country performance
        const [bRes, cRes] = await Promise.all([
          fetch(`/api/performance/buyers?${qs}`),
          fetch(`/api/performance/countries?${qs}`),
        ])
        const [bD, cD] = await Promise.all([bRes.json(), cRes.json()])
        setBuyerData(bD)
        setCountryData(cD)
      } else if (t === "salesperson") {
        const res = await fetch(`/api/performance/salesperson?${qs}`)
        const d   = await res.json()
        setSPData(d)
      } else {
        const res = await fetch(`/api/performance/salescoordinator?${qs}`)
        const d   = await res.json()
        setCoordData(d)
      }
    } catch { setError("Failed to load data.") }
    finally  { setLoading(false) }
  }, [buildParams])

  useEffect(() => { fetchTab(tab, filters) }, [tab, filters, fetchTab])

  const week = countryData?.meta?.week ?? buyerData?.meta?.week ?? spData?.meta?.week ?? coordData?.meta?.week ?? 6

  // Client-side search (buyer / country / person name)
  const q = (filters.search || "").toLowerCase().trim()
  const matchQ = (...vals: (string | undefined)[]) => !q || vals.some((v) => (v ?? "").toLowerCase().includes(q))

  // Client-side tier + status + search filters — applied after data loads
  const filteredBuyerRows = (buyerData?.rows ?? []).filter(
    (r) => (!tierFilter || r.tier === tierFilter)
        && (!statusFilter || deriveStatus3(r) === statusFilter)
        && matchQ(r.buyerName, r.country, r.salesPerson)
  )
  const countryRows = (countryData?.rows ?? []).filter((r) => matchQ(r.country))
  const spRows      = (spData?.rows ?? []).filter((r) => matchQ((r as any).salesPerson))
  const coordRows   = (coordData?.rows ?? []).filter((r) => matchQ((r as any).salesPerson))

  // New Business — genuinely NEW: did business this year, NONE last year, and NO
  // target set (buyers/countries that carry a target are planned/current accounts,
  // not new). So: actual > 0  AND  previousYear == 0  AND  target == 0.
  const isNewRow = (r: { previousYear: number; actual: number; target: number }) =>
    r.actual > 0 && r.previousYear <= 0 && r.target <= 0
  const newBuyerRows   = (buyerData?.rows ?? []).filter((r) => isNewRow(r) && matchQ(r.buyerName, r.country, r.salesPerson))
  const newCountryRows = (countryData?.rows ?? []).filter((r) => isNewRow(r) && matchQ(r.country))

  // Labels for the New Business PDF / header
  const nowFY = (() => {
    const n = new Date(); const s = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1
    return `${s}-${String(s + 1).slice(-2)}`
  })()
  const fyLabel = filters.fy || nowFY
  const QLABEL: Record<string, string> = { "1": "Q1 (Apr–Jun)", "2": "Q2 (Jul–Sep)", "3": "Q3 (Oct–Dec)", "4": "Q4 (Jan–Mar)" }
  const periodLabel = filters.fyWeek ? `Week ${filters.fyWeek}`
    : filters.fyMonth ? `Month ${filters.fyMonth}`
    : filters.fyQuarter ? (QLABEL[filters.fyQuarter] || `Q${filters.fyQuarter}`)
    : "Full Year"

  // Summary cards always reflect the filtered rows (client-side)
  const filteredSummary = tab === "buyer" && buyerData
    ? {
        totalTarget: sumField(filteredBuyerRows, "target"),
        totalActual: sumField(filteredBuyerRows, "actual"),
        achieved:    filteredBuyerRows.filter((r) => deriveStatus3(r) === "ACHIEVED").length,
        onTrack:     filteredBuyerRows.filter((r) => deriveStatus3(r) === "ON_TRACK").length,
        critical:    filteredBuyerRows.filter((r) => deriveStatus3(r) === "CRITICAL").length,
        buyerCount:  filteredBuyerRows.length,
      }
    : null

  const tierLabel = tierFilter === "TIER1" ? "Tier 1" : tierFilter === "TIER2" ? "Tier 2" : tierFilter === "TIER3" ? "Tier 3" : tierFilter === "OTHERS" ? "Others" : "All"

  const summary = filteredSummary
    ? [
        { label: "Total Target",        value: formatNumber(filteredSummary.totalTarget, 0), color: "bg-purple-50 border-purple-200" },
        { label: "Total Actual",        value: formatNumber(filteredSummary.totalActual),    color: "bg-green-50 border-green-200"  },
        { label: "✓ Achieved",          value: filteredSummary.achieved,                     color: "bg-green-50 border-green-200"  },
        { label: "On Track",            value: filteredSummary.onTrack,                      color: "bg-amber-50 border-amber-200"  },
        { label: "✕ Critical",          value: filteredSummary.critical,                     color: "bg-red-50 border-red-200"      },
        { label: `${tierLabel} Buyers`, value: filteredSummary.buyerCount,                   color: "bg-blue-50 border-blue-200"    },
      ]
    : null

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1.5 shadow-sm w-fit">
        <TabBtn active={tab === "country"}    onClick={() => setTab("country")}>🌍 By Country</TabBtn>
        <TabBtn active={tab === "buyer"}      onClick={() => setTab("buyer")}>👤 By Buyer</TabBtn>
        {!isSP && (
          <TabBtn active={tab === "salesperson"} onClick={() => setTab("salesperson")}>👥 By Sales Person</TabBtn>
        )}
        {!isSP && (
          <TabBtn active={tab === "coordinator"} onClick={() => setTab("coordinator")}>📋 By Sales Coordinator</TabBtn>
        )}
        <TabBtn active={tab === "newbusiness"} onClick={() => setTab("newbusiness")}>🆕 New Business</TabBtn>
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onChange={(f) => setFilters(f)}
        options={options}
        showSearch={true}
        showFY={true}
        showVariety={false}
        showSP={!isSP && tab !== "salesperson" && tab !== "coordinator"}
        showCoordinator={tab === "buyer"}
      />

      {/* Buyer tab — tier filter pills */}
      {tab === "buyer" && (
        <div className="flex gap-2 flex-wrap">
          {([
            { val: "",       label: "All Tiers" },
            { val: "TIER1",  label: "Tier 1" },
            { val: "TIER2",  label: "Tier 2" },
            { val: "TIER3",  label: "Tier 3" },
            { val: "OTHERS", label: "Others" },
          ] as const).map(({ val, label }) => (
            <button
              key={val || "all"}
              onClick={() => setTierFilter(val)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                tierFilter === val
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Buyer tab — status filter pills */}
      {tab === "buyer" && (
        <div className="flex gap-2 flex-wrap">
          {([
            { val: "",         label: "All Status", active: "bg-gray-800 text-white border-gray-800" },
            { val: "ACHIEVED", label: "✓ Achieved", active: "bg-green-600 text-white border-green-600" },
            { val: "ON_TRACK", label: "On Track",   active: "bg-amber-500 text-white border-amber-500" },
            { val: "CRITICAL", label: "✕ Critical", active: "bg-red-600 text-white border-red-600" },
          ] as const).map(({ val, label, active }) => (
            <button
              key={val || "allstatus"}
              onClick={() => setStatusFilter(val)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                statusFilter === val ? active : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Summary cards (buyer tab) */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {summary.map((s) => <SummaryCard key={s.label} {...s} />)}
        </div>
      )}

      {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">{error}</div>}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">
            {loading ? "Loading…" : (
              tab === "country"     ? `${countryRows.length} countries` :
              tab === "buyer"       ? `${filteredBuyerRows.length} buyers`    :
              tab === "salesperson" ? `${spRows.length} sales persons` :
              tab === "newbusiness" ? `${newBuyerRows.length} new buyers · ${newCountryRows.length} new countries` :
                                      `${coordRows.length} sales coordinators`
            )}
          </span>
          <span className="text-xs text-gray-400">FY Week {week}</span>
        </div>

        {/* Desktop tables */}
        {!loading && (
          <>
            {tab === "country"    && countryData && <div className="hidden md:block"><CountryTable rows={countryRows} week={week} /></div>}
            {tab === "buyer"      && buyerData   && <div className="hidden md:block"><BuyerTable   rows={filteredBuyerRows} week={week} showSP={!isSP} /></div>}
            {tab === "salesperson"&& spData       && <div className="hidden md:block"><SPTable      rows={spRows}      week={week} /></div>}
            {tab === "coordinator"&& coordData    && <div className="hidden md:block"><SPTable      rows={coordRows}   week={week} nameLabel="Sales Coordinator" linkBase={null} /></div>}
            {tab === "newbusiness"&& buyerData && countryData && (
              <NewBusinessView newBuyerRows={newBuyerRows} newCountryRows={newCountryRows} showSP={!isSP} fyLabel={fyLabel} periodLabel={periodLabel} />
            )}
          </>
        )}

        {/* Mobile cards */}
        {!loading && (
          <div className="md:hidden divide-y divide-gray-100">
            {tab === "country" && countryRows.map((r) => (
              <MobilePerformanceCard key={r.country} title={r.country}
                sub={`${r.activeBuyers} active buyers`}
                target={r.target} actual={r.actual} gap={r.gap}
                pct={r.achievementPercent} status={r.status} />
            ))}
            {tab === "buyer" && filteredBuyerRows.map((r, i) => (
              <MobilePerformanceCard key={i} title={r.buyerName}
                sub={`${r.country} · ${r.salesPerson}`}
                target={r.target} actual={r.actual} gap={r.gap}
                pct={r.achievementPercent} status={r.status}
                badge={<TierBadge tier={r.tier} />} />
            ))}
            {tab === "salesperson" && spRows.map((r) => (
              <MobilePerformanceCard key={r.salesPerson} title={r.salesPerson}
                sub={`${r.activeBuyers} active buyers`}
                target={r.target} actual={r.actual} gap={r.gap}
                pct={r.achievementPercent} status={r.status} />
            ))}
            {tab === "coordinator" && coordRows.map((r) => (
              <MobilePerformanceCard key={r.salesPerson} title={r.salesPerson}
                sub={`${r.activeBuyers} active buyers`}
                target={r.target} actual={r.actual} gap={r.gap}
                pct={r.achievementPercent} status={r.status} />
            ))}
          </div>
        )}

        {loading && (
          <div className="p-8 text-center text-gray-400 text-sm animate-pulse">Loading performance data…</div>
        )}
      </div>
    </div>
  )
}
