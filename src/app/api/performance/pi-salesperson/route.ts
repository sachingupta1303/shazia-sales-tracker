import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { getPIRecords, getTargetRecords, filterPIByFY, sumContainers } from "@/lib/data"
import {
  getCurrentFY, getPreviousFY, getCurrentFYWeek,
  scopedTarget, getStatus, getAchievementPercent,
} from "@/lib/fy-utils"
import type { AppUser, FinancialYear, PIRecord, SalesPersonPerformance } from "@/types"

export const dynamic = "force-dynamic"

// ── Actual Sales Person view ─────────────────────────────────────────────────
// Orders are credited to the "Sales Person" written on each PI row of
// PI_BACKEND_MASTER — i.e. the person who actually booked the order — NOT the
// buyer's responsible person (that view lives in /api/performance/salesperson).
//
// Targets come from the 80/20 sheet (via getTargetRecords). A target owned by a
// combined name such as "ATIF/MOHIT GUPTA" is split equally between the people
// in it, so the grand-total target still equals the full FY target.
//
// NBD (new business) = an order from a buyer whose FIRST-EVER PI (across every
// FY in the sheet) falls in the selected FY. CRR = repeat buyer (ordered in an
// earlier FY). Same rule as the "New Business" tab.

export interface PISalesPersonRow extends SalesPersonPerformance {
  pis:        number
  mts:        number
  nbdPIs:     number
  nbdCtrs:    number
  nbdBuyers:  number
  crrPIs:     number
  crrCtrs:    number
  crrBuyers:  number
  countries: {
    country: string; pis: number; ctrs: number; mts: number
    nbdCtrs: number; crrCtrs: number; buyers: number
  }[]
  buyers: {
    buyer: string; country: string; pis: number; ctrs: number; isNew: boolean
  }[]
}

const norm = (s: string | undefined) => (s ?? "").toUpperCase().trim()
const buyerKey = (r: PIRecord) => norm(r.buyerCode) || norm(r.buyerCompanyName)
const round1 = (n: number) => parseFloat(n.toFixed(1))

