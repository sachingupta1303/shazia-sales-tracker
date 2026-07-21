/**
 * Sales Coordinator dataset — one processed row per buyer, FY-based.
 *
 * GET /api/coordinator                 — for the in-app view (session, admin)
 * GET /api/coordinator?token=SECRET    — external pull (e.g. Apps Script price
 *                                         calculator). token = CRON_SECRET env.
 *
 * Per buyer: coordinator/person (+emails), containers & qty & orders for
 * previous + current FY, avg purchase cycle, varieties, target, and last 5 orders
 * (date, PI no, brand, variety, qty MT, rate/MT). Buyer names are already merged
 * (getPIRecords canonicalization), so variants count as one.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getPIRecords, get8020Buyers, getTargetRecords } from "@/lib/data"
import { getCurrentFY, getPreviousFY, isInFY, parsePIDate } from "@/lib/fy-utils"
import type { AppUser, PIRecord, FinancialYear } from "@/types"

const norm = (s: string) => (s ?? "").toLowerCase().trim()

interface OrderLine { date: string; piNo: string; brand: string; variety: string; description: string; qtyMT: number; rate: number }

// Collapse a buyer's PI rows into unique orders (one per PI number)
function uniqueOrders(pis: PIRecord[]): { piNo: string; date: string; containers: number; qtyMT: number; brand: string; variety: string; description: string; rate: number; country: string }[] {
  const byPI = new Map<string, PIRecord[]>()
  for (const r of pis) {
    if (!byPI.has(r.piNumber)) byPI.set(r.piNumber, [])
    byPI.get(r.piNumber)!.push(r)
  }
  return [...byPI.entries()].map(([piNo, rows]) => {
    const first = rows[0]
    return {
      piNo,
      date:        first.piDate,
      containers:  first.totalContainers,             // PI-level (same across product rows)
      qtyMT:       rows.reduce((s, x) => s + (x.qtyMTs || 0), 0),
      brand:       rows.find((x) => x.brand)?.brand ?? "",
      variety:     rows.find((x) => x.varieties)?.varieties ?? "",
      description: rows.find((x) => x.description)?.description ?? "",
      rate:        rows.find((x) => x.rate)?.rate ?? 0,
      country:     first.countries,
    }
  })
}

function avgCycleDays(datesAsc: number[]): number {
  if (datesAsc.length < 2) return 0
  let gaps = 0
  for (let i = 1; i < datesAsc.length; i++) gaps += (datesAsc[i] - datesAsc[i - 1])
  const avgMs = gaps / (datesAsc.length - 1)
  return Math.round(avgMs / 86_400_000)
}

export async function GET(req: Request) {
  const url   = new URL(req.url)
  const token = url.searchParams.get("token")
  const viaToken = !!token && token === process.env.CRON_SECRET

  if (!viaToken) {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const role = (session.user as unknown as AppUser).role
    if (!["MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const currFY = getCurrentFY()
  const prevFY = getPreviousFY(currFY)

  const [allPI, buyers8020, targets] = await Promise.all([
    getPIRecords(), get8020Buyers(), getTargetRecords(currFY),
  ])

  // 80/20 info by buyer name (coordinator / person + emails + tier + target)
  const info = new Map<string, { salesPerson: string; salesPersonEmail: string; salesCoordinator: string; salesCoordinatorEmail: string; tier: string; target: number; country: string }>()
  for (const b of buyers8020) {
    info.set(norm(b.buyerName), {
      salesPerson:          b.responsiblePerson || "",
      salesPersonEmail:     b.responsibleEmail || "",
      salesCoordinator:     b.salesCoordinator || "",
      salesCoordinatorEmail:b.coordinatorEmail || "",
      tier:                 b.tier,
      target:               b.annualTarget || 0,
      country:              b.country || "",
    })
  }
  // target fallback from TARGET_MASTER
  const tgtByName = new Map<string, number>()
  for (const t of targets) {
    const k = norm(t.buyerCompanyName)
    tgtByName.set(k, (tgtByName.get(k) ?? 0) + t.currentYearTargetContainers)
  }

  // Group PI by (merged) buyer name
  const g = new Map<string, PIRecord[]>()
  for (const r of allPI) {
    const k = norm(r.buyerCompanyName)
    if (!k) continue
    if (!g.has(k)) g.set(k, [])
    g.get(k)!.push(r)
  }

  // Buyer universe = PI buyers ∪ 80/20 buyers
  const keys = new Set<string>([...g.keys(), ...info.keys()])

  const buyers = [...keys].map((k) => {
    const pis      = g.get(k) ?? []
    const nameInfo = info.get(k)
    const displayName = pis[0]?.buyerCompanyName || buyers8020.find((b) => norm(b.buyerName) === k)?.buyerName || k

    const currOrders = uniqueOrders(pis.filter((r) => isInFY(parsePIDate(r.piDate), currFY)))
    const prevOrders = uniqueOrders(pis.filter((r) => isInFY(parsePIDate(r.piDate), prevFY)))
    const allOrders  = uniqueOrders(pis).sort((a, b) => parsePIDate(b.date).getTime() - parsePIDate(a.date).getTime())

    const sum = (arr: { containers?: number; qtyMT?: number }[], f: "containers" | "qtyMT") =>
      arr.reduce((s, o) => s + (o[f] || 0), 0)

    const datesAsc = allOrders.map((o) => parsePIDate(o.date).getTime()).filter((t) => !isNaN(t)).sort((a, b) => a - b)
    const varieties = [...new Set(pis.map((r) => r.varieties).filter(Boolean))]

    const last5: OrderLine[] = allOrders.slice(0, 5).map((o) => ({
      date: o.date, piNo: o.piNo, brand: o.brand, variety: o.variety, description: o.description, qtyMT: Math.round(o.qtyMT), rate: Math.round(o.rate),
    }))

    return {
      buyerName:             displayName,
      country:               pis[0]?.countries || nameInfo?.country || "",
      salesPerson:           nameInfo?.salesPerson || pis[0]?.salesPerson || "",
      salesPersonEmail:      nameInfo?.salesPersonEmail || "",
      salesCoordinator:      nameInfo?.salesCoordinator || pis[0]?.salesCoordinator || "",
      salesCoordinatorEmail: nameInfo?.salesCoordinatorEmail || "",
      tier:                  nameInfo?.tier || "OTHERS",
      target:                nameInfo?.target || tgtByName.get(k) || 0,
      ordersPrevFY:          prevOrders.length,
      ordersCurrFY:          currOrders.length,
      containersPrevFY:      Math.round(sum(prevOrders, "containers")),
      containersCurrFY:      Math.round(sum(currOrders, "containers")),
      qtyMTPrevFY:           Math.round(sum(prevOrders, "qtyMT")),
      qtyMTCurrFY:           Math.round(sum(currOrders, "qtyMT")),
      avgCycleDays:          avgCycleDays(datesAsc),
      varieties,
      last5Orders:           last5,
    }
  })
  .filter((b) => b.containersPrevFY > 0 || b.containersCurrFY > 0 || b.target > 0 || b.salesCoordinator || b.salesPerson)
  .sort((a, b) => b.containersCurrFY - a.containersCurrFY || a.buyerName.localeCompare(b.buyerName))

  const filters = {
    salesCoordinators: [...new Set(buyers.map((b) => b.salesCoordinator).filter(Boolean))].sort(),
    salesPersons:      [...new Set(buyers.map((b) => b.salesPerson).filter(Boolean))].sort(),
    countries:         [...new Set(buyers.map((b) => b.country).filter(Boolean))].sort(),
  }

  return NextResponse.json({ buyers, filters, meta: { currFY, prevFY, total: buyers.length } })
}
