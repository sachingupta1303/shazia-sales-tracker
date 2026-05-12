/**
 * GET /api/8020/dashboard
 *
 * Aggregated 80/20 page data:
 *  - tier counts (T1/T2/T3)
 *  - meeting status counts (overdue / due-soon / upcoming)
 *  - real performance totals (target + actual + achievement %)
 *  - OTHERS-tier summary (count + totals + full list with performance)
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getMeetingSchedules, getOthersBuyers } from "@/lib/data"
import type { Stats8020 } from "@/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [meetings, others] = await Promise.all([
    getMeetingSchedules(),
    getOthersBuyers(),
  ])

  const now      = new Date()
  const todayISO = now.toISOString().split("T")[0]
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const completedThisMonth = meetings.reduce((sum, m) => {
    return sum + m.history.filter((h) => h.meetingDate.startsWith(monthStr)).length
  }, 0)

  const stats: Stats8020 = {
    tier1Count:         meetings.filter((m) => m.tier === "TIER1").length,
    tier2Count:         meetings.filter((m) => m.tier === "TIER2").length,
    tier3Count:         meetings.filter((m) => m.tier === "TIER3").length,
    totalMonitored:     meetings.length,
    overdue:            meetings.filter((m) => m.displayStatus === "OVERDUE").length,
    dueSoon:            meetings.filter((m) => m.displayStatus === "DUE_SOON").length,
    upcoming:           meetings.filter((m) => m.displayStatus === "UPCOMING").length,
    completedThisMonth,
  }

  const totalTarget = meetings.reduce((s, m) => s + m.target, 0)
  const totalActual = meetings.reduce((s, m) => s + m.actual, 0)
  const overallAchievementPct = totalTarget > 0
    ? Math.round((totalActual / totalTarget) * 100)
    : 0

  const dueToday = meetings.filter((m) => m.nextDueDate === todayISO).length

  // OTHERS aggregate (no meeting tracking, just performance)
  const othersTotalTarget = others.reduce((s, b) => s + b.target, 0)
  const othersTotalActual = others.reduce((s, b) => s + b.actual, 0)
  const othersAchievementPct = othersTotalTarget > 0
    ? Math.round((othersTotalActual / othersTotalTarget) * 100)
    : 0

  return NextResponse.json({
    stats,
    dueToday,
    totalTarget,
    totalActual,
    overallAchievementPct,
    others: {
      count:           others.length,
      totalTarget:     othersTotalTarget,
      totalActual:     othersTotalActual,
      achievementPct:  othersAchievementPct,
      buyers:          others,
    },
  })
}
