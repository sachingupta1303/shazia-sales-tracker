import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import {
  getPIRecords, getTargetRecords, getLeadActivities,
  filterPIByFY, sumContainers, groupBySalesPerson,
} from "@/lib/data"
import {
  getCurrentFY, getPreviousFY, getCurrentFYWeek,
  scopedTarget, getStatus, getAchievementPercent,
} from "@/lib/fy-utils"
import type { AppUser, FinancialYear, SalesPersonPerformance, PIRecord } from "@/types"

export const dynamic = "force-dynamic"

interface SalesPersonPerformanceRow extends SalesPersonPerformance {
  meetings:        number
  calls:           number
  whatsapp:        number
  emails:          number
  samples:         number
  followUps:       number
  totalActivities: number
  growthPct:       number | null
}

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const user = session.user as AppUser
    if (user.role === "SALES_PERSON") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const url    = new URL(req.url)
    const fy     = (url.searchParams.get("fy") || getCurrentFY()) as FinancialYear
    const prevFY = getPreviousFY(fy)
    const week   = getCurrentFYWeek()

    const fyWeek    = Number(url.searchParams.get("fyWeek")    || "0")
    const fyMonth   = Number(url.searchParams.get("fyMonth")   || "0")
    const fyQuarter = Number(url.searchParams.get("fyQuarter") || "0")
    const country   = url.searchParams.get("country") || ""
    const spParam   = url.searchParams.get("salesPerson") || ""

    const matchPeriod = (r: PIRecord) => {
      if (fyMonth   && r.fyMonthNo  !== fyMonth)   return false
      if (fyWeek    && r.fyWeekNo   !== fyWeek)    return false
      if (fyQuarter && r.fyQuarter  !== fyQuarter) return false
      return true
    }

    const filterRecords = (records: PIRecord[]) =>
      records.filter((r) => {
        if (country && r.countries.toUpperCase() !== country.toUpperCase()) return false
        if (!matchPeriod(r)) return false
        return true
      })

    const [allPI, targets, allActivities] = await Promise.all([
      getPIRecords(),
      getTargetRecords(fy),
      getLeadActivities({ limit: 5000 }),
    ])

    const currentPI  = filterRecords(filterPIByFY(allPI, fy))
    const previousPI = filterRecords(filterPIByFY(allPI, prevFY))

    const currentBySP  = groupBySalesPerson(currentPI)
    const previousBySP = groupBySalesPerson(previousPI)

    // Aggregate targets by SP (apply country filter if present)
    const targetBySP: Record<string, number> = {}
    targets.forEach((t) => {
      if (country && t.countries.toUpperCase() !== country.toUpperCase()) return
      const sp = t.salesPerson.toUpperCase()
      targetBySP[sp] = (targetBySP[sp] || 0) + t.currentYearTargetContainers
    })

    // Activities by SP
    const activityBySP: Record<string, {
      meetings: number; calls: number; whatsapp: number; emails: number
      samples: number; followUps: number; total: number
    }> = {}
    for (const a of allActivities) {
      const sp = a.salesPerson?.toUpperCase()
      if (!sp) continue
      const e = activityBySP[sp] ??= {
        meetings: 0, calls: 0, whatsapp: 0, emails: 0, samples: 0, followUps: 0, total: 0,
      }
      e.total++
      switch (a.activityType) {
        case "MEETING":      e.meetings++;  break
        case "VISIT":        e.meetings++;  break
        case "CALL":         e.calls++;     break
        case "WHATSAPP":     e.whatsapp++;  break
        case "EMAIL":        e.emails++;    break
        case "SAMPLE_SENT":  e.samples++;   break
        case "FOLLOW_UP":    e.followUps++; break
      }
    }

    const allSPs = new Set([
      ...Object.keys(currentBySP),
      ...Object.keys(previousBySP),
      ...Object.keys(targetBySP),
      ...Object.keys(activityBySP),
    ])

    const rows: SalesPersonPerformanceRow[] = []

    for (const sp of allSPs) {
      if (!sp || sp === "UNDEFINED") continue
      if (spParam && sp !== spParam.toUpperCase()) continue

      const actual   = sumContainers(currentBySP[sp]  || [])
      const prevYear = sumContainers(previousBySP[sp] || [])
      const { target, due } = scopedTarget(targetBySP[sp] || 0, { fyMonth, fyQuarter, fyWeek }, week)
      const gap      = parseFloat((actual - due).toFixed(2))

      const activeBuyers = new Set(
        (currentBySP[sp] || []).map((r) => r.buyerCode || r.buyerCompanyName)
      ).size

      const act = activityBySP[sp] ?? { meetings: 0, calls: 0, whatsapp: 0, emails: 0, samples: 0, followUps: 0, total: 0 }

      rows.push({
        salesPerson:        sp,
        previousYear:       parseFloat(prevYear.toFixed(1)),
        target,
        targetDue:          due,
        actual:             parseFloat(actual.toFixed(1)),
        gap,
        status:             getStatus(target, actual, due),
        achievementPercent: getAchievementPercent(actual, due),
        activeBuyers,
        meetings:        act.meetings,
        calls:           act.calls,
        whatsapp:        act.whatsapp,
        emails:          act.emails,
        samples:         act.samples,
        followUps:       act.followUps,
        totalActivities: act.total,
        growthPct: prevYear > 0 ? Math.round(((actual - prevYear) / prevYear) * 100) : null,
      })
    }

    rows.sort((a, b) => b.target - a.target || b.actual - a.actual)

    const summary = {
      totalTarget:     rows.reduce((s, r) => s + r.target, 0),
      totalActual:     parseFloat(rows.reduce((s, r) => s + r.actual, 0).toFixed(1)),
      totalPrev:       parseFloat(rows.reduce((s, r) => s + r.previousYear, 0).toFixed(1)),
      totalGap:        parseFloat(rows.reduce((s, r) => s + r.gap, 0).toFixed(1)),
      totalActiveBuyers: rows.reduce((s, r) => s + r.activeBuyers, 0),
      totalMeetings:   rows.reduce((s, r) => s + r.meetings, 0),
      totalActivities: rows.reduce((s, r) => s + r.totalActivities, 0),
      totalFollowUps:  rows.reduce((s, r) => s + r.followUps, 0),
    }

    return NextResponse.json({
      rows,
      summary,
      meta: { fy, prevFY, week, total: rows.length, generatedAt: new Date().toISOString() },
    })
  } catch (error) {
    console.error("Salesperson Performance API Error:", error)
    return NextResponse.json({ error: "Failed to fetch salesperson performance data" }, { status: 500 })
  }
}
