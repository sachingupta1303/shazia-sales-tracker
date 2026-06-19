import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import {
  getPIRecords, getTargetRecords, getBuyerMaster, get8020Buyers,
  filterPIByFY, sumContainers,
} from "@/lib/data"
import {
  getCurrentFY, getPreviousFY, getCurrentFYWeek,
  targetDueTillWeek, getStatus, getAchievementPercent,
} from "@/lib/fy-utils"
import type { AppUser, FinancialYear, SalesPersonPerformance, PIRecord } from "@/types"

export const dynamic = "force-dynamic"

const UNASSIGNED = "UNASSIGNED"

// Group PI records by sales coordinator (uppercased name). Records without a
// coordinator are bucketed under UNASSIGNED so grand totals always match live data.
function groupByCoordinator(records: PIRecord[]): Record<string, PIRecord[]> {
  return records.reduce((acc, r) => {
    const key = (r.salesCoordinator || "").toUpperCase().trim() || UNASSIGNED
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

    const [allPI, targets, buyerMaster, buyers8020] = await Promise.all([
      getPIRecords(),
      getTargetRecords(fy),
      getBuyerMaster(),
      get8020Buyers(),
    ])

    const currentPI  = filterRecords(filterPIByFY(allPI, fy))
    const previousPI = filterRecords(filterPIByFY(allPI, prevFY))

    const currentByCoord  = groupByCoordinator(currentPI)
    const previousByCoord = groupByCoordinator(previousPI)

    // Build buyer → coordinator lookup. The 80/20 sheet is the PRIMARY target
    // source and carries the coordinator on each row, so it's authoritative;
    // Buyer Master and PI data fill gaps for any TARGET_MASTER-fallback buyers.
    const buyerToCoord = new Map<string, string>()
    const remember = (key: string | undefined, coord: string | undefined) => {
      if (key && coord) buyerToCoord.set(key.toUpperCase().trim(), coord.toUpperCase().trim())
    }
    allPI.forEach((r) => {
      remember(r.buyerCompanyName, r.salesCoordinator)
      remember(r.buyerCode, r.salesCoordinator)
    })
    buyerMaster.forEach((b) => {
      remember(b.buyerCompanyName, b.salesCoordinator)
      remember(b.buyerCode, b.salesCoordinator)
    })
    buyers8020.forEach((b) => {
      remember(b.buyerName, b.salesCoordinator)
    })

    // Aggregate targets by coordinator (apply country filter if present).
    // Targets with no resolvable coordinator go to UNASSIGNED — never dropped —
    // so the grand total always equals the full FY target.
    const targetByCoord: Record<string, number> = {}
    targets.forEach((t) => {
      if (country && t.countries.toUpperCase() !== country.toUpperCase()) return
      const coord = buyerToCoord.get(t.buyerCompanyName.toUpperCase().trim()) || UNASSIGNED
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
