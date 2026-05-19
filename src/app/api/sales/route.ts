import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { getPIRecords, getCanonicalBuyers, getBuyerAliasMap } from "@/lib/data"
import { parsePIDate, isInFY, getCurrentFY, getPreviousFY } from "@/lib/fy-utils"
import type { AppUser, PIRecord, Variety, FinancialYear, BuyerSegment } from "@/types"

export const dynamic = "force-dynamic"

function normName(s: string) { return s.toLowerCase().trim() }

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as AppUser
  const url  = new URL(req.url)
  const p    = url.searchParams

  // ── Filters ───────────────────────────────────────────────────────────────
  const country      = p.get("country")     || undefined
  const salesPerson  = p.get("salesPerson") || undefined
  const variety      = p.get("variety")     as Variety | undefined
  const search       = p.get("search")      || undefined  // buyer name search
  const fyWeek       = p.get("fyWeek")      ? Number(p.get("fyWeek"))   : undefined
  const fyMonth      = p.get("fyMonth")     ? Number(p.get("fyMonth"))  : undefined
  const fyQuarter    = p.get("fyQuarter")   ? Number(p.get("fyQuarter")): undefined
  const fy           = (p.get("fy") || getCurrentFY()) as FinancialYear
  const dateFrom     = p.get("dateFrom")    || undefined
  const dateTo       = p.get("dateTo")      || undefined

  // ── Pagination & Sort ─────────────────────────────────────────────────────
  const page    = Math.max(1, Number(p.get("page")  || 1))
  const limit   = Math.min(200, Math.max(10, Number(p.get("limit") || 50)))
  const sortDir = p.get("sortDir") === "asc" ? "asc" : "desc"

  // ── Role enforcement ──────────────────────────────────────────────────────
  const effectiveSalesPerson =
    user.role === "SALES_PERSON" && user.salesPersonName
      ? user.salesPersonName
      : salesPerson

  // ── Fetch + filter ────────────────────────────────────────────────────────
  const [allPI, canonicalBuyers, aliasMap] = await Promise.all([
    getPIRecords(),
    getCanonicalBuyers(),
    getBuyerAliasMap(),
  ])

  const canonicalByCode = new Map(canonicalBuyers.map(c => [c.canonicalBuyerCode, c]))
  const cutOffDate = "2026-04-01"

  const filtered = allPI.filter((r) => {
    // FY filter
    const date = parsePIDate(r.piDate)
    if (!isInFY(date, fy)) return false

    if (country           && r.countries.toUpperCase()    !== country.toUpperCase())              return false
    if (effectiveSalesPerson && r.salesPerson.toUpperCase() !== effectiveSalesPerson.toUpperCase()) return false
    if (variety           && r.varieties                  !== variety)                             return false
    if (fyWeek            && r.fyWeekNo                   !== fyWeek)                              return false
    if (fyMonth           && r.fyMonthNo                  !== fyMonth)                             return false
    if (fyQuarter         && r.fyQuarter                  !== fyQuarter)                           return false

    if (search) {
      const q = search.toLowerCase()
      if (
        !r.buyerCompanyName.toLowerCase().includes(q) &&
        !r.countries.toLowerCase().includes(q) &&
        !r.piNumber.toLowerCase().includes(q)
      ) return false
    }

    if (dateFrom && date < new Date(dateFrom)) return false
    if (dateTo   && date > new Date(dateTo))   return false

    return true
  })

  // ── Sort by PI date (desc default) — NaN dates pushed to bottom ──────────
  filtered.sort((a, b) => {
    const da = parsePIDate(a.piDate).getTime()
    const db = parsePIDate(b.piDate).getTime()
    const aOk = !isNaN(da), bOk = !isNaN(db)
    if (!aOk && !bOk) return 0
    if (!aOk) return 1    // invalid date → bottom
    if (!bOk) return -1   // invalid date → bottom
    if (da === db) {
      // secondary: piNumber desc
      return sortDir === "desc"
        ? Number(b.piNumber) - Number(a.piNumber)
        : Number(a.piNumber) - Number(b.piNumber)
    }
    return sortDir === "desc" ? db - da : da - db
  })

  // ── Aggregate summary ─────────────────────────────────────────────────────
  const totalContainers = filtered.reduce((s, r) => s + r.totalContainers, 0)
  const totalMTs        = filtered.reduce((s, r) => s + r.qtyMTs, 0)
  const uniqueBuyers    = new Set(filtered.map((r) => r.buyerCode || r.buyerCompanyName)).size
  const uniqueCountries = new Set(filtered.map((r) => r.countries.toUpperCase())).size

  // ── Paginate & Enrich ─────────────────────────────────────────────────────
  const total      = filtered.length
  const totalPages = Math.ceil(total / limit)
  const offset     = (page - 1) * limit
  const paged      = filtered.slice(offset, offset + limit)

  const records = paged.map((r) => {
    let code = aliasMap.get(normName(r.buyerCompanyName))
    if (!code && r.buyerCode) {
      const cb = canonicalBuyers.find(c => c.buyerCode === r.buyerCode)
      if (cb) code = cb.canonicalBuyerCode
    }
    const canon = code ? canonicalByCode.get(code) : null
    
    return {
      ...r,
      segment:       (canon?.segment ?? "EXISTING") as BuyerSegment,
      isKeyAccount:   canon?.isKeyAccount ?? false,
      canonicalCode:  code || r.buyerCode || "raw_" + normName(r.buyerCompanyName),
      isNewBuyer:     r.piDate >= cutOffDate, // simple definition for now
    }
  })

  // ── Filter options ───────────────────────────────────────────────────────
  const allForFY = allPI.filter((r) => isInFY(parsePIDate(r.piDate), fy))
  const filterOptions = {
    countries:    [...new Set(allForFY.map((r) => r.countries.toUpperCase()))].sort(),
    salesPersons: user.role === "SALES_PERSON"
      ? [user.salesPersonName ?? ""]
      : [...new Set(allForFY.map((r) => r.salesPerson.toUpperCase()))].sort(),
    varieties:    [...new Set(allForFY.map((r) => r.varieties))].sort(),
    fyYears:      [getCurrentFY(), getPreviousFY(getCurrentFY())],
  }

  return NextResponse.json({
    records,
    pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    summary:    { totalContainers: parseFloat(totalContainers.toFixed(1)), totalMTs: parseFloat(totalMTs.toFixed(1)), uniqueBuyers, uniqueCountries },
    filterOptions,
    meta: { fy, generatedAt: new Date().toISOString() },
  })
}
