import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getPIRecords, getTargetRecords, getWeeklyReviews, filterPIByFY, sumContainers, sumContainersBy } from "@/lib/data"
import {
  getCurrentFY, getCurrentFYWeek, targetDueTillWeek,
  getStatus, FY_CYCLES, getCycleForWeek,
} from "@/lib/fy-utils"
import type { AppUser, WeeklyBar, CycleProgress, PerformanceStatus } from "@/types"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user  = session.user as unknown as AppUser
  const isSP  = user.role === "SALES_PERSON"
  const url   = new URL(req.url)
  const spFilter = isSP
    ? (user.salesPersonName ?? "")
    : (url.searchParams.get("salesPerson") ?? "")

  const currentFY   = getCurrentFY()
  const currentWeek = getCurrentFYWeek()

  const [allPI, targets] = await Promise.all([
    getPIRecords(),
    getTargetRecords(currentFY),
  ])
  // Weekly reviews are optional context — never let their failure zero the page
  let reviews: Awaited<ReturnType<typeof getWeeklyReviews>> = []
  try {
    reviews = await getWeeklyReviews(currentFY, spFilter || undefined)
  } catch (e) {
    console.error("[execution] weekly reviews fetch failed:", e)
  }

  // Filter PI for current FY + optional SP
  let fyPI = filterPIByFY(allPI, currentFY)
  if (spFilter) {
    fyPI = fyPI.filter((r) => r.salesPerson.toLowerCase() === spFilter.toLowerCase())
    targets.splice(
      0,
      targets.length,
      ...targets.filter((t) => t.salesPerson.toLowerCase() === spFilter.toLowerCase())
    )
  }

  const totalTarget = targets.reduce((s, t) => s + t.currentYearTargetContainers, 0)
  const weeklyTargetSlice = totalTarget / 52

  // Containers by week — count each PI once (containers are PI-level)
  const actualByWeek = sumContainersBy(fyPI, (r) => r.fyWeekNo)

  // Build 52 weekly bars
  const weeklyBars: WeeklyBar[] = Array.from({ length: currentWeek }, (_, i) => {
    const w      = i + 1
    const target = parseFloat(weeklyTargetSlice.toFixed(2))
    const actual = actualByWeek.get(w) ?? 0
    const status = getStatus(target, actual, target) as PerformanceStatus
    return { fyWeek: w, cycle: getCycleForWeek(w as any).cycle, label: `W${w}`, target, actual, status }
  })

  // Build cycle progress
  const cycles: CycleProgress[] = FY_CYCLES.map((c) => {
    const cycleWeeks   = weeklyBars.filter((b) => b.fyWeek >= c.startWeek && b.fyWeek <= c.endWeek)
    const cycleTarget  = parseFloat((weeklyTargetSlice * 12).toFixed(2))
    const cycleActual  = cycleWeeks.reduce((s, b) => s + b.actual, 0)
    const achPct       = cycleTarget > 0 ? Math.round((cycleActual / cycleTarget) * 100) : 0
    const gap          = cycleActual - cycleTarget
    const isCurrent    = currentWeek >= c.startWeek && currentWeek <= c.endWeek
    const isCompleted  = currentWeek > c.endWeek
    const isFuture     = currentWeek < c.startWeek

    const score: CycleProgress["score"] = isFuture
      ? "IN_PROGRESS"
      : isCurrent
      ? "IN_PROGRESS"
      : achPct >= 90 ? "GREEN" : achPct >= 70 ? "AMBER" : "RED"

    // Dates (approximate from FY start = April 1)
    const fyStartYear = parseInt(currentFY.split("-")[0])
    const fyStart     = new Date(fyStartYear, 3, 1)
    const startDate   = new Date(fyStart.getTime() + (c.startWeek - 1) * 7 * 86400000)
    const endDate     = new Date(fyStart.getTime() + c.endWeek * 7 * 86400000 - 86400000)

    return {
      cycle:              c.cycle,
      cycleName:          c.name,
      startWeek:          c.startWeek,
      endWeek:            c.endWeek,
      startDate:          startDate.toISOString().split("T")[0],
      endDate:            endDate.toISOString().split("T")[0],
      targetContainers:   cycleTarget,
      actualContainers:   cycleActual,
      gap,
      achievementPercent: achPct,
      score,
      weeks: cycleWeeks.map((b) => ({
        fyWeek:           b.fyWeek,
        cycle:            c.cycle,
        weekInCycle:      b.fyWeek - c.startWeek + 1,
        targetContainers: b.target,
        actualContainers: b.actual,
        gap:              b.actual - b.target,
        status:           b.status,
      })),
    }
  })

  const totalActual  = sumContainers(fyPI)
  const targetDue    = targetDueTillWeek(totalTarget, currentWeek)
  const overallGap   = totalActual - targetDue
  const achievePct   = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0
  const currentCycle = getCycleForWeek(currentWeek as any)

  return NextResponse.json({
    currentFY,
    currentWeek,
    currentCycle:      currentCycle.cycle,
    weekInCurrentCycle: currentWeek - currentCycle.startWeek + 1,
    summary: {
      totalTarget, totalActual, targetDue,
      gap: overallGap, achievementPct: achievePct,
    },
    cycles,
    weeklyBars,
    reviews: reviews.slice(0, 10),
    filterOptions: {
      salesPersons: [...new Set(
        allPI.map((r) => r.salesPerson).filter(Boolean)
      )].sort(),
    },
  })
}
