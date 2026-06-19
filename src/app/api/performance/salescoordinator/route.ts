import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import {
  getPIRecords, getTargetRecords, getBuyerMaster,
  filterPIByFY, sumContainers,
} from "@/lib/data"
import {
  getCurrentFY, getPreviousFY, getCurrentFYWeek,
  targetDueTillWeek, getStatus, getAchievementPercent,
} from "@/lib/fy-utils"
import type { AppUser, FinancialYear, SalesPersonPerformance, PIRecord } from "@/types"

export const dynamic = "force-dynamic"

// Group PI records by sales coordinator (uppercased name).
function groupByCoordinator(records: PIRecord[]): Record<string, PIRecord[]> {
  return records.reduce((acc, r) => {
    const key = (r.salesCoordinator || "").toUpperCase().trim()
    if (!key) return acc
    acc[key] = acc[key] ? [...acc[key], r] : [r]
    return acc
  }, {} as Record<string, PIRecord[]>)
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
    const coordParam = url.searchParams.get("salesCoordinator") || url.searchParams.get("coordinator") || ""

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

    const [allPI, targets, buyerMaster] = await Promise.all([
      getPIRecords(),
      getTargetRecords(fy),
      getBuyerMaster(),
    ])

    const currentPI  = filterRecords(filterPIByFY(allPI, fy))
    const previousPI = filterRecords(filterPIByFY(allPI, prevFY))

    const currentByCoord  = groupByCoordinator(currentPI)
    const previousByCoord = groupByCoordinator(previousPI)

    // Map each buyer → its sales coordinator (Buyer Master first, PI data fills gaps).
    const buyerToCoord = new Map<string, string>()
    buyerMaster.forEach((b) => {
      if (b.salesCoordinator) {
        buyerToCoord.set(b.buyerCompanyName.toUpperCase(), b.salesCoordinator.toUpperCase())
        if (b.buyerCode) buyerToCoord.set(b.buyerCode.toUpperCase(), b.salesCoordinator.toUpperCase())
      }
    })
    allPI.forEach((r) => {
      if (r.salesCoordinator) {
        buyerToCoord.set(r.buyerCompanyName.toUpperCase(), r.salesCoordinator.toUpperCase())
        if (r.buyerCode) buyerToCoord.set(r.buyerCode.toUpperCase(), r.salesCoordinator.toUpperCase())
      }
    })

    // Aggregate targets by coordinator (apply country filter if present).
    const targetByCoord: Record<string, number> = {}
    targets.forEach((t) => {
      if (country && t.countries.toUpperCase() !== country.toUpperCase()) return
      const coord = buyerToCoord.get(t.buyerCompanyName.toUpperCase())
      if (!coord) return
      targetByCoord[coord] = (targetByCoord[coord] || 0) + t.currentYearTargetContainers
    })

    const allCoords = new Set([
      ...Object.keys(currentByCoord),
      ...Object.keys(previousByCoord),
      ...Object.keys(targetByCoord),
    ])

    const rows: SalesPersonPerformance[] = []

    for (const coord of allCoords) {
      if (!coord || coord === "UNDEFINED") continue
      if (coordParam && coord !== coordParam.toUpperCase()) continue

      const actual   = sumContainers(currentByCoord[coord]  || [])
      const prevYear = sumContainers(previousByCoord[coord] || [])
      const target   = targetByCoord[coord] || 0
      const due      = targetDueTillWeek(target, week)
      const gap      = parseFloat((actual - due).toFixed(2))

      const activeBuyers = new Set(
        (currentByCoord[coord] || []).map((r) => r.buyerCode || r.buyerCompanyName)
      ).size

      rows.push({
        salesPerson:        coord,
        previousYear:       parseFloat(prevYear.toFixed(1)),
        target,
        targetDue:          due,
        actual:             parseFloat(actual.toFixed(1)),
        gap,
        status:             getStatus(target, actual, due),
        achievementPercent: getAchievementPercent(actual, due),
        activeBuyers,
      })
    }

    rows.sort((a, b) => b.target - a.target || b.actual - a.actual)

    const summary = {
      totalTarget:       rows.reduce((s, r) => s + r.target, 0),
      totalActual:       parseFloat(rows.reduce((s, r) => s + r.actual, 0).toFixed(1)),
      totalPrev:         parseFloat(rows.reduce((s, r) => s + r.previousYear, 0).toFixed(1)),
      totalGap:          parseFloat(rows.reduce((s, r) => s + r.gap, 0).toFixed(1)),
      totalActiveBuyers: rows.reduce((s, r) => s + r.activeBuyers, 0),
    }

    return NextResponse.json({
      rows,
      summary,
      meta: { fy, prevFY, week, total: rows.length, generatedAt: new Date().toISOString() },
    })
  } catch (error) {
    console.error("Sales Coordinator Performance API Error:", error)
    return NextResponse.json({ error: "Failed to fetch sales coordinator performance data" }, { status: 500 })
  }
}
