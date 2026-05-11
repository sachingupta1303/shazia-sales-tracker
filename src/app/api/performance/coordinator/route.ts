/**
 * GET /api/performance/coordinator
 *   Returns per-coordinator performance metrics.
 *   A "coordinator" = any person who has been assigned tasks with role SALES_COORDINATOR.
 *
 * Filters:
 *   - country, salesPerson (filters tasks by buyer's country/owner — used to scope metrics)
 *   - coordinator (limit to one coordinator)
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getTasks } from "@/lib/data"
import type { AppUser, BuyerTask, PerformanceStatus } from "@/types"

export const dynamic = "force-dynamic"

interface CoordinatorRow {
  coordinator:           string
  assignedBuyers:        number   // distinct buyers with tasks OR PI records for this coordinator
  meetingsFixed:         number   // DONE tasks of type MEETING_FIX
  pitchesPrepared:       number   // DONE tasks of type PITCH_PREP
  productAvailability:   number   // DONE tasks of type PRODUCT_AVAILABILITY
  marketResearchDone:    number   // DONE tasks of type MARKET_RESEARCH / MARKET_PRODUCTS / PRODUCT_MATCH
  tasksCompleted:        number   // all DONE tasks
  tasksOpen:             number   // OPEN + IN_PROGRESS
  tasksOverdue:          number
  totalTasks:            number
  completionRate:        number   // % of tasks completed (DONE / total)
  
  // PI Metrics
  actualContainers:      number
  targetContainers:      number
  achievementPercent:    number
  status:                PerformanceStatus
}

function isResearchType(t: BuyerTask["taskType"]) {
  return t === "MARKET_RESEARCH" || t === "MARKET_PRODUCTS" || t === "PRODUCT_MATCH"
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  if (user.role === "SALES_PERSON") {
    return NextResponse.json({ error: "Access denied" }, { status: 403 })
  }

  const url            = new URL(req.url)
  const countryFilter  = url.searchParams.get("country")     || ""
  const coordinatorParam = url.searchParams.get("coordinator") || ""

  const [allTasks, allPI, targets, buyerMaster] = await Promise.all([
    getTasks({ limit: 5000 }),
    import("@/lib/data").then(m => m.getPIRecords()),
    import("@/lib/fy-utils").then(m => import("@/lib/data").then(d => d.getTargetRecords(m.getCurrentFY()))),
    import("@/lib/data").then(m => m.getBuyerMaster())
  ])

  // Aggregate by coordinator name
  const coordData = new Map<string, { 
    tasks: BuyerTask[]; 
    actual: number; 
    target: number;
    buyers: Set<string>;
  }>()

  const getEntry = (name: string) => {
    const n = name.trim().toUpperCase()
    if (!coordData.has(n)) {
      coordData.set(n, { tasks: [], actual: 0, target: 0, buyers: new Set() })
    }
    return coordData.get(n)!
  }

  // 1. Tasks
  for (const t of allTasks) {
    if (!t.assignedTo) continue
    if (countryFilter && t.country.toUpperCase() !== countryFilter.toUpperCase()) continue
    if (coordinatorParam && t.assignedTo.toLowerCase() !== coordinatorParam.toLowerCase()) continue
    
    const entry = getEntry(t.assignedTo)
    entry.tasks.push(t)
    entry.buyers.add(t.buyerCode || t.buyerName)
  }

  // 2. PI Records
  const currentFY = await import("@/lib/fy-utils").then(m => m.getCurrentFY())
  for (const r of allPI) {
    if (r.financialYear !== currentFY) continue
    if (!r.salesCoordinator) continue
    if (countryFilter && r.countries.toUpperCase() !== countryFilter.toUpperCase()) continue
    if (coordinatorParam && r.salesCoordinator.toLowerCase() !== coordinatorParam.toLowerCase()) continue
    
    const entry = getEntry(r.salesCoordinator)
    entry.actual += r.totalContainers
    entry.buyers.add(r.buyerCode || r.buyerCompanyName)
  }

  // 3. Targets (Map coordinator from Buyer Master or PI data)
  const buyerToCoord = new Map<string, string>()
  buyerMaster.forEach(b => {
    if (b.salesCoordinator) {
      buyerToCoord.set(b.buyerCompanyName.toUpperCase(), b.salesCoordinator.toUpperCase())
      if (b.buyerCode) buyerToCoord.set(b.buyerCode.toUpperCase(), b.salesCoordinator.toUpperCase())
    }
  })
  // Also use PI data to fill gaps in mapping
  allPI.forEach(r => {
    if (r.salesCoordinator) {
      buyerToCoord.set(r.buyerCompanyName.toUpperCase(), r.salesCoordinator.toUpperCase())
      if (r.buyerCode) buyerToCoord.set(r.buyerCode.toUpperCase(), r.salesCoordinator.toUpperCase())
    }
  })

  for (const t of targets) {
    const coordName = buyerToCoord.get(t.buyerCompanyName.toUpperCase())
    if (coordName) {
      if (coordinatorParam && coordName.toLowerCase() !== coordinatorParam.toLowerCase()) continue
      const entry = getEntry(coordName)
      entry.target += t.currentYearTargetContainers
    }
  }

  const rows: CoordinatorRow[] = []
  const { getStatus, getAchievementPercent, targetDueTillWeek, getCurrentFYWeek } = await import("@/lib/fy-utils")
  const currentWeek = getCurrentFYWeek()

  for (const [name, data] of coordData) {
    const list = data.tasks
    const done       = list.filter((t) => t.status === "DONE")
    const overdue    = list.filter((t) => t.status === "OVERDUE")
    const open       = list.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS")
    const meetings   = done.filter((t) => t.taskType === "MEETING_FIX").length
    const pitches    = done.filter((t) => t.taskType === "PITCH_PREP").length
    const products   = done.filter((t) => t.taskType === "PRODUCT_AVAILABILITY").length
    const research   = done.filter((t) => isResearchType(t.taskType)).length

    const completion = list.length > 0
      ? Math.round((done.length / list.length) * 100)
      : 0
    
    const target = data.target
    const actual = data.actual
    const due    = targetDueTillWeek(target, currentWeek)
    
    rows.push({
      coordinator:         name,
      assignedBuyers:      data.buyers.size,
      meetingsFixed:       meetings,
      pitchesPrepared:     pitches,
      productAvailability: products,
      marketResearchDone:  research,
      tasksCompleted:      done.length,
      tasksOpen:           open.length,
      tasksOverdue:        overdue.length,
      totalTasks:          list.length,
      completionRate:      completion,
      actualContainers:    parseFloat(actual.toFixed(1)),
      targetContainers:    target,
      achievementPercent:  getAchievementPercent(actual, due),
      status:              getStatus(target, actual, due)
    })
  }

  rows.sort((a, b) => b.tasksCompleted - a.tasksCompleted || b.totalTasks - a.totalTasks)

  const summary = {
    totalCoordinators:   rows.length,
    totalTasksCompleted: rows.reduce((s, r) => s + r.tasksCompleted, 0),
    totalTasksOpen:      rows.reduce((s, r) => s + r.tasksOpen,      0),
    totalTasksOverdue:   rows.reduce((s, r) => s + r.tasksOverdue,   0),
    totalMeetingsFixed:  rows.reduce((s, r) => s + r.meetingsFixed,  0),
    totalProductUpdates: rows.reduce((s, r) => s + r.productAvailability, 0),
    totalAssignedBuyers: rows.reduce((s, r) => s + r.assignedBuyers, 0),
    totalActualContainers: parseFloat(rows.reduce((s, r) => s + r.actualContainers, 0).toFixed(1)),
  }

  // Filter options
  const allCoordinators = [...new Set(allTasks
    .filter((t) => t.assignedRole === "SALES_COORDINATOR" && t.assignedTo)
    .map((t) => t.assignedTo)
  )].sort()

  return NextResponse.json({
    rows,
    summary,
    filterOptions: { coordinators: allCoordinators },
    meta: { generatedAt: new Date().toISOString() },
  })
}
