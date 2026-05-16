export const TIER_INTERVAL: Record<string, number> = {
  TIER1: 15,
  TIER2: 20,
  TIER3: 30,
}

export const TIER_LABEL: Record<string, string> = {
  TIER1:  "Tier 1",
  TIER2:  "Tier 2",
  TIER3:  "Tier 3",
  OTHERS: "Others",
}

export const TIER_BADGE: Record<string, string> = {
  TIER1:  "bg-red-100 text-red-700 border-red-200",
  TIER2:  "bg-orange-100 text-orange-700 border-orange-200",
  TIER3:  "bg-yellow-100 text-yellow-700 border-yellow-200",
  OTHERS: "bg-gray-100 text-gray-500 border-gray-200",
}

export const STATUS_BADGE: Record<string, string> = {
  UPCOMING: "bg-green-100 text-green-700 border-green-200",
  DUE_SOON: "bg-amber-100 text-amber-800 border-amber-200",
  OVERDUE:  "bg-red-100 text-red-700 border-red-200",
}

export const STATUS_LABEL: Record<string, string> = {
  UPCOMING: "Upcoming",
  DUE_SOON: "Due Soon",
  OVERDUE:  "Overdue",
}

// ── Meeting Outcomes ────────────────────────────────────────────────────────

/** Allowed outcome values, stored as plain strings in the sheet. */
export const MEETING_OUTCOMES = [
  "ORDER_CONFIRMED",
  "NEGOTIATING",
  "AWAITING_PI",
  "FOLLOW_UP",
  "NO_INTEREST",
  "OTHER",
] as const

export const OUTCOME_LABEL: Record<string, string> = {
  ORDER_CONFIRMED: "Order Confirmed",
  NEGOTIATING:     "Negotiating Price",
  AWAITING_PI:     "Awaiting PI",
  FOLLOW_UP:       "Follow-up Scheduled",
  NO_INTEREST:     "No Interest",
  OTHER:           "Other",
}

export const OUTCOME_BADGE: Record<string, string> = {
  ORDER_CONFIRMED: "bg-green-100 text-green-800 border-green-200",
  NEGOTIATING:     "bg-blue-100 text-blue-800 border-blue-200",
  AWAITING_PI:     "bg-violet-100 text-violet-800 border-violet-200",
  FOLLOW_UP:       "bg-amber-100 text-amber-800 border-amber-200",
  NO_INTEREST:     "bg-gray-200 text-gray-700 border-gray-300",
  OTHER:           "bg-gray-100 text-gray-600 border-gray-200",
}

export const OUTCOME_EMOJI: Record<string, string> = {
  ORDER_CONFIRMED: "🎉",
  NEGOTIATING:     "💬",
  AWAITING_PI:     "📄",
  FOLLOW_UP:       "📅",
  NO_INTEREST:     "🚫",
  OTHER:           "📝",
}

// Days remaining until a date (negative means overdue).
// Uses IST midnight (UTC+05:30) as "today" so the count is correct for users in India.
export function daysUntil(d: Date | string): number {
  const target = typeof d === "string" ? new Date(d) : d
  // IST offset = +05:30 = 330 minutes
  const IST_OFFSET_MS = 330 * 60 * 1000
  const nowUtcMs  = Date.now()
  const todayIST  = new Date(nowUtcMs + IST_OFFSET_MS)
  // Truncate to IST midnight
  const todayMidnightIST = Date.UTC(
    todayIST.getUTCFullYear(), todayIST.getUTCMonth(), todayIST.getUTCDate()
  ) - IST_OFFSET_MS
  const targetMidnight = new Date(target)
  targetMidnight.setHours(0, 0, 0, 0)
  return Math.ceil((targetMidnight.getTime() - todayMidnightIST) / 86_400_000)
}

// Advance a date by N days, skip Sunday → Monday
export function advanceDays(from: Date, days: number): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  return d
}

// Next due date from a base date based on tier interval
export function calcNextDueDate(from: Date, tier: string): Date {
  const interval = TIER_INTERVAL[tier] ?? 30
  return advanceDays(from, interval)
}

import type { MeetingDisplayStatus } from "@/types"

// Compute display status from next due date
export function getMeetingDisplayStatus(nextDueDate: Date | string): MeetingDisplayStatus {
  const days = daysUntil(nextDueDate)
  if (days < 0)  return "OVERDUE"
  if (days <= 5) return "DUE_SOON"
  return "UPCOMING"
}

// Get April 1 of the current financial year
export function currentFYStart(): Date {
  const now = new Date()
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return new Date(year, 3, 1)
}

// Initial next-due date for a buyer with no meeting history
export function getInitialDueDate(tier: string): Date {
  const fyStart = currentFYStart()
  const now     = new Date()
  let due = calcNextDueDate(fyStart, tier)
  // If FY-start + interval is already in the past, schedule from now
  if (due < now) due = calcNextDueDate(now, tier)
  return due
}

/**
 * Deterministic ±5 day offset based on buyer name.
 * Same buyer always gets the same offset, but offsets are spread out
 * across the set of buyers so reminders don't all fire on the same day.
 */
export function stableStagger(name: string, range = 5): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i)
    hash |= 0
  }
  const span = range * 2 + 1   // e.g. 11 values from -5 to +5
  return (Math.abs(hash) % span) - range
}

/**
 * Build the initial schedule for a brand-new buyer:
 *  - Generates virtual "auto-completed" history entries for every cycle
 *    that would have been due between FY start and today.
 *  - Returns the next future due date, staggered by ±5 days (deterministic).
 *
 * This gives new buyers a clean slate without showing them as
 * permanently overdue when meeting tracking starts mid-FY.
 */
export function buildInitialSchedule(tier: string, buyerName: string): {
  history: { meetingDate: string; notes: string }[]
  lastMeetingDate: string | null
  nextDueDate: string
} {
  const interval = TIER_INTERVAL[tier] ?? 30
  const stagger  = stableStagger(buyerName)
  const fyStart  = currentFYStart()
  const now      = new Date()

  const history: { meetingDate: string; notes: string }[] = []
  let lastDate: Date | null = null
  // First would-have-been due: FY start + (interval + stagger), skip Sunday
  let cursor = advanceDays(fyStart, interval + stagger)

  while (cursor < now) {
    history.push({
      meetingDate: cursor.toISOString().split("T")[0],
      notes:       "Auto-completed (system initialization — meeting tracking started after FY rollover)",
    })
    lastDate = new Date(cursor)
    cursor = advanceDays(cursor, interval)
  }

  return {
    history,
    lastMeetingDate: lastDate ? lastDate.toISOString().split("T")[0] : null,
    nextDueDate:     cursor.toISOString().split("T")[0],   // first future date
  }
}

// ISO date string → "12 May 2026"
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  })
}

// "YYYY-MM-DD" today
export function todayISO(): string {
  return new Date().toISOString().split("T")[0]
}
