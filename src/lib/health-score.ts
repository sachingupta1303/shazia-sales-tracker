/**
 * Buyer Health Score Engine
 *
 * 5 dimensions (container-based, no payment data):
 *  1. Target Achievement  — 40 pts
 *  2. Growth vs Last Year — 25 pts
 *  3. Order Frequency     — 20 pts
 *  4. Recent Trend        — 10 pts
 *  5. Engagement Activity —  5 pts (placeholder until lead-activity module)
 *
 * Labels:
 *  80–100 → STRONG
 *  60–79  → HEALTHY
 *  40–59  → AT_RISK
 *  20–39  → CRITICAL
 *   0–19  → DORMANT
 */

import type { BuyerHealthScore, HealthLabel } from "@/types"
import { getCurrentFYWeek } from "./fy-utils"

export interface HealthInput {
  target:         number   // FY2026 target containers
  actual:         number   // FY2026 actual to date
  prevYearActual: number   // FY2025 actual
  orderCount:     number   // orders placed in current FY
  containersByWeek: Map<number, number>  // fyWeek → containers (current FY)
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

// ── 1. Target Achievement (0–40) ─────────────────────────────────────────────
function scoreTargetAchievement(target: number, actual: number): number {
  if (target === 0) return 20  // neutral — no target set
  const currentWeek = getCurrentFYWeek()
  // expected by now
  const targetDue   = (target / 52) * currentWeek
  if (targetDue === 0) return 20
  const ratio = actual / targetDue
  if (ratio >= 1.0)  return 40
  if (ratio >= 0.85) return 32
  if (ratio >= 0.70) return 24
  if (ratio >= 0.50) return 14
  if (ratio >= 0.25) return 7
  return 0
}

// ── 2. Growth vs Last Year (0–25) ────────────────────────────────────────────
function scoreGrowthVsLastYear(actual: number, prevYearActual: number): number {
  if (prevYearActual === 0 && actual === 0) return 0   // dormant both years
  if (prevYearActual === 0)                 return 15  // new buyer — neutral positive
  const growthPct = ((actual - prevYearActual) / prevYearActual) * 100
  if (growthPct >= 20)  return 25
  if (growthPct >= 10)  return 20
  if (growthPct >= 0)   return 15
  if (growthPct >= -10) return 8
  return 0
}

// ── 3. Order Frequency (0–20) ────────────────────────────────────────────────
// Measured as orders per 12 FY-weeks (normalised to current elapsed time)
function scoreOrderFrequency(orderCount: number): number {
  const weeksElapsed  = Math.max(1, getCurrentFYWeek())
  const cyclesElapsed = weeksElapsed / 12
  const ordersPerCycle = orderCount / cyclesElapsed

  if (ordersPerCycle >= 4) return 20
  if (ordersPerCycle >= 3) return 16
  if (ordersPerCycle >= 2) return 11
  if (ordersPerCycle >= 1) return 6
  if (orderCount >= 1)     return 3   // at least one order ever
  return 0
}

// ── 4. Recent Trend (0–10) ───────────────────────────────────────────────────
// Compare last 4 FY-weeks vs prior 4 FY-weeks
function scoreRecentTrend(containersByWeek: Map<number, number>): number {
  const currentWeek  = getCurrentFYWeek()
  const recent4Start = Math.max(1, currentWeek - 3)
  const prior4Start  = Math.max(1, currentWeek - 7)

  let recentSum = 0
  let priorSum  = 0

  for (let w = recent4Start; w <= currentWeek; w++)    recentSum += containersByWeek.get(w) ?? 0
  for (let w = prior4Start;  w < recent4Start; w++)    priorSum  += containersByWeek.get(w) ?? 0

  if (recentSum === 0 && priorSum === 0) return 0
  if (priorSum  === 0) return 7   // first orders coming in — positive

  const changePct = ((recentSum - priorSum) / priorSum) * 100
  if (changePct >= 10)  return 10
  if (changePct >= -5)  return 7   // roughly stable
  if (changePct >= -20) return 3
  return 0
}

// ── 5. Engagement Activity (0–5) ─────────────────────────────────────────────
// Placeholder: returns neutral 3 until lead-activity module (Sprint 4) exists
function scoreEngagementActivity(): number {
  return 3
}

// ── Label ─────────────────────────────────────────────────────────────────────
function deriveLabel(total: number, actual: number): HealthLabel {
  if (actual === 0) return "DORMANT"
  if (total >= 80)  return "STRONG"
  if (total >= 60)  return "HEALTHY"
  if (total >= 40)  return "AT_RISK"
  if (total >= 20)  return "CRITICAL"
  return "DORMANT"
}

// ── Main export ───────────────────────────────────────────────────────────────
export function calcHealthScore(input: HealthInput): BuyerHealthScore {
  const targetAchievement  = clamp(scoreTargetAchievement(input.target, input.actual),    0, 40)
  const growthVsLastYear   = clamp(scoreGrowthVsLastYear(input.actual, input.prevYearActual), 0, 25)
  const orderFrequency     = clamp(scoreOrderFrequency(input.orderCount),                   0, 20)
  const recentTrend        = clamp(scoreRecentTrend(input.containersByWeek),                0, 10)
  const engagementActivity = clamp(scoreEngagementActivity(),                               0,  5)

  const total = targetAchievement + growthVsLastYear + orderFrequency + recentTrend + engagementActivity

  return {
    total:              Math.round(total),
    targetAchievement,
    growthVsLastYear,
    orderFrequency,
    recentTrend,
    engagementActivity,
    label: deriveLabel(total, input.actual),
  }
}
