import type { FYWeek, FYCycle, FinancialYear, PerformanceStatus } from "@/types"

// ─── Financial Year Boundaries ────────────────────────────────────────────────

export function getFYBoundaries(fy: FinancialYear): { start: Date; end: Date } {
  const [startYear] = fy.split("-").map(Number)
  return {
    start: new Date(startYear, 3, 1),       // April 1
    end: new Date(startYear + 1, 2, 31),    // March 31
  }
}

export function getCurrentFY(): FinancialYear {
  const today = new Date()
  const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  return `${year}-${String(year + 1).slice(-2)}` as FinancialYear
}

export function getPreviousFY(fy: FinancialYear): FinancialYear {
  const [startYear] = fy.split("-").map(Number)
  return `${startYear - 1}-${String(startYear).slice(-2)}` as FinancialYear
}

// ─── FY Week Calculation ──────────────────────────────────────────────────────

export function getFYWeek(date: Date, fy: FinancialYear): FYWeek {
  const { start } = getFYBoundaries(fy)
  
  // Find the first Monday of the FY (or on/after start)
  // Day 0 = Sunday, 1 = Monday, ...
  const startDay = start.getDay()
  const daysToFirstMonday = (1 - startDay + 7) % 7
  
  const diffMs = date.getTime() - start.getTime()
  if (diffMs < 0) return 1
  
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays < daysToFirstMonday) {
    return 1 // Still in the first (partial) week
  }
  
  // Weeks after the first Monday
  const daysAfterFirstMonday = diffDays - daysToFirstMonday
  return (Math.floor(daysAfterFirstMonday / 7) + 2) as FYWeek
}

export function getCurrentFYWeek(): FYWeek {
  return getFYWeek(new Date(), getCurrentFY())
}

// ─── Target Due Calculation ───────────────────────────────────────────────────

export function targetDueTillWeek(annualTarget: number, currentWeek: FYWeek): number {
  return parseFloat(((annualTarget / 52) * currentWeek).toFixed(2))
}

// ─── Status Logic ─────────────────────────────────────────────────────────────

export function getStatus(
  target: number,
  actual: number,
  targetDue: number
): PerformanceStatus {
  if (target === 0) return "NO_TARGET"
  if (actual === 0 && target > 0) return "MISSED"
  if (actual >= targetDue) return "ACHIEVED"
  return "MISSED"
}

export function getAchievementPercent(actual: number, targetDue: number): number {
  if (targetDue === 0) return 0
  return parseFloat(((actual / targetDue) * 100).toFixed(1))
}

// ─── 12-Week Cycle Mapping ────────────────────────────────────────────────────

interface CycleInfo {
  cycle: FYCycle
  name: string
  startWeek: FYWeek
  endWeek: FYWeek
}

export const FY_CYCLES: CycleInfo[] = [
  { cycle: 1, name: "Cycle 1 (Apr–Jun)", startWeek: 1,  endWeek: 12 },
  { cycle: 2, name: "Cycle 2 (Jun–Sep)", startWeek: 13, endWeek: 24 },
  { cycle: 3, name: "Cycle 3 (Sep–Dec)", startWeek: 25, endWeek: 36 },
  { cycle: 4, name: "Cycle 4 (Dec–Mar)", startWeek: 37, endWeek: 48 },
]

export function getCycleForWeek(week: FYWeek): CycleInfo {
  return FY_CYCLES.find((c) => week >= c.startWeek && week <= c.endWeek) ?? FY_CYCLES[0]
}

export function getCurrentCycle(): CycleInfo {
  return getCycleForWeek(getCurrentFYWeek())
}

export function getWeekInCycle(week: FYWeek): number {
  const cycle = getCycleForWeek(week)
  return week - cycle.startWeek + 1
}

// ─── Cycle Score ──────────────────────────────────────────────────────────────

export function getCycleScore(
  actual: number,
  target: number
): "GREEN" | "AMBER" | "RED" | "IN_PROGRESS" {
  if (target === 0) return "IN_PROGRESS"
  const pct = (actual / target) * 100
  if (pct >= 90) return "GREEN"
  if (pct >= 70) return "AMBER"
  return "RED"
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  jan:0,feb:1,mar:2,apr:3,may:4,jun:5,
  jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,
}

export function parsePIDate(dateStr: string): Date {
  if (!dateStr || !dateStr.trim()) return new Date(NaN)
  const s = dateStr.trim()

  // "15 May 2026" or "15 JUNE 2026"
  const wordsMatch = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/)
  if (wordsMatch) {
    const [, d, mon, y] = wordsMatch
    const m = MONTH_MAP[mon.slice(0, 3).toLowerCase()]
    if (m !== undefined) return new Date(Number(y), m, Number(d))
  }
  // "May 15 2026"
  const wordsMatch2 = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})$/)
  if (wordsMatch2) {
    const [, mon, d, y] = wordsMatch2
    const m = MONTH_MAP[mon.slice(0, 3).toLowerCase()]
    if (m !== undefined) return new Date(Number(y), m, Number(d))
  }

  // YYYY-MM-DD (ISO)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s)

  // DD-MM-YYYY (common Indian format with dashes, e.g. "15-04-2026")
  const dashMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dashMatch) {
    const [, d, mo, y] = dashMatch.map(Number)
    return new Date(y, mo - 1, d)
  }

  // Slash-separated DD/MM/YYYY or MM/DD/YYYY
  if (s.includes("/")) {
    const parts = s.split("/")
    if (parts.length === 3) {
      const [a, b, c] = parts.map(Number)
      if (c > 31) {
        // c = year — treat as DD/MM/YYYY (Indian default)
        return new Date(c, b - 1, a)
      }
      return new Date(a, b - 1, c)
    }
  }

  // Fallback to native parser
  const native = new Date(s)
  return native
}

export function isInFY(date: Date, fy: FinancialYear): boolean {
  const { start, end } = getFYBoundaries(fy)
  return date >= start && date <= end
}

export function formatFYLabel(fy: FinancialYear): string {
  const [startYear] = fy.split("-")
  return `FY ${startYear}-${String(Number(startYear) + 1).slice(-2)}`
}
