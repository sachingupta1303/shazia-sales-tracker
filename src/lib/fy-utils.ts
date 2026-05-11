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
  const diffMs = date.getTime() - start.getTime()
  if (diffMs < 0) return 1
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return (Math.ceil((diffDays + 1) / 7) as FYWeek) || 1
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

export function parsePIDate(dateStr: string): Date {
  // Handles MM/DD/YYYY and YYYY-MM-DD
  if (dateStr.includes("/")) {
    const [m, d, y] = dateStr.split("/")
    return new Date(Number(y), Number(m) - 1, Number(d))
  }
  return new Date(dateStr)
}

export function isInFY(date: Date, fy: FinancialYear): boolean {
  const { start, end } = getFYBoundaries(fy)
  return date >= start && date <= end
}

export function formatFYLabel(fy: FinancialYear): string {
  const [startYear] = fy.split("-")
  return `FY ${startYear}-${String(Number(startYear) + 1).slice(-2)}`
}
