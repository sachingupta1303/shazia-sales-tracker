/**
 * GET /api/lead-lag — Lead vs Lag aggregation
 *
 * Lead measures (predictive): activities logged (calls, emails, samples …)
 * Lag measures (results):     containers shipped, target achievement, orders closed
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getPIRecords, getTargetRecords, getLeadActivities, filterPIByFY } from "@/lib/data"
import {
  getCurrentFY, getCurrentFYWeek, targetDueTillWeek,
  FY_CYCLES, getCycleForWeek,
} from "@/lib/fy-utils"
import type { AppUser, ActivityType, FYCycle } from "@/types"

const ALL_TYPES: ActivityType[] = [
  "CALL", "WHATSAPP", "EMAIL", "SAMPLE_SENT",
  "VISIT", "MEETING", "FOLLOW_UP", "ORDER_PLACED",
  "DEMO", "OTHER",
]

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user  = session.user as unknown as AppUser
  const isSP  = user.role === "SALES_PERSON"
  const url   = new URL(req.url)

  const spFilter   = isSP ? (user.salesPersonName ?? "") : (url.searchParams.get("salesPerson") ?? "")
  const country    = url.searchParams.get("country") ?? ""
  const buyerCode  = url.searchParams.get("buyerCode") ?? ""
  const fyWeek     = url.searchParams.get("fyWeek")
    ? Number(url.searchParams.get("fyWeek"))
    : 0
  const cycle      = url.searchParams.get("cycle")
    ? Number(url.searchParams.get("cycle")) as FYCycle
    : 0

  const currentFY   = getCurrentFY()
  const currentWeek = getCurrentFYWeek()

  const [allPI, targets, allActivities] = await Promise.all([
    getPIRecords(),
    getTargetRecords(currentFY),
    getLeadActivities({
      salesPerson: spFilter || undefined,
      buyerCode:   buyerCode || undefined,
      limit:       1000,
    }),
  ])

  // ── Filter ──────────────────────────────────────────────────────────────
  let fyPI = filterPIByFY(allPI, currentFY)
  if (spFilter)  fyPI = fyPI.filter((r) => r.salesPerson.toLowerCase() === spFilter.toLowerCase())
  if (country)   fyPI = fyPI.filter((r) => r.countries.toUpperCase() === country.toUpperCase())
  if (buyerCode) fyPI = fyPI.filter((r) => r.buyerCode === buyerCode)

  let acts = allActivities
  if (country) acts = acts.filter((a) => a.country.toUpperCase() === country.toUpperCase())
  if (cycle) {
    const c = FY_CYCLES.find((x) => x.cycle === cycle)
    if (c) {
      acts  = acts.filter((a) => a.fyWeek >= c.startWeek && a.fyWeek <= c.endWeek)
      fyPI  = fyPI.filter((r) => r.fyWeekNo >= c.startWeek && r.fyWeekNo <= c.endWeek)
    }
  }
  if (fyWeek) {
    acts  = acts.filter((a) => a.fyWeek === fyWeek)
    fyPI  = fyPI.filter((r) => r.fyWeekNo === fyWeek)
  }

  // ── Lead Measures ────────────────────────────────────────────────────────
  const leadByType: Record<string, number> = {}
  for (const t of ALL_TYPES) leadByType[t] = 0
  for (const a of acts) leadByType[a.activityType] = (leadByType[a.activityType] ?? 0) + 1

  // Outcome breakdown
  const outcomes = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 }
  for (const a of acts) outcomes[a.outcome] = (outcomes[a.outcome] ?? 0) + 1

  // ── Lag Measures ─────────────────────────────────────────────────────────
  const totalContainers = fyPI.reduce((s, r) => s + r.totalContainers, 0)
  const ordersClosed    = fyPI.length

  // Target — restrict to filters
  let scopedTargets = targets
  if (spFilter)  scopedTargets = scopedTargets.filter((t) => t.salesPerson.toLowerCase() === spFilter.toLowerCase())
  if (country)   scopedTargets = scopedTargets.filter((t) => t.countries.toUpperCase() === country.toUpperCase())
  const totalTarget = scopedTargets.reduce((s, t) => s + t.currentYearTargetContainers, 0)
  const targetDue   = cycle
    ? (totalTarget / 52) * 12
    : fyWeek
    ? (totalTarget / 52)
    : targetDueTillWeek(totalTarget, currentWeek)
  const targetAchPct = totalTarget > 0
    ? Math.round((totalContainers / totalTarget) * 100)
    : 0

  // ── Weekly trend (lead activities by week, lag containers by week) ──────
  const weeksToShow = cycle ? 12 : 12  // last 12 weeks
  const startWeek   = cycle
    ? FY_CYCLES.find((c) => c.cycle === cycle)?.startWeek ?? 1
    : Math.max(1, currentWeek - 11)
  const endWeek     = cycle
    ? FY_CYCLES.find((c) => c.cycle === cycle)?.endWeek ?? 52
    : currentWeek

  const byWeek: { fyWeek: number; label: string; leadCount: number; lagContainers: number }[] = []
  for (let w = startWeek; w <= endWeek; w++) {
    const leadCount = acts.filter((a) => a.fyWeek === w).length
    const lagCtrs   = fyPI.filter((r) => r.fyWeekNo === w).reduce((s, r) => s + r.totalContainers, 0)
    byWeek.push({ fyWeek: w, label: `W${w}`, leadCount, lagContainers: lagCtrs })
  }

  // ── Top sales people by activity (manager view) ─────────────────────────
  const spLead: Record<string, number> = {}
  const spLag:  Record<string, number> = {}
  for (const a of allActivities) spLead[a.salesPerson] = (spLead[a.salesPerson] ?? 0) + 1
  for (const r of filterPIByFY(allPI, currentFY)) {
    spLag[r.salesPerson] = (spLag[r.salesPerson] ?? 0) + r.totalContainers
  }
  const spLeaderboard = Object.keys({ ...spLead, ...spLag })
    .filter((sp) => sp)
    .map((sp) => ({
      salesPerson: sp,
      leadCount:   spLead[sp] ?? 0,
      lagContainers: spLag[sp] ?? 0,
      ratio:       spLag[sp] && spLead[sp] ? Math.round((spLag[sp] / spLead[sp]) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.lagContainers - a.lagContainers)

  // ── Filter options ──────────────────────────────────────────────────────
  const allSP        = [...new Set(allPI.map((r) => r.salesPerson).filter(Boolean))].sort()
  const allCountries = [...new Set(allPI.map((r) => r.countries).filter(Boolean))].sort()

  return NextResponse.json({
    leadMeasures: {
      ...leadByType,
      total: acts.length,
      outcomes,
    },
    lagMeasures: {
      containers:     totalContainers,
      target:         totalTarget,
      targetDue,
      targetAchPct,
      ordersClosed,
      gap:            totalContainers - targetDue,
    },
    byWeek,
    spLeaderboard,
    recentActivities: acts.slice(0, 20),
    filterOptions: {
      salesPersons: allSP,
      countries:    allCountries,
      cycles:       FY_CYCLES.map((c) => ({ cycle: c.cycle, name: c.name })),
    },
    meta: { currentFY, currentWeek, currentCycle: getCycleForWeek(currentWeek as any).cycle },
  })
}