/** Split a combined owner name ("ATIF/MOHIT GUPTA", "A & B", "A, B") into people. */
function splitOwners(name: string): string[] {
  return name.split(/\s*(?:\/|&|,|\+)\s*/).map(norm).filter(Boolean)
}

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const user = session.user as AppUser
    if (user.role === "SALES_PERSON") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const url       = new URL(req.url)
    const fy        = (url.searchParams.get("fy") || getCurrentFY()) as FinancialYear
    const prevFY    = getPreviousFY(fy)
    const week      = getCurrentFYWeek()
    const fyWeek    = Number(url.searchParams.get("fyWeek")    || "0")
    const fyMonth   = Number(url.searchParams.get("fyMonth")   || "0")
    const fyQuarter = Number(url.searchParams.get("fyQuarter") || "0")
    const country   = norm(url.searchParams.get("country") || "")

    const keep = (r: PIRecord) => {
      if (country   && norm(r.countries) !== country) return false
      if (fyMonth   && r.fyMonthNo  !== fyMonth)   return false
      if (fyWeek    && r.fyWeekNo   !== fyWeek)    return false
      if (fyQuarter && r.fyQuarter  !== fyQuarter) return false
      return true
    }

    const [allPI, targets] = await Promise.all([getPIRecords(), getTargetRecords(fy)])

    // First FY each buyer ever ordered in (FY strings like "2025-26" sort correctly).
    const firstFY = new Map<string, string>()
    for (const r of allPI) {
      const k = buyerKey(r)
      if (!k || !r.financialYear) continue
      const f = firstFY.get(k)
      if (!f || r.financialYear < f) firstFY.set(k, r.financialYear)
    }
    const isNew = (r: PIRecord) => firstFY.get(buyerKey(r)) === fy

    const currentPI  = filterPIByFY(allPI, fy).filter(keep)
    const previousPI = filterPIByFY(allPI, prevFY).filter(keep)

    const group = (records: PIRecord[]) => {
      const m: Record<string, PIRecord[]> = {}
      for (const r of records) (m[norm(r.salesPerson) || "UNASSIGNED"] ??= []).push(r)
      return m
    }
    const curBySP  = group(currentPI)
    const prevBySP = group(previousPI)

    // 80/20 targets, combined owners split equally.
    const targetBySP: Record<string, number> = {}
    for (const t of targets) {
      if (country && norm(t.countries) !== country) continue
      const people = splitOwners(t.salesPerson || "")
      const owners = people.length ? people : ["UNASSIGNED"]
      const share  = t.currentYearTargetContainers / owners.length
      for (const p of owners) targetBySP[p] = (targetBySP[p] || 0) + share
    }

    const allSPs = new Set([...Object.keys(curBySP), ...Object.keys(prevBySP), ...Object.keys(targetBySP)])
    const rows: PISalesPersonRow[] = []

    for (const sp of allSPs) {
      if (!sp || sp === "UNDEFINED") continue
      const cur = curBySP[sp] || []

      const actual   = sumContainers(cur)
      const prevYear = sumContainers(prevBySP[sp] || [])
      const { target, due } = scopedTarget(Math.round(targetBySP[sp] || 0), { fyMonth, fyQuarter, fyWeek }, week)

      const nbd = cur.filter(isNew)
      const crr = cur.filter((r) => !isNew(r))
      const uniq = (rs: PIRecord[], f: (r: PIRecord) => string) => new Set(rs.map(f).filter(Boolean)).size

      const byCountry = new Map<string, PIRecord[]>()
      for (const r of cur) {
        const c = norm(r.countries) || "—"
        byCountry.set(c, [...(byCountry.get(c) || []), r])
      }
      const byBuyer = new Map<string, PIRecord[]>()
      for (const r of cur) {
        const k = buyerKey(r)
        byBuyer.set(k, [...(byBuyer.get(k) || []), r])
      }

      rows.push({
        salesPerson:        sp,
        previousYear:       round1(prevYear),
        target,
        targetDue:          due,
        actual:             round1(actual),
        gap:                parseFloat((actual - due).toFixed(2)),
        status:             getStatus(target, actual, due),
        achievementPercent: getAchievementPercent(actual, due),
        activeBuyers:       uniq(cur, buyerKey),
        pis:       uniq(cur, (r) => r.piNumber),
        mts:       round1(cur.reduce((s, r) => s + (r.qtyMTs || 0), 0)),
        nbdPIs:    uniq(nbd, (r) => r.piNumber),
        nbdCtrs:   round1(sumContainers(nbd)),
        nbdBuyers: uniq(nbd, buyerKey),
        crrPIs:    uniq(crr, (r) => r.piNumber),
        crrCtrs:   round1(sumContainers(crr)),
        crrBuyers: uniq(crr, buyerKey),
        countries: [...byCountry.entries()].map(([c, rs]) => ({
          country: c,
          pis:     uniq(rs, (r) => r.piNumber),
          ctrs:    round1(sumContainers(rs)),
          mts:     round1(rs.reduce((s, r) => s + (r.qtyMTs || 0), 0)),
          nbdCtrs: round1(sumContainers(rs.filter(isNew))),
          crrCtrs: round1(sumContainers(rs.filter((r) => !isNew(r)))),
          buyers:  uniq(rs, buyerKey),
        })).sort((a, b) => b.ctrs - a.ctrs),
        buyers: [...byBuyer.values()].map((rs) => ({
          buyer:   rs[0].buyerCompanyName,
          country: norm(rs[0].countries),
          pis:     uniq(rs, (r) => r.piNumber),
          ctrs:    round1(sumContainers(rs)),
          isNew:   isNew(rs[0]),
        })).sort((a, b) => b.ctrs - a.ctrs),
      })
    }

    rows.sort((a, b) => b.actual - a.actual || b.target - a.target)

    return NextResponse.json({
      rows,
      meta: { fy, prevFY, week, total: rows.length, generatedAt: new Date().toISOString() },
    })
  } catch (error) {
    console.error("PI Sales Person Performance API Error:", error)
    return NextResponse.json({ error: "Failed to fetch sales person performance" }, { status: 500 })
  }
}
