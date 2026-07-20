/**
 * Data access layer — all Google Sheets reads go through here.
 * Each function returns typed data ready for API routes or server components.
 */

import { createHmac } from "crypto"
import {
  readSheet,
  appendToSheet,
  updateSheetRow,
  overwriteSheetRows,
  findRowIndexByKey,
  deleteSheetRow,
  buildHeaderMap,
  getCell,
  getCellNum,
  invalidateSheetCache,
  ensureSheetExists,
  findExistingTab,
  SHEETS,
  SHEET_NAMES,
} from "./sheets"
import {
  getInitialDueDate,
  getMeetingDisplayStatus,
  daysUntil,
  buildInitialSchedule,
} from "./8020-utils"
import { parsePIDate, getCurrentFY, getPreviousFY, isInFY, getCurrentFYWeek, targetDueTillWeek, getStatus } from "./fy-utils"
import type {
  PIRecord,
  TargetRecord,
  BuyerRecord,
  CountryTarget,
  BusinessPlanBuyer,
  CanonicalBuyer,
  BuyerAlias,
  BuyerSegment,
  BrandCategory,
  BrandMapping,
  WeeklyReview,
  OwnershipRecord,
  LeadActivity,
  ActivityType,
  ActivityOutcome,
  BuyerTask,
  TaskStatus,
  TaskType,
  AssignedRole,
  CountryStrategy,
  TravelPlan,
  TravelStatus,
  Variety,
  FinancialYear,
  Buyer8020,
  Tier8020All,
  MeetingSchedule,
  MeetingHistoryEntry,
  PerformanceStatus,
  OthersBuyerSummary,
} from "@/types"

// ─── Meeting target rules per segment ────────────────────────────────────────
export const MEETING_TARGET_BY_SEGMENT: Record<BuyerSegment, number> = {
  VIP:       2,
  STRATEGIC: 1,
  STRONG_HOLD:    1,
  KEY_ACCOUNT:    1,
  GROWTH:         0,
  EXISTING:       0,
  RISK:           0,
  NEW_OPP:        0,
}

// ─── Memoization Layer (Performance Optimization) ──────────────────────────
//
// Two-tier TTL: most reference data (PI / Buyer Master / Targets) is read-mostly
// and can live for 5 minutes. The 80/20 meeting state mutates on every "Done"
// click, so it gets a short TTL with an explicit invalidate-on-write path.
//
// CRITICAL: empty/zero-length results are NOT cached at the full TTL. They get
// a 10-second "negative cache" so we re-try shortly after. Otherwise a transient
// Google Sheets API blip on cold-start would lock the entire app into "0 data"
// for 5 minutes.
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>()
const DEFAULT_TTL  = 30 * 60 * 1000 // 30 minutes (reference data — sheets rarely change mid-day)
const LONG_TTL     = 60 * 60 * 1000 // 1 hour     (very static: buyer master, canonical, alias map)
const SHORT_TTL    = 30 * 1000      // 30 seconds  (mutable 80/20 meeting state)
const NEGATIVE_TTL = 10 * 1000      // 10 seconds  (empty / suspicious results)

// In-flight promises de-dup concurrent identical requests so we never hammer
// Sheets twice for the same key when two requests land in the same tick.
const inflight = new Map<string, Promise<unknown>>()

function isEmptyResult(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (value instanceof Map || value instanceof Set) return value.size === 0
  return false
}

async function withMemo<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = DEFAULT_TTL,
): Promise<T> {
  const now = Date.now()
  const entry = cache.get(key)
  if (entry && now - entry.timestamp < entry.ttl) return entry.data

  // De-dup concurrent calls for the same key
  const existingInflight = inflight.get(key)
  if (existingInflight) return existingInflight as Promise<T>

  const promise = (async () => {
    try {
      const data = await fn()
      // Don't cache empty/zero results at full TTL — they're almost always
      // transient errors. Negative-cache them briefly so retries are fast.
      const effectiveTtl = isEmptyResult(data) ? NEGATIVE_TTL : ttl
      cache.set(key, { data, timestamp: now, ttl: effectiveTtl })
      return data
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, promise)
  return promise
}

/** Drop one or more memo keys (call after a write so the next read is fresh). */
export function invalidateMemo(...keys: string[]): void {
  for (const k of keys) cache.delete(k)
}

/** Drop ALL memo keys — used by the diagnostic refresh button. */
export function invalidateAllMemo(): void {
  cache.clear()
}

// ─── PI Backend Master ────────────────────────────────────────────────────────

export async function getPIRecords(): Promise<PIRecord[]> {
  return withMemo("pi_records", async () => {
    const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.PI_BACKEND_MASTER)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)

    // ── Merge buyer-name variants into one canonical name ──────────────────────
    // A buyer may raise PIs under different name spellings. If a name is mapped in
    // the alias map (BUYER_ALIAS_MAP → canonical code), rewrite it to that
    // canonical buyer's name so EVERY view (Live Data, Target vs Actual, workspace,
    // MIS, daily report) treats the variants as a single buyer.
    const [aliasMap, canon] = await Promise.all([getBuyerAliasMap(), getCanonicalBuyers()])
    const codeIsName = (s: string) => !/^[A-Z]{2,6}\d{2,6}$/i.test(s.trim())
    const codeToName = new Map<string, string>()
    for (const c of canon) {
      if (c.canonicalBuyerName && codeIsName(c.canonicalBuyerName)) {
        codeToName.set(c.canonicalBuyerCode, c.canonicalBuyerName)
      }
    }
    const canonicalizeName = (name: string): string => {
      const code = aliasMap.get(name.toLowerCase().trim())
      return (code && codeToName.get(code)) || name
    }

    return dataRows
      .filter((r) => r[h["PI Number"]] && r[h["PI Date"]])
      .map((r) => ({
        piNumber:          getCell(r, h, "PI Number"),
        piDate:            getCell(r, h, "PI Date"),
        crmEmail:          getCell(r, h, "CRM Email"),
        buyerCompanyName:  canonicalizeName(getCell(r, h, "Buyer Company Name")),
        buyerCode:         getCell(r, h, "Buyer Code"),
        countries:         getCell(r, h, "Countries"),
        portOfDischarge:   getCell(r, h, "Port of Discharge"),
        loadingPort:       getCell(r, h, "Loading Port"),
        salesPerson:       getCell(r, h, "Sales Person"),
        salesCoordinator:  getCell(r, h, "Sales Cordinator"),
        buyerEmail:        getCell(r, h, "Buyer Email"),
        brand:             getCell(r, h, "Brand"),
        varieties:         getCell(r, h, "Varieties") as Variety,
        description:       getCell(r, h, "Description"),
        packagingType:     getCell(r, h, "Packaging Type"),
        packSize:          getCell(r, h, "Pack Size"),
        totalContainers:   getCellNum(r, h, "Total Containers"),
        totalQty:          getCellNum(r, h, "Total Qty"),
        qtyMTs:            getCellNum(r, h, "Qty MTs"),
        rate:              getCellNum(r, h, "Rate"),
        totalAmount:       getCellNum(r, h, "Total Amount"),
        currency:          getCell(r, h, "Currency"),
        approvalStatus:    getCell(r, h, "Approval Status"),
        financialYear:     getCell(r, h, "Financial Year") as FinancialYear,
        fyWeekNo:          getCellNum(r, h, "FY Week No"),
        fyMonthNo:         getCellNum(r, h, "FY Month No"),
        fyMonthName:       getCell(r, h, "FY Month Name"),
        fyQuarter:         getCellNum(r, h, "FY Quarter") as 1 | 2 | 3 | 4,
      }))
  })
}

// ─── Target Master ────────────────────────────────────────────────────────────

export async function getTargetRecords(fy?: FinancialYear): Promise<TargetRecord[]> {
  try {
    const records = await withMemo("target_records", async () => {
      // ── Primary source: "80/20 Buyers" sheet (per user directive 2026-05-12) ──
      // The 80/20 sheet now drives targets for the whole app. TARGET_MASTER
      // is used as a fallback for any buyers not yet in the 80/20 sheet.
      const buyers8020 = await get8020Buyers()
      const primary: TargetRecord[] = buyers8020
        .filter((b) => b.annualTarget > 0)
        .map((b): TargetRecord => ({
          buyerCompanyName:            b.buyerName,
          countries:                   b.country,
          salesPerson:                 b.responsiblePerson,
          financialYear:               getCurrentFY() as FinancialYear,
          previousYearContainers:      0,   // not tracked in 80/20 sheet
          currentYearTargetContainers: b.annualTarget,
          targetType:                  "Manual",
          remarks:                     `Tier: ${b.tier}`,
        }))

      // Build a lookup set for primary buyers (name+country, normalized)
      const primaryKeys = new Set(
        primary.map((p) => `${p.buyerCompanyName.toLowerCase().trim()}||${p.countries.toLowerCase().trim()}`)
      )

      // ── Fallback: TARGET_MASTER sheet for buyers not in 80/20 ────────────
      let fallback: TargetRecord[] = []
      try {
        const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.TARGET_MASTER)
        if (rows.length) {
          const [headerRow, ...dataRows] = rows
          const h = buildHeaderMap(headerRow)
          fallback = dataRows
            .filter((r) => getCell(r, h, "Buyer Company Name"))
            .map((r): TargetRecord => ({
              buyerCompanyName:           getCell(r, h, "Buyer Company Name"),
              countries:                  getCell(r, h, "Countries"),
              salesPerson:                getCell(r, h, "Sales Person"),
              financialYear:              getCell(r, h, "Financial Year") as FinancialYear,
              previousYearContainers:     getCellNum(r, h, "Previous Year Containers"),
              currentYearTargetContainers:getCellNum(r, h, "Current Year Target Containers"),
              targetType:                 getCell(r, h, "Target Type") as "Manual" | "Auto",
              remarks:                    getCell(r, h, "Remarks"),
            }))
            .filter((r) => !primaryKeys.has(
              `${r.buyerCompanyName.toLowerCase().trim()}||${r.countries.toLowerCase().trim()}`
            ))
        }
      } catch (e) {
        console.error("TARGET_MASTER fallback fetch error:", e)
      }

      return [...primary, ...fallback]
    })
    return fy ? records.filter((r: TargetRecord) => r.financialYear === fy) : records
  } catch (e) {
    console.error("Target Master fetch error:", e)
    return []
  }
}

// ─── Buyer Master ─────────────────────────────────────────────────────────────

export async function getBuyerMaster(): Promise<BuyerRecord[]> {
  return withMemo("buyer_master", async () => {
    try {
      const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.BUYER_MASTER)
      if (!rows.length) return []
      const [headerRow, ...dataRows] = rows
      const h = buildHeaderMap(headerRow)

      return dataRows
        .filter((r) => getCell(r, h, "Buyer Company Name") || getCell(r, h, "Buyer Code"))
        .map((r) => ({
          buyerCode:         getCell(r, h, "Buyer Code"),
          buyerCompanyName:  getCell(r, h, "Buyer Company Name"),
          countries:         getCell(r, h, "Countries"),
          salesPerson:       getCell(r, h, "Sales Person"),
          salesCoordinator:  getCell(r, h, "Sales Cordinator"),
          tier:              getCell(r, h, "Tier") as "TIER1" | "TIER2" | "TIER3" | undefined,
          contactPerson:     getCell(r, h, "Contact Person"),
          email:             getCell(r, h, "Email"),
          phone:             getCell(r, h, "Phone"),
          paymentTerms:      getCell(r, h, "Payment Terms"),
        }))
    } catch (e) {
      console.error("Buyer Master fetch error:", e)
      return []
    }
  }, LONG_TTL)
}

// ─── Canonical Buyer Master ──────────────────────────────────────────────────

export async function getCanonicalBuyers(): Promise<CanonicalBuyer[]> {
  if (!SHEETS.CANONICAL_MAP) return []
  return withMemo("canonical_buyers", async () => {
    try {
      const rows = await readSheet(SHEETS.CANONICAL_MAP, SHEET_NAMES.CANONICAL_BUYER_MASTER)
      if (!rows.length) return []
      const [headerRow, ...dataRows] = rows
      const h = buildHeaderMap(headerRow)

      return dataRows
        .filter((r) => getCell(r, h, "canonicalBuyerCode"))
        .map((r) => ({
          canonicalBuyerCode: getCell(r, h, "canonicalBuyerCode"),
          canonicalBuyerName: getCell(r, h, "Buyer Name") || getCell(r, h, "canonicalBuyerName"),
          buyerCode:          getCell(r, h, "buyerCode") || getCell(r, h, "canonicalBuyerCode"),
          country:            getCell(r, h, "Country") || getCell(r, h, "country"),
          segment:           (getCell(r, h, "Segment") || getCell(r, h, "segment") || "EXISTING") as BuyerSegment,
          strategicRank:      getCellNum(r, h, "strategicRank") || 999,
          isKeyAccount:       (getCell(r, h, "isKeyAccount") || "").toUpperCase() === "TRUE",
          primaryOwner:       getCell(r, h, "Sales Person") || getCell(r, h, "primaryOwner"),
          backupOwner:        getCell(r, h, "backupOwner"),
          targetFY2026:       getCellNum(r, h, "Target Containers") || getCellNum(r, h, "targetFY2026"),
          notes:              getCell(r, h, "Notes") || getCell(r, h, "notes"),
          salesCoordinator:   getCell(r, h, "Sales Coordinator"),
        }))
    } catch (e) {
      console.warn("Canonical Buyer Master fetch warning:", e)
      return []
    }
  }, LONG_TTL)
}

// ─── Buyer Alias Map ─────────────────────────────────────────────────────────

export async function getBuyerAliasMap(): Promise<Map<string, string>> {
  if (!SHEETS.CANONICAL_MAP) return new Map()
  return withMemo("buyer_alias_map", async () => {
    try {
      const result = new Map<string, string>()
      const rows = await readSheet(SHEETS.CANONICAL_MAP, SHEET_NAMES.BUYER_ALIAS_MAP)
      if (!rows.length) return result
      const [headerRow, ...dataRows] = rows
      const h = buildHeaderMap(headerRow)
      for (const r of dataRows) {
        const alias = getCell(r, h, "aliasName") || getCell(r, h, "Alias")
        const code  = getCell(r, h, "canonicalBuyerCode") || getCell(r, h, "Canonical Buyer Code")
        const conf  = getCell(r, h, "matchConfidence") || "HIGH"
        if (alias && code && (conf === "HIGH" || conf === "MEDIUM" || conf === "TRUE")) {
          result.set(alias.toLowerCase().trim(), code)
        }
      }
      return result
    } catch (e) {
      console.warn("Buyer Alias Map fetch warning:", e)
      return new Map()
    }
  }, LONG_TTL)
}

// ─── Country Strategies ───────────────────────────────────────────────────────

export async function getCountryStrategies(): Promise<CountryStrategy[]> {
  if (!SHEETS.BUSINESS_PLAN) return []
  return withMemo("country_strategies", async () => {
    try {
      const rows = await readSheet(SHEETS.BUSINESS_PLAN, SHEET_NAMES.COUNTRY_STRATEGIES)
      if (!rows.length) return []
      const [headerRow, ...dataRows] = rows
      const h = buildHeaderMap(headerRow)

      return dataRows
        .filter((r) => getCell(r, h, "Country"))
        .map((r) => ({
          country:       getCell(r, h, "Country"),
          isDreamMarket: (getCell(r, h, "isDreamMarket") || getCell(r, h, "Is Dream Market")).toUpperCase() === "TRUE",
          focusSegment:  getCell(r, h, "focusSegment"),
          targetVariety: getCell(r, h, "targetVariety"),
          strategyNotes: getCell(r, h, "strategyNotes") || getCell(r, h, "Strategy"),
          updatedAt:     getCell(r, h, "updatedAt"),
        }))
    } catch (e) {
      console.warn("Country Strategies fetch warning:", e)
      return []
    }
  })
}

// ─── Country Targets ──────────────────────────────────────────────────────────

export async function getCountryTargets(): Promise<CountryTarget[]> {
  try {
    const rows = await readSheet(SHEETS.BUSINESS_PLAN, SHEET_NAMES.COUNTRY_TARGET)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)

    return dataRows
      .filter((r) => getCell(r, h, "County") || getCell(r, h, "Country"))
      .map((r) => ({
        country:              getCell(r, h, "County") || getCell(r, h, "Country"),
        planned2024:          getCellNum(r, h, "2024 PLANNED"),
        actual2024:           getCellNum(r, h, "2024 ACTUAL"),
        planned2025:          getCellNum(r, h, "2025 PLANNED"),
        actual2025:           getCellNum(r, h, "2025 ACTUAL"),
        planned2026:          getCellNum(r, h, "2026 PLANNED"),
        performanceStatus2025:getCell(r, h, "PERFORMANCE STATUS-2025"),
        marketGrowth:         getCellNum(r, h, "MARKET GROWTH(2024 VS 2025)"),
        totalClients2025:     getCellNum(r, h, "NO. OF TOTAL CLIENTS(2025)"),
      }))
  } catch (e) {
    console.error("Country Targets fetch error:", e)
    return []
  }
}

// ─── Business Plan Backend ────────────────────────────────────────────────────

export async function getBusinessPlanBuyers(): Promise<BusinessPlanBuyer[]> {
  try {
    const rows = await readSheet(SHEETS.BUSINESS_PLAN, SHEET_NAMES.BUSINESS_PLAN_BACKEND)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)

    return dataRows
      .filter((r) => getCell(r, h, "Buyer Name"))
      .map((r, i) => ({
        sNo:                 getCellNum(r, h, "S NO.") || i + 1,
        country:             getCell(r, h, "COUNTRY"),
        buyerName:           getCell(r, h, "Buyer Name"),
        containers2025:      getCellNum(r, h, "No. Of Containers( 2025)"),
        growthPercent:       parseFloat(getCell(r, h, "GROWTH %")) || 0,
        containers2024:      getCellNum(r, h, "No. Of Containers (2024)"),
        monthlyAvgVolume2025:getCellNum(r, h, "MONTHLY AVG VOLUMN(2 025)"),
        targetContainer2026: getCellNum(r, h, "TARGET CONTAINER (2026)"),
        remarks:             getCell(r, h, "remarks"),
      }))
  } catch (e) {
    console.error("Business Plan Backend fetch error:", e)
    return []
  }
}

// ─── Weekly Reviews ───────────────────────────────────────────────────────────

export async function getWeeklyReviews(fy?: FinancialYear, salesPerson?: string): Promise<WeeklyReview[]> {
  try {
    const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.WEEKLY_REVIEW)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)

    return dataRows
      .filter((r) => {
        if (!getCell(r, h, "FY Week")) return false
        if (fy && getCell(r, h, "Financial Year") !== fy) return false
        if (salesPerson && getCell(r, h, "Sales Person").toLowerCase() !== salesPerson.toLowerCase()) return false
        return true
      })
      .map((r, i) => ({
        id:                getCell(r, h, "ID") || String(i + 1),
        fyWeek:            getCellNum(r, h, "FY Week"),
        financialYear:     getCell(r, h, "Financial Year") as FinancialYear,
        reviewDate:        getCell(r, h, "Review Date"),
        salesPerson:       getCell(r, h, "Sales Person"),
        targetContainers:  getCellNum(r, h, "Target Containers"),
        actualContainers:  getCellNum(r, h, "Actual Containers"),
        openPIs:           getCellNum(r, h, "Open PIs"),
        blockers:          getCell(r, h, "Blockers"),
        wins:              getCell(r, h, "Wins"),
        nextWeekFocus:     getCell(r, h, "Next Week Focus"),
        recordedBy:        getCell(r, h, "Recorded By"),
        recordedAt:        getCell(r, h, "Recorded At"),
      }))
      .reverse()  // most recent first
  } catch { return [] }
}

export async function addWeeklyReview(review: Omit<WeeklyReview, "id">): Promise<void> {
  const id = `WR-${Date.now()}`
  await appendToSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.WEEKLY_REVIEW, [[
    id,
    review.fyWeek,
    review.financialYear,
    review.reviewDate,
    review.salesPerson,
    review.targetContainers,
    review.actualContainers,
    review.openPIs,
    review.blockers ?? "",
    review.wins ?? "",
    review.nextWeekFocus ?? "",
    review.recordedBy,
    review.recordedAt,
  ]])
}

/**
 * Returns the list of (salesPerson, fyWeek) pairs that have NOT logged a
 * weekly review for any week from `startWeek` up to `currentWeek`.
 */
export async function getPendingReviews(params: {
  currentFY:    import("@/types").FinancialYear
  currentWeek:  number
  salesPersons: string[]   // restrict to these
  lookbackWeeks?: number   // default 4 — only flag recent missing reviews
}): Promise<import("@/types").PendingReview[]> {
  const reviews = await getWeeklyReviews(params.currentFY)
  const submitted = new Set<string>()  // key = `${sp}|${week}`
  for (const r of reviews) submitted.add(`${r.salesPerson.toLowerCase()}|${r.fyWeek}`)

  const lookback   = params.lookbackWeeks ?? 4
  const startWeek  = Math.max(1, params.currentWeek - lookback + 1)
  const endWeek    = Math.max(1, params.currentWeek - 1)  // current week not yet over
  const pending: import("@/types").PendingReview[] = []

  for (const sp of params.salesPersons) {
    for (let w = startWeek; w <= endWeek; w++) {
      if (!submitted.has(`${sp.toLowerCase()}|${w}`)) {
        pending.push({
          salesPerson:  sp,
          fyWeek:       w,
          fyMonthName:  monthNameForFYWeek(w),
          weeksOverdue: params.currentWeek - w,
        })
      }
    }
  }
  return pending
}

function monthNameForFYWeek(week: number): string {
  // FY week 1 starts April. Each month ≈ 4.33 weeks.
  const months = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"]
  const monthIdx = Math.min(11, Math.floor((week - 1) / 4.33))
  return months[monthIdx]
}

// ─── Ownership Records ────────────────────────────────────────────────────────

export async function getOwnershipRecords(canonicalBuyerCode?: string): Promise<OwnershipRecord[]> {
  try {
    const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.OWNERSHIP_RECORDS)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)

    return dataRows
      .filter((r) => {
        if (!getCell(r, h, "ID")) return false
        if (canonicalBuyerCode && getCell(r, h, "Canonical Buyer Code") !== canonicalBuyerCode) return false
        return true
      })
      .map((r) => ({
        id:                 getCell(r, h, "ID"),
        canonicalBuyerCode: getCell(r, h, "Canonical Buyer Code"),
        buyerName:          getCell(r, h, "Buyer Name"),
        fromOwner:          getCell(r, h, "From Owner"),
        toOwner:            getCell(r, h, "To Owner"),
        effectiveDate:      getCell(r, h, "Effective Date"),
        transferredBy:      getCell(r, h, "Transferred By"),
        reason:             getCell(r, h, "Reason"),
        historicalActual:   getCellNum(r, h, "Historical Actual"),
        inheritedTarget:    getCellNum(r, h, "Inherited Target"),
      }))
  } catch { return [] }
}

export async function addOwnershipRecord(record: Omit<OwnershipRecord, "id">): Promise<string> {
  const id = `OWN-${Date.now()}`
  await appendToSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.OWNERSHIP_RECORDS, [[
    id,
    record.canonicalBuyerCode,
    record.buyerName,
    record.fromOwner,
    record.toOwner,
    record.effectiveDate,
    record.transferredBy,
    record.reason,
    record.historicalActual,
    record.inheritedTarget,
  ]])
  return id
}

// ─── Lead Activities ──────────────────────────────────────────────────────────

export async function getLeadActivities(params: {
  buyerCode?: string
  salesPerson?: string
  fy?: FinancialYear
  limit?: number
}): Promise<LeadActivity[]> {
  try {
    const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.LEAD_ACTIVITIES)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)

    const filtered = dataRows
      .filter((r) => {
        if (!getCell(r, h, "ID")) return false
        if (params.buyerCode && getCell(r, h, "Buyer Code") !== params.buyerCode) return false
        if (params.salesPerson && getCell(r, h, "Sales Person").toLowerCase() !== params.salesPerson.toLowerCase()) return false
        return true
      })
      .map((r) => ({
        id:           getCell(r, h, "ID"),
        date:         getCell(r, h, "Date"),
        buyerCode:    getCell(r, h, "Buyer Code"),
        buyerName:    getCell(r, h, "Buyer Name"),
        country:      getCell(r, h, "Country"),
        activityType: getCell(r, h, "Activity Type") as ActivityType,
        notes:        getCell(r, h, "Notes"),
        salesPerson:  getCell(r, h, "Sales Person"),
        fyWeek:       getCellNum(r, h, "FY Week"),
        outcome:      (getCell(r, h, "Outcome") || "NEUTRAL") as ActivityOutcome,
      }))
      .reverse()  // most recent first

    return params.limit ? filtered.slice(0, params.limit) : filtered
  } catch { return [] }
}

export async function addLeadActivity(activity: Omit<LeadActivity, "id">): Promise<string> {
  const id = `ACT-${Date.now()}`
  await appendToSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.LEAD_ACTIVITIES, [[
    id,
    activity.date,
    activity.buyerCode,
    activity.buyerName,
    activity.country,
    activity.activityType,
    activity.notes,
    activity.salesPerson,
    activity.fyWeek,
    activity.outcome,
  ]])
  return id
}

// ─── Alerts (REMINDER_LOG) ────────────────────────────────────────────────────

export async function getAlerts(params: {
  salesPerson?: string
  status?: string
  buyerCode?: string
  buyerName?: string
  triggerType?: string
  limit?: number
}): Promise<import("@/types").Alert[]> {
  try {
    const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.REMINDER_LOG)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)

    const filtered = dataRows
      .filter((r) => {
        if (!getCell(r, h, "ID")) return false
        if (params.status && getCell(r, h, "Status") !== params.status) return false
        if (params.triggerType && getCell(r, h, "Trigger Type") !== params.triggerType) return false
        if (params.buyerCode) {
          const bc = getCell(r, h, "Buyer Code")
          if (bc !== params.buyerCode) return false
        }
        if (params.buyerName) {
          const bn = getCell(r, h, "Buyer Name").toLowerCase()
          if (!bn.includes(params.buyerName.toLowerCase())) return false
        }
        if (params.salesPerson) {
          const sp = getCell(r, h, "Sales Person")
          if (sp && sp.toLowerCase() !== params.salesPerson.toLowerCase()) return false
        }
        return true
      })
      .map((r) => {
        const dueDate = getCell(r, h, "Due Date")
        const status  = (getCell(r, h, "Status") || "OPEN") as import("@/types").Alert["status"]
        // Compute dynamic OVERDUE: if due date passed and still OPEN, treat as OVERDUE
        const today = new Date().toISOString().split("T")[0]
        const isOverdue = dueDate && dueDate < today && status === "OPEN"
        return {
          id:            getCell(r, h, "ID"),
          triggerType:   (getCell(r, h, "Trigger Type") || "BUYER_BEHIND_PACE") as import("@/types").TriggerType,
          severity:      (getCell(r, h, "Severity") || "MEDIUM") as import("@/types").AlertSeverity,
          title:         getCell(r, h, "Title"),
          message:       getCell(r, h, "Message"),
          buyerCode:     getCell(r, h, "Buyer Code"),
          buyerName:     getCell(r, h, "Buyer Name"),
          country:       getCell(r, h, "Country"),
          salesPerson:   getCell(r, h, "Sales Person"),
          createdAt:     getCell(r, h, "Created At"),
          fyWeek:        getCellNum(r, h, "FY Week"),
          status:        isOverdue ? "OVERDUE" : status,
          actionUrl:     getCell(r, h, "Action URL"),
          dueDate:       dueDate || undefined,
          followUpOwner: getCell(r, h, "Follow Up Owner") || undefined,
        }
      })
      .reverse()

    return params.limit ? filtered.slice(0, params.limit) : filtered
  } catch { return [] }
}

export async function appendAlert(alert: Omit<import("@/types").Alert, "id">): Promise<string> {
  const id = `ALT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  await appendToSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.REMINDER_LOG, [[
    id,
    alert.triggerType,
    alert.severity,
    alert.title,
    alert.message,
    alert.buyerCode ?? "",
    alert.buyerName ?? "",
    alert.country ?? "",
    alert.salesPerson ?? "",
    alert.createdAt,
    alert.fyWeek,
    alert.status,
    alert.actionUrl ?? "",
    alert.dueDate ?? "",
    alert.followUpOwner ?? "",
  ]])
  return id
}

/**
 * Updates an alert's status by ID. Used for marking action plans DONE.
 * Returns true if updated, false if not found.
 */
export async function updateAlertStatus(
  id: string,
  newStatus: import("@/types").Alert["status"]
): Promise<boolean> {
  const rowIdx = await findRowIndexByKey(
    SHEETS.SALES_TRACKING, SHEET_NAMES.REMINDER_LOG, "ID", id
  )
  if (rowIdx === -1) return false

  // Read the existing row to preserve all other columns
  const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.REMINDER_LOG)
  if (rows.length < rowIdx) return false
  const [headerRow] = rows
  const h = buildHeaderMap(headerRow)
  const existing = rows[rowIdx - 1]   // 1-based to 0-based

  // Update only the Status column
  const statusIdx = h["Status"]
  if (statusIdx === undefined) return false
  const updated = [...existing]
  updated[statusIdx] = newStatus

  await updateSheetRow(SHEETS.SALES_TRACKING, SHEET_NAMES.REMINDER_LOG, rowIdx, updated)
  return true
}

// ─── Target Master — Update + Audit ──────────────────────────────────────────

/**
 * Updates an existing buyer's target containers in TARGET_MASTER and writes
 * an audit row to TARGET_AUDIT. Returns the previous target.
 */
export async function updateBuyerTarget(params: {
  buyerName:     string
  financialYear: import("@/types").FinancialYear
  newTarget:     number
  changedBy:     string
  reason:        string
}): Promise<{ ok: boolean; oldTarget: number; reason?: string }> {
  const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.TARGET_MASTER)
  if (!rows.length) return { ok: false, oldTarget: 0, reason: "empty_sheet" }

  const [headerRow, ...dataRows] = rows
  const h = buildHeaderMap(headerRow)

  const buyerIdx  = h["Buyer Company Name"]
  const fyIdx     = h["Financial Year"]
  const targetIdx = h["Current Year Target Containers"]
  if (buyerIdx === undefined || fyIdx === undefined || targetIdx === undefined) {
    return { ok: false, oldTarget: 0, reason: "missing_columns" }
  }

  const matchIdx = dataRows.findIndex(
    (r) =>
      (r[buyerIdx] ?? "").trim().toLowerCase() === params.buyerName.trim().toLowerCase() &&
      (r[fyIdx]    ?? "").trim() === params.financialYear
  )
  if (matchIdx === -1) return { ok: false, oldTarget: 0, reason: "row_not_found" }

  const rowIndex = matchIdx + 2  // 1 for header, 1-based
  const oldTarget = parseFloat(dataRows[matchIdx][targetIdx] ?? "0") || 0

  // Update target cell only — preserve all other values
  const updated = [...dataRows[matchIdx]]
  updated[targetIdx] = String(params.newTarget)
  await updateSheetRow(SHEETS.SALES_TRACKING, SHEET_NAMES.TARGET_MASTER, rowIndex, updated)

  // Append audit row
  await appendToSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.TARGET_AUDIT, [[
    `TGA-${Date.now()}`,
    params.buyerName,
    "",   // buyerCode — not always available here
    params.financialYear,
    oldTarget,
    params.newTarget,
    params.changedBy,
    new Date().toISOString(),
    params.reason,
  ]])

  invalidateMemo("target_records")
  return { ok: true, oldTarget }
}

/**
 * Update a country's business-plan target (COUNTRY_TARGET sheet, "2026 PLANNED").
 * This is the country-level plan number used as the country target where no
 * buyer-level targets exist. Matches the row by the County/Country column.
 */
export async function updateCountryTarget(params: {
  country:   string
  planned2026: number
}): Promise<{ ok: boolean; oldTarget: number; reason?: string }> {
  const rows = await readSheet(SHEETS.BUSINESS_PLAN, SHEET_NAMES.COUNTRY_TARGET)
  if (!rows.length) return { ok: false, oldTarget: 0, reason: "empty_sheet" }

  const [headerRow, ...dataRows] = rows
  const h = buildHeaderMap(headerRow)

  const countryIdx = h["County"] ?? h["Country"]
  const targetIdx  = h["2026 PLANNED"]
  if (countryIdx === undefined || targetIdx === undefined) {
    return { ok: false, oldTarget: 0, reason: "missing_columns" }
  }

  const wanted = params.country.trim().toLowerCase()
  const matchIdx = dataRows.findIndex(
    (r) => (r[countryIdx] ?? "").trim().toLowerCase() === wanted
  )
  if (matchIdx === -1) return { ok: false, oldTarget: 0, reason: "row_not_found" }

  const rowIndex  = matchIdx + 2  // header + 1-based
  const oldTarget = parseFloat(dataRows[matchIdx][targetIdx] ?? "0") || 0

  const updated = [...dataRows[matchIdx]]
  updated[targetIdx] = String(params.planned2026)
  await updateSheetRow(SHEETS.BUSINESS_PLAN, SHEET_NAMES.COUNTRY_TARGET, rowIndex, updated)
  invalidateSheetCache(SHEETS.BUSINESS_PLAN, SHEET_NAMES.COUNTRY_TARGET)

  return { ok: true, oldTarget }
}

export async function getTargetAudit(buyerName?: string): Promise<import("@/types").TargetAudit[]> {
  try {
    const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.TARGET_AUDIT)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)

    return dataRows
      .filter((r) => {
        if (!getCell(r, h, "ID")) return false
        if (buyerName && getCell(r, h, "Buyer Name").toLowerCase() !== buyerName.toLowerCase()) return false
        return true
      })
      .map((r) => ({
        id:            getCell(r, h, "ID"),
        buyerName:     getCell(r, h, "Buyer Name"),
        buyerCode:     getCell(r, h, "Buyer Code"),
        financialYear: getCell(r, h, "Financial Year") as import("@/types").FinancialYear,
        oldTarget:     getCellNum(r, h, "Old Target"),
        newTarget:     getCellNum(r, h, "New Target"),
        changedBy:     getCell(r, h, "Changed By"),
        changedAt:     getCell(r, h, "Changed At"),
        reason:        getCell(r, h, "Reason"),
      }))
      .reverse()
  } catch { return [] }
}

// ─── Canonical Buyer Master / Alias Map — Append ─────────────────────────────

export async function addCanonicalBuyer(buyer: import("@/types").CanonicalBuyer): Promise<void> {
  if (!SHEETS.CANONICAL_MAP) throw new Error("CANONICAL_BUYER_MAP_SHEET_ID not configured")
  await appendToSheet(SHEETS.CANONICAL_MAP, SHEET_NAMES.CANONICAL_BUYER_MASTER, [[
    buyer.canonicalBuyerCode,
    buyer.canonicalBuyerName,
    buyer.buyerCode,
    buyer.country,
    buyer.segment,
    buyer.strategicRank,
    buyer.isKeyAccount ? "TRUE" : "FALSE",
    buyer.primaryOwner,
    buyer.backupOwner,
    buyer.targetFY2026,
    buyer.notes,
  ]])
}

const ALIAS_HEADERS = ["aliasName", "canonicalBuyerCode", "buyerCode", "matchConfidence", "source", "addedBy", "addedAt"]

export async function addBuyerAlias(alias: {
  aliasName:          string
  canonicalBuyerCode: string
  buyerCode:          string
  matchConfidence:    "HIGH" | "MEDIUM" | "UNMATCHED"
  source:             string
  addedBy:            string
}): Promise<void> {
  if (!SHEETS.CANONICAL_MAP) throw new Error("CANONICAL_BUYER_MAP_SHEET_ID not configured")
  await ensureSheetExists(SHEETS.CANONICAL_MAP, SHEET_NAMES.BUYER_ALIAS_MAP, ALIAS_HEADERS)
  await appendToSheet(SHEETS.CANONICAL_MAP, SHEET_NAMES.BUYER_ALIAS_MAP, [[
    alias.aliasName,
    alias.canonicalBuyerCode,
    alias.buyerCode,
    alias.matchConfidence,
    alias.source,
    alias.addedBy,
    new Date().toISOString().split("T")[0],
  ]])
}

/**
 * Updates an existing canonical buyer record (find by canonicalBuyerCode).
 * If no row exists yet, appends a new row.
 * Returns true on success.
 */
export async function updateCanonicalBuyer(
  code: string,
  updates: Partial<CanonicalBuyer>
): Promise<boolean> {
  if (!SHEETS.CANONICAL_MAP) return false

  const rowIdx = await findRowIndexByKey(
    SHEETS.CANONICAL_MAP, SHEET_NAMES.CANONICAL_BUYER_MASTER, "canonicalBuyerCode", code
  )

  // No existing row → create one with the supplied updates
  if (rowIdx === -1) {
    const buyer: CanonicalBuyer = {
      canonicalBuyerCode: code,
      canonicalBuyerName: updates.canonicalBuyerName ?? code,
      buyerCode:          updates.buyerCode    ?? "",
      country:            updates.country      ?? "",
      segment:           (updates.segment      ?? "EXISTING") as BuyerSegment,
      strategicRank:      updates.strategicRank ?? 999,
      isKeyAccount:       updates.isKeyAccount ?? false,
      primaryOwner:       updates.primaryOwner ?? "",
      backupOwner:        updates.backupOwner  ?? "",
      targetFY2026:       updates.targetFY2026 ?? 0,
      notes:              updates.notes        ?? "",
    }
    await addCanonicalBuyer(buyer)
    invalidateMemo("canonical_buyers", "buyer_alias_map")
    return true
  }

  // Read existing row, update only the cells in `updates`
  const rows = await readSheet(SHEETS.CANONICAL_MAP, SHEET_NAMES.CANONICAL_BUYER_MASTER)
  const [headerRow] = rows
  const h = buildHeaderMap(headerRow)
  const existing = rows[rowIdx - 1]
  const updated  = [...existing]

  const setCell = (col: string, val: string | number | boolean | undefined) => {
    const idx = h[col]
    if (idx === undefined || val === undefined) return
    updated[idx] = typeof val === "boolean" ? (val ? "TRUE" : "FALSE") : String(val)
  }

  setCell("canonicalBuyerName", updates.canonicalBuyerName)
  setCell("buyerCode",          updates.buyerCode)
  setCell("country",            updates.country)
  setCell("segment",            updates.segment)
  setCell("strategicRank",      updates.strategicRank)
  setCell("isKeyAccount",       updates.isKeyAccount)
  setCell("primaryOwner",       updates.primaryOwner)
  setCell("backupOwner",        updates.backupOwner)
  setCell("targetFY2026",       updates.targetFY2026)
  setCell("notes",              updates.notes)

  await updateSheetRow(SHEETS.CANONICAL_MAP, SHEET_NAMES.CANONICAL_BUYER_MASTER, rowIdx, updated)
  invalidateMemo("canonical_buyers", "buyer_alias_map")
  return true
}

// ─── Brand Categories ────────────────────────────────────────────────────────

/**
 * Returns a Map<brandName_lower, BrandCategory> from the BRAND_CATEGORIES sheet.
 * If the sheet is not configured or empty, returns an empty Map.
 */
export async function getBrandCategoryMap(): Promise<Map<string, BrandCategory>> {
  const result = new Map<string, BrandCategory>()
  if (!SHEETS.CANONICAL_MAP) return result
  try {
    const rows = await readSheet(SHEETS.CANONICAL_MAP, SHEET_NAMES.BRAND_CATEGORIES)
    if (!rows.length) return result
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)
    for (const r of dataRows) {
      const brand = getCell(r, h, "brand")
      const cat   = getCell(r, h, "category")
      if (brand && cat) {
        result.set(brand.toLowerCase().trim(), cat as BrandCategory)
      }
    }
  } catch { /* sheet missing */ }
  return result
}

/**
 * Returns the full list of brand mappings (for admin UI).
 */
export async function getBrandMappings(): Promise<BrandMapping[]> {
  if (!SHEETS.CANONICAL_MAP) return []
  try {
    const rows = await readSheet(SHEETS.CANONICAL_MAP, SHEET_NAMES.BRAND_CATEGORIES)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)
    return dataRows
      .filter((r) => getCell(r, h, "brand"))
      .map((r) => ({
        brand:     getCell(r, h, "brand"),
        category:  (getCell(r, h, "category") || "UNCLASSIFIED") as BrandCategory,
        notes:     getCell(r, h, "notes"),
        updatedBy: getCell(r, h, "updatedBy"),
        updatedAt: getCell(r, h, "updatedAt"),
      }))
  } catch { return [] }
}

/**
 * Sets (or creates) the category for a given brand. Append-or-update.
 */
export async function setBrandCategory(params: {
  brand:     string
  category:  BrandCategory
  notes?:    string
  updatedBy: string
}): Promise<boolean> {
  if (!SHEETS.CANONICAL_MAP) return false

  const rowIdx = await findRowIndexByKey(
    SHEETS.CANONICAL_MAP, SHEET_NAMES.BRAND_CATEGORIES, "brand", params.brand
  )
  const now = new Date().toISOString().split("T")[0]

  if (rowIdx === -1) {
    // Append new row
    await appendToSheet(SHEETS.CANONICAL_MAP, SHEET_NAMES.BRAND_CATEGORIES, [[
      params.brand,
      params.category,
      params.notes ?? "",
      params.updatedBy,
      now,
    ]])
    return true
  }

  // Update existing row
  const rows = await readSheet(SHEETS.CANONICAL_MAP, SHEET_NAMES.BRAND_CATEGORIES)
  const [headerRow] = rows
  const h = buildHeaderMap(headerRow)
  const existing = rows[rowIdx - 1]
  const updated = [...existing]

  const set = (col: string, val: string) => {
    const idx = h[col]
    if (idx !== undefined) updated[idx] = val
  }
  set("category",  params.category)
  if (params.notes !== undefined) set("notes", params.notes)
  set("updatedBy", params.updatedBy)
  set("updatedAt", now)

  await updateSheetRow(SHEETS.CANONICAL_MAP, SHEET_NAMES.BRAND_CATEGORIES, rowIdx, updated)
  return true
}

/**
 * Returns the unique list of brands present in PI_BACKEND_MASTER. Useful for the
 * admin UI to show all brands that may need categorisation.
 */
export async function listAllBrandsFromPI(): Promise<string[]> {
  const records = await getPIRecords()
  const set = new Set<string>()
  for (const r of records) if (r.brand) set.add(r.brand.trim())
  return Array.from(set).sort()
}

/**
 * Updates a single alias row's canonical mapping (used when admin maps an UNMATCHED alias).
 */
export async function updateAliasMapping(params: {
  aliasName:          string
  canonicalBuyerCode: string
  matchConfidence:    "HIGH" | "MEDIUM"
}): Promise<boolean> {
  if (!SHEETS.CANONICAL_MAP) return false
  await ensureSheetExists(SHEETS.CANONICAL_MAP, SHEET_NAMES.BUYER_ALIAS_MAP, ALIAS_HEADERS)
  const rowIdx = await findRowIndexByKey(
    SHEETS.CANONICAL_MAP, SHEET_NAMES.BUYER_ALIAS_MAP, "aliasName", params.aliasName
  )
  if (rowIdx === -1) {
    // No existing row — append new one
    await addBuyerAlias({
      aliasName:          params.aliasName,
      canonicalBuyerCode: params.canonicalBuyerCode,
      buyerCode:          "",
      matchConfidence:    params.matchConfidence,
      source:             "ADMIN_UI",
      addedBy:            "admin",
    })
    invalidateMemo("buyer_alias_map", "canonical_buyers", "pi_records")
    return true
  }
  // Read existing row
  const rows = await readSheet(SHEETS.CANONICAL_MAP, SHEET_NAMES.BUYER_ALIAS_MAP)
  const [headerRow] = rows
  const h = buildHeaderMap(headerRow)
  const existing = rows[rowIdx - 1]
  const updated = [...existing]
  if (h["canonicalBuyerCode"] !== undefined) updated[h["canonicalBuyerCode"]] = params.canonicalBuyerCode
  if (h["matchConfidence"]    !== undefined) updated[h["matchConfidence"]]    = params.matchConfidence
  await updateSheetRow(SHEETS.CANONICAL_MAP, SHEET_NAMES.BUYER_ALIAS_MAP, rowIdx, updated)
  invalidateMemo("buyer_alias_map", "canonical_buyers", "pi_records")
  return true
}



/**
 * Sets (or appends) the dream-market flag for a country.
 * Manager-only — gates handled in the API route.
 */
export async function setCountryStrategy(params: {
  country:         string
  isDreamMarket:   boolean
  priority?:       number
  strategicNotes?: string
  updatedBy:       string
}): Promise<boolean> {
  const country = params.country.toUpperCase().trim()
  const rowIdx  = await findRowIndexByKey(
    SHEETS.BUSINESS_PLAN, SHEET_NAMES.COUNTRY_STRATEGIES, "country", country
  )
  const now = new Date().toISOString().split("T")[0]

  if (rowIdx === -1) {
    await appendToSheet(SHEETS.BUSINESS_PLAN, SHEET_NAMES.COUNTRY_STRATEGIES, [[
      country,
      params.isDreamMarket ? "TRUE" : "FALSE",
      params.priority ?? "",
      params.strategicNotes ?? "",
      params.updatedBy,
      now,
    ]])
    invalidateMemo("country_strategies")
    return true
  }

  const rows = await readSheet(SHEETS.BUSINESS_PLAN, SHEET_NAMES.COUNTRY_STRATEGIES)
  const [headerRow] = rows
  const h = buildHeaderMap(headerRow)
  const existing = rows[rowIdx - 1]
  const updated  = [...existing]

  const setCell = (col: string, val: string) => {
    if (h[col] !== undefined) updated[h[col]] = val
  }
  setCell("isDreamMarket", params.isDreamMarket ? "TRUE" : "FALSE")
  if (params.priority       !== undefined) setCell("priority",       String(params.priority))
  if (params.strategicNotes !== undefined) setCell("strategicNotes", params.strategicNotes)
  setCell("updatedBy", params.updatedBy)
  setCell("updatedAt", now)

  await updateSheetRow(SHEETS.BUSINESS_PLAN, SHEET_NAMES.COUNTRY_STRATEGIES, rowIdx, updated)
  invalidateMemo("country_strategies")
  return true
}

// ─── Travel Plans ────────────────────────────────────────────────────────────

export async function getTravelPlans(params: {
  country?: string
  status?:  TravelStatus
  limit?:   number
}): Promise<TravelPlan[]> {
  try {
    const rows = await readSheet(SHEETS.BUSINESS_PLAN, SHEET_NAMES.TRAVEL_PLANS)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)
    const filtered = dataRows
      .filter((r) => {
        if (!getCell(r, h, "ID")) return false
        if (params.country && getCell(r, h, "Country").toUpperCase() !== params.country.toUpperCase()) return false
        if (params.status  && getCell(r, h, "Status") !== params.status) return false
        return true
      })
      .map((r): TravelPlan => ({
        id:              getCell(r, h, "ID"),
        country:         getCell(r, h, "Country"),
        purpose:         getCell(r, h, "Purpose"),
        assignedTo:      getCell(r, h, "Assigned To"),
        plannedMonth:    getCell(r, h, "Planned Month"),
        days:            getCellNum(r, h, "Days"),
        keyBuyers:       getCell(r, h, "Key Buyers"),
        expectedOutcome: getCell(r, h, "Expected Outcome"),
        status:          (getCell(r, h, "Status") || "PLANNED") as TravelStatus,
        remarks:         getCell(r, h, "Remarks"),
        createdBy:       getCell(r, h, "Created By"),
        createdAt:       getCell(r, h, "Created At"),
        updatedBy:       getCell(r, h, "Updated By") || undefined,
        updatedAt:       getCell(r, h, "Updated At") || undefined,
      }))
      .reverse()
    return params.limit ? filtered.slice(0, params.limit) : filtered
  } catch { return [] }
}

export async function addTravelPlan(plan: Omit<TravelPlan, "id">): Promise<string> {
  const id = `TVL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  await appendToSheet(SHEETS.BUSINESS_PLAN, SHEET_NAMES.TRAVEL_PLANS, [[
    id,
    plan.country,
    plan.purpose,
    plan.assignedTo,
    plan.plannedMonth,
    plan.days,
    plan.keyBuyers,
    plan.expectedOutcome,
    plan.status,
    plan.remarks,
    plan.createdBy,
    plan.createdAt,
    plan.updatedBy ?? "",
    plan.updatedAt ?? "",
  ]])
  return id
}

export async function updateTravelPlan(
  id: string,
  updates: Partial<TravelPlan>,
  updatedBy: string
): Promise<boolean> {
  const rowIdx = await findRowIndexByKey(
    SHEETS.BUSINESS_PLAN, SHEET_NAMES.TRAVEL_PLANS, "ID", id
  )
  if (rowIdx === -1) return false

  const rows = await readSheet(SHEETS.BUSINESS_PLAN, SHEET_NAMES.TRAVEL_PLANS)
  const [headerRow] = rows
  const h = buildHeaderMap(headerRow)
  const existing = rows[rowIdx - 1]
  const updated  = [...existing]
  const now = new Date().toISOString()

  const set = (col: string, val: string | number | undefined) => {
    if (val === undefined || h[col] === undefined) return
    updated[h[col]] = String(val)
  }
  set("Purpose",          updates.purpose)
  set("Assigned To",      updates.assignedTo)
  set("Planned Month",    updates.plannedMonth)
  set("Days",             updates.days)
  set("Key Buyers",       updates.keyBuyers)
  set("Expected Outcome", updates.expectedOutcome)
  set("Status",           updates.status)
  set("Remarks",          updates.remarks)
  set("Updated By",       updatedBy)
  set("Updated At",       now)

  await updateSheetRow(SHEETS.BUSINESS_PLAN, SHEET_NAMES.TRAVEL_PLANS, rowIdx, updated)
  return true
}

// ─── Buyer Tasks ──────────────────────────────────────────────────────────────

function daysBetween(fromIso: string, toIso: string): number {
  if (!fromIso || !toIso) return 0
  const a = new Date(fromIso).getTime()
  const b = new Date(toIso).getTime()
  return Math.floor((b - a) / 86_400_000)
}

export async function getTasks(params: {
  buyerCode?:   string
  assignedTo?:  string
  status?:      TaskStatus
  role?:        AssignedRole
  limit?:       number
}): Promise<BuyerTask[]> {
  try {
    const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.BUYER_TASKS)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)
    const today = new Date().toISOString().split("T")[0]

    const filtered = dataRows
      .filter((r) => {
        if (!getCell(r, h, "ID")) return false
        if (params.buyerCode  && getCell(r, h, "Buyer Code")    !== params.buyerCode)  return false
        if (params.assignedTo && getCell(r, h, "Assigned To").toLowerCase() !== params.assignedTo.toLowerCase()) return false
        if (params.role       && getCell(r, h, "Assigned Role") !== params.role) return false
        if (params.status) {
          // Resolve dynamic OVERDUE on read
          const dueDate = getCell(r, h, "Due Date")
          const status  = getCell(r, h, "Status") || "OPEN"
          const effective = (dueDate && dueDate < today && (status === "OPEN" || status === "IN_PROGRESS"))
            ? "OVERDUE"
            : status
          if (effective !== params.status) return false
        }
        return true
      })
      .map((r): BuyerTask => {
        const dueDate = getCell(r, h, "Due Date")
        const rawStatus = (getCell(r, h, "Status") || "OPEN") as TaskStatus
        const isOverdue = dueDate && dueDate < today && (rawStatus === "OPEN" || rawStatus === "IN_PROGRESS")
        return {
          id:            getCell(r, h, "ID"),
          buyerCode:     getCell(r, h, "Buyer Code"),
          buyerName:     getCell(r, h, "Buyer Name"),
          country:       getCell(r, h, "Country"),
          title:         getCell(r, h, "Title"),
          description:   getCell(r, h, "Description"),
          taskType:      (getCell(r, h, "Task Type") || "CUSTOM") as TaskType,
          assignedTo:    getCell(r, h, "Assigned To"),
          assignedRole:  (getCell(r, h, "Assigned Role") || "SALES_PERSON") as AssignedRole,
          dueDate,
          status:        isOverdue ? "OVERDUE" : rawStatus,
          recurringDays: getCellNum(r, h, "Recurring Days"),
          createdBy:     getCell(r, h, "Created By"),
          createdAt:     getCell(r, h, "Created At"),
          completedBy:   getCell(r, h, "Completed By") || undefined,
          completedAt:   getCell(r, h, "Completed At") || undefined,
          daysToDue:     dueDate ? daysBetween(today, dueDate) : undefined,
        }
      })
      .reverse()

    return params.limit ? filtered.slice(0, params.limit) : filtered
  } catch { return [] }
}

export async function addTask(task: Omit<BuyerTask, "id" | "daysToDue">): Promise<string> {
  const id = `TSK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  await appendToSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.BUYER_TASKS, [[
    id,
    task.buyerCode,
    task.buyerName,
    task.country,
    task.title,
    task.description ?? "",
    task.taskType,
    task.assignedTo,
    task.assignedRole,
    task.dueDate,
    task.status,
    task.recurringDays ?? 0,
    task.createdBy,
    task.createdAt,
    task.completedBy ?? "",
    task.completedAt ?? "",
  ]])
  return id
}

export async function updateTaskStatus(
  id: string,
  newStatus: TaskStatus,
  completedBy?: string
): Promise<{ ok: boolean; task?: BuyerTask }> {
  const rowIdx = await findRowIndexByKey(
    SHEETS.SALES_TRACKING, SHEET_NAMES.BUYER_TASKS, "ID", id
  )
  if (rowIdx === -1) return { ok: false }

  const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.BUYER_TASKS)
  const [headerRow] = rows
  const h = buildHeaderMap(headerRow)
  const existing = rows[rowIdx - 1]
  const updated  = [...existing]

  if (h["Status"] !== undefined) updated[h["Status"]] = newStatus
  if (newStatus === "DONE") {
    if (h["Completed By"] !== undefined) updated[h["Completed By"]] = completedBy ?? ""
    if (h["Completed At"] !== undefined) updated[h["Completed At"]] = new Date().toISOString()
  }
  await updateSheetRow(SHEETS.SALES_TRACKING, SHEET_NAMES.BUYER_TASKS, rowIdx, updated)

  // Auto-renew recurring tasks: when DONE and recurringDays > 0, create the next one
  if (newStatus === "DONE") {
    const recurringIdx = h["Recurring Days"]
    const recurring = recurringIdx !== undefined ? Number(existing[recurringIdx] ?? "0") : 0
    if (recurring > 0) {
      const nextDue = new Date()
      nextDue.setDate(nextDue.getDate() + recurring)
      await addTask({
        buyerCode:     existing[h["Buyer Code"]] ?? "",
        buyerName:     existing[h["Buyer Name"]] ?? "",
        country:       existing[h["Country"]] ?? "",
        title:         existing[h["Title"]] ?? "",
        description:   existing[h["Description"]] ?? "",
        taskType:      (existing[h["Task Type"]] || "CUSTOM") as TaskType,
        assignedTo:    existing[h["Assigned To"]] ?? "",
        assignedRole:  (existing[h["Assigned Role"]] || "SALES_PERSON") as AssignedRole,
        dueDate:       nextDue.toISOString().split("T")[0],
        status:        "OPEN",
        recurringDays: recurring,
        createdBy:     existing[h["Created By"]] ?? "system",
        createdAt:     new Date().toISOString(),
      })
    }
  }

  return { ok: true }
}

export async function updateTaskDetails(
  id: string,
  updates: Partial<BuyerTask>
): Promise<boolean> {
  const rowIdx = await findRowIndexByKey(
    SHEETS.SALES_TRACKING, SHEET_NAMES.BUYER_TASKS, "ID", id
  )
  if (rowIdx === -1) return false

  const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.BUYER_TASKS)
  const [headerRow] = rows
  const h = buildHeaderMap(headerRow)
  const existing = rows[rowIdx - 1]
  const updated  = [...existing]

  const setCell = (col: string, val: string | undefined) => {
    if (val !== undefined && h[col] !== undefined) {
      updated[h[col]] = val
    }
  }

  setCell("Title", updates.title)
  setCell("Description", updates.description)
  setCell("Assigned To", updates.assignedTo)
  setCell("Due Date", updates.dueDate)

  await updateSheetRow(SHEETS.SALES_TRACKING, SHEET_NAMES.BUYER_TASKS, rowIdx, updated)
  return true
}

export async function deleteTask(id: string): Promise<boolean> {
  const rowIdx = await findRowIndexByKey(
    SHEETS.SALES_TRACKING, SHEET_NAMES.BUYER_TASKS, "ID", id
  )
  if (rowIdx === -1) return false
  await deleteSheetRow(SHEETS.SALES_TRACKING, SHEET_NAMES.BUYER_TASKS, rowIdx)
  invalidateSheetCache(SHEETS.SALES_TRACKING, SHEET_NAMES.BUYER_TASKS)
  return true
}

/**
 * Counts MEETING activities for a buyer in the current calendar month.
 * Returns target vs actual + compliance flag based on segment rules.
 */
export async function getMeetingComplianceForBuyer(params: {
  buyerCode:    string
  buyerName:    string
  segment:      BuyerSegment
}): Promise<import("@/types").MeetingCompliance> {
  const target = MEETING_TARGET_BY_SEGMENT[params.segment] ?? 0
  if (target === 0) {
    return {
      buyerCode:     params.buyerCode,
      buyerName:     params.buyerName,
      segment:       params.segment,
      monthlyTarget: 0,
      monthActual:   0,
      isCompliant:   true,
      remaining:     0,
    }
  }

  const now      = new Date()
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const activities = await getLeadActivities({ buyerCode: params.buyerCode, limit: 500 })
  const monthMeetings = activities.filter(
    (a) => a.activityType === "MEETING" && a.date.startsWith(monthStr)
  ).length

  return {
    buyerCode:     params.buyerCode,
    buyerName:     params.buyerName,
    segment:       params.segment,
    monthlyTarget: target,
    monthActual:   monthMeetings,
    isCompliant:   monthMeetings >= target,
    remaining:     Math.max(0, target - monthMeetings),
  }
}



// ─── Credentials ─────────────────────────────────────────────────────────────

export async function getCredentials(): Promise<(import("@/types").AppUser & { password: string })[]> {
  try {
    const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.CREDENTIALS)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)

    return dataRows.map((r, i) => ({
      id: String(i + 1),
      name: getCell(r, h, "Name"),
      email: getCell(r, h, "Email"),
      role: getCell(r, h, "Role") as import("@/types").UserRole,
      password: getCell(r, h, "Password"),
      salesPersonName: getCell(r, h, "Name").toUpperCase(), // Default mapping
    }))
  } catch (err) {
    console.error("Failed to fetch credentials:", err)
    return []
  }
}

// ─── Aggregation Helpers ──────────────────────────────────────────────────────

export function filterPIByFY(records: PIRecord[], fy: FinancialYear): PIRecord[] {
  return records.filter((r) => {
    // Prefer explicit financialYear column (e.g. "2025-26") when present
    if (r.financialYear && r.financialYear.trim()) {
      return r.financialYear.trim() === fy
    }
    // Fall back to parsing piDate
    const date = parsePIDate(r.piDate)
    return isInFY(date, fy)
  })
}

/**
 * Sum container counts treating containers as a PI-LEVEL value.
 * Each sheet row is one product; "Total Containers" is repeated on every
 * product row of the same PI. So we count each unique PI exactly once.
 * (Qty / MTs / Amount are product-level and should be summed per row instead.)
 */
export function sumContainers(records: PIRecord[]): number {
  const perPI = new Map<string, number>()
  for (const r of records) {
    if (!perPI.has(r.piNumber)) perPI.set(r.piNumber, r.totalContainers)
  }
  let sum = 0
  for (const v of perPI.values()) sum += v
  return sum
}

/**
 * Group container totals by a PI-level key (country / sales person / buyer /
 * fy-week / variety etc.), counting each PI's containers only once per key.
 * Returns a Map of key -> container total.
 */
export function sumContainersBy<K>(
  records: PIRecord[],
  keyFn: (r: PIRecord) => K
): Map<K, number> {
  const totals = new Map<K, number>()
  const seen   = new Map<K, Set<string>>()
  for (const r of records) {
    const k = keyFn(r)
    let seenSet = seen.get(k)
    if (!seenSet) { seenSet = new Set(); seen.set(k, seenSet) }
    if (seenSet.has(r.piNumber)) continue   // this PI already counted for this key
    seenSet.add(r.piNumber)
    totals.set(k, (totals.get(k) ?? 0) + r.totalContainers)
  }
  return totals
}

export function groupByBuyer(records: PIRecord[]): Record<string, PIRecord[]> {
  return records.reduce(
    (acc, r) => {
      const key = r.buyerCode || r.buyerCompanyName
      acc[key] = acc[key] ? [...acc[key], r] : [r]
      return acc
    },
    {} as Record<string, PIRecord[]>
  )
}

export function groupByCountry(records: PIRecord[]): Record<string, PIRecord[]> {
  return records.reduce(
    (acc, r) => {
      const key = r.countries.toUpperCase()
      acc[key] = acc[key] ? [...acc[key], r] : [r]
      return acc
    },
    {} as Record<string, PIRecord[]>
  )
}

export function groupBySalesPerson(records: PIRecord[]): Record<string, PIRecord[]> {
  return records.reduce(
    (acc, r) => {
      const key = r.salesPerson.toUpperCase()
      acc[key] = acc[key] ? [...acc[key], r] : [r]
      return acc
    },
    {} as Record<string, PIRecord[]>
  )
}

// ─── 80/20 Tier Classification ────────────────────────────────────────────────

export function classifyBuyerTiers<T extends { targetContainer2026: number; buyerName: string }>(
  buyers: T[]
): (T & { tier: "TIER1" | "TIER2" | "TIER3" })[] {
  const sorted = [...buyers].sort((a, b) => b.targetContainer2026 - a.targetContainer2026)
  const total = sorted.reduce((s, b) => s + b.targetContainer2026, 0)
  if (total === 0) return sorted.map((b) => ({ ...b, tier: "TIER3" as const }))

  let cumulative = 0
  return sorted.map((buyer) => {
    cumulative += buyer.targetContainer2026
    const pct = cumulative / total
    const tier: "TIER1" | "TIER2" | "TIER3" =
      pct <= 0.8 ? "TIER1" : pct <= 0.95 ? "TIER2" : "TIER3"
    return { ...buyer, tier }
  })
}

// ─── 80/20 Buyers Sheet ───────────────────────────────────────────────────────

export async function get8020Buyers(): Promise<Buyer8020[]> {
  return withMemo("buyers_8020", async () => {
    try {
      // Tab name may have trailing space, different casing, or "80-20"/"80_20" variations
      const tabName = await findExistingTab(SHEETS.EIGHTY_TWENTY, [
        SHEET_NAMES.EIGHTY_TWENTY_BUYERS,
        "80/20 Buyers",
        "80/20 buyers",
        "80/20",
        "80-20 buyers",
        "8020 buyers",
        "EIGHTY_TWENTY_BUYERS",
      ])
      if (!tabName) {
        console.error("[data] Could not find a tab matching '80/20 buyers' in spreadsheet")
        return []
      }
      const rows = await readSheet(SHEETS.EIGHTY_TWENTY, tabName)
      if (!rows.length) return []
      const [headerRow, ...dataRows] = rows
      const h = buildHeaderMap(headerRow)
      // Case-insensitive lookup map (handles "resposible mail", "sales cood mail", etc.)
      const hLower: Record<string, number> = {}
      for (const [key, idx] of Object.entries(h)) hLower[key.toLowerCase()] = idx

      function col(r: string[], ...names: string[]): string {
        for (const name of names) {
          const idx = hLower[name.toLowerCase()]
          if (idx !== undefined && (r[idx] ?? "").trim()) return r[idx].trim()
        }
        return ""
      }
      function colNum(r: string[], ...names: string[]): number {
        const v = col(r, ...names)
        return v ? parseFloat(v.replace(/,/g, "")) || 0 : 0
      }

      // Normalize tier — handles "T-1", "T- 2", "TIER1", "1", "T1", etc.
      function parseTier(raw: string): Tier8020All {
        const n = raw.replace(/[^a-z0-9]/gi, "").toUpperCase()
        if (n === "T1" || n === "TIER1" || n === "1") return "TIER1"
        if (n === "T2" || n === "TIER2" || n === "2") return "TIER2"
        if (n === "T3" || n === "TIER3" || n === "3") return "TIER3"
        return "OTHERS"
      }

      const seen = new Set<string>()   // dedupe by (buyerName + country)
      const out: Buyer8020[] = []

      for (const r of dataRows) {
        const buyerName = col(r,
          "Buyer Company Name", "Buyer Name", "Buyer", "Company Name", "Company")
        if (!buyerName) continue

        const country = col(r, "Countries", "Country", "Market")
        const dedupeKey = `${buyerName.toLowerCase()}||${country.toLowerCase()}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)

        const tier = parseTier(col(r, "Tier", "Classification", "Category"))

        const targetContainers = colNum(r,
          "Current Year Target Containers",
          "Target Containers", "Target", "Containers Target")
        const annualTarget     = colNum(r,
          "Annual Target",
          "Current Year Target Containers",
          "Target Containers", "Target")

        out.push({
          buyerName,
          country,
          tier,
          responsiblePerson: col(r,
            "Resposible",                 // user's actual column (typo + trailing space, trimmed by buildHeaderMap)
            "Responsible Person", "Sales Person", "Owner", "Responsible"),
          responsibleEmail:  col(r,
            "resposible mail", "Resposible mail",
            "Responsible Person Email", "Responsible Email",
            "Sales Email", "Owner Email"),
          salesCoordinator:  col(r,
            "sales Coordinators", "Sales Coordinators",
            "Sales Coordinator", "Coordinator"),
          coordinatorEmail:  col(r,
            "sales cood mail", "Sales cood mail",
            "Sales Coordinator Email", "Coordinator Email"),
          targetContainers,
          annualTarget:      annualTarget || targetContainers,
          financialYear:     col(r, "Financial Year", "FY", "Fin Year") || "",
          notes:             col(r,
            "Actions points", "Action points",
            "Notes", "Remarks"),
        })
      }
      return out
    } catch (e) {
      console.error("[data] 80/20 buyers fetch error:", e)
      return []
    }
  })
}

/**
 * Update a buyer's TIER in the 80/20 buyers sheet (Tier / Classification column).
 * Matched by buyer name (+ country when provided). Because meeting cadence
 * (TIER1=15, TIER2=20, TIER3=30 days) is derived from this tier at read time,
 * changing it here makes future meeting due-dates follow the new cadence.
 */
export async function updateBuyer8020Tier(params: {
  buyerName: string
  country?:  string
  tier:      "TIER1" | "TIER2" | "TIER3" | "OTHERS"
}): Promise<{ ok: boolean; oldTier?: string; reason?: string }> {
  const tabName = await findExistingTab(SHEETS.EIGHTY_TWENTY, [
    SHEET_NAMES.EIGHTY_TWENTY_BUYERS,
    "80/20 Buyers", "80/20 buyers", "80/20", "80-20 buyers", "8020 buyers", "EIGHTY_TWENTY_BUYERS",
  ])
  if (!tabName) return { ok: false, reason: "tab_not_found" }

  const rows = await readSheet(SHEETS.EIGHTY_TWENTY, tabName)
  if (!rows.length) return { ok: false, reason: "empty_sheet" }

  const [headerRow, ...dataRows] = rows
  const h = buildHeaderMap(headerRow)
  const hLower: Record<string, number> = {}
  for (const [key, idx] of Object.entries(h)) hLower[key.toLowerCase()] = idx
  const colIdx = (...names: string[]) => {
    for (const n of names) { const i = hLower[n.toLowerCase()]; if (i !== undefined) return i }
    return undefined
  }

  const nameIdx = colIdx("Buyer Company Name", "Buyer Name", "Buyer", "Company Name", "Company")
  const tierIdx = colIdx("Tier", "Classification", "Category")
  const cntryIdx = colIdx("Countries", "Country", "Market")
  if (nameIdx === undefined || tierIdx === undefined) return { ok: false, reason: "missing_columns" }

  const wantName    = params.buyerName.trim().toLowerCase()
  const wantCountry = (params.country ?? "").trim().toLowerCase()
  const matchIdx = dataRows.findIndex((r) => {
    const nameOk = (r[nameIdx] ?? "").trim().toLowerCase() === wantName
    if (!nameOk) return false
    if (!wantCountry || cntryIdx === undefined) return true
    return (r[cntryIdx] ?? "").trim().toLowerCase() === wantCountry
  })
  if (matchIdx === -1) return { ok: false, reason: "row_not_found" }

  const rowIndex = matchIdx + 2  // header + 1-based
  const oldTier  = dataRows[matchIdx][tierIdx] ?? ""
  const updated  = [...dataRows[matchIdx]]
  updated[tierIdx] = params.tier
  await updateSheetRow(SHEETS.EIGHTY_TWENTY, tabName, rowIndex, updated)
  invalidateSheetCache(SHEETS.EIGHTY_TWENTY, tabName)
  // Cadence + monitored set depend on tier → refresh derived caches
  invalidateMemo("buyers_8020", "meeting_schedules", "others_buyers")

  return { ok: true, oldTier }
}

// ─── 80/20 Meeting Schedule / History / Alerts (Google Sheets) ────────────────
// Three sheet tabs (auto-created on first write in the SALES_TRACKING spreadsheet):
//
//   MEETING_SCHEDULE_8020 — mutable, one row per Tier-1/2/3 buyer:
//     ID | Buyer Name | Country | Last Meeting Date | Next Due Date | Meeting Remarks | Updated At
//
//   MEETING_HISTORY_8020 — append-only completed-meeting log:
//     ID | Meeting ID | Buyer Name | Country | Meeting Date | Completed By | Notes | Created At
//
//   ALERT_LOG_8020 — append-only email-sent dedup log:
//     ID | Meeting ID | Buyer Name | Alert Date | Email To | Status | Created At
// ─────────────────────────────────────────────────────────────────────────────

/** Stable, deterministic meeting ID from buyer name + country */
export function buildMeetingId(buyerName: string, country: string): string {
  const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  return `m_${slug(buyerName)}__${slug(country)}`
}

function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** Returns current time as a human-readable IST string for sheet storage.
 *  e.g. "19/05/2026, 11:52:00 AM" (Asia/Kolkata)
 */
function nowIST(): string {
  return new Date().toLocaleString("en-IN", {
    timeZone:   "Asia/Kolkata",
    day:        "2-digit",
    month:      "2-digit",
    year:       "numeric",
    hour:       "2-digit",
    minute:     "2-digit",
    second:     "2-digit",
    hour12:     true,
  })
}

interface MeetingScheduleRow {
  id: string
  buyerName: string
  country: string
  lastMeetingDate: string  // YYYY-MM-DD or ""
  nextDueDate: string      // YYYY-MM-DD
  meetingRemarks: string
  updatedAt: string        // ISO
}

interface MeetingHistoryRow {
  id: string
  meetingId: string
  buyerName: string
  country: string
  meetingDate: string
  completedBy: string
  outcome: string       // MeetingOutcome enum value, stored as plain string
  notes: string
  createdAt: string
}

interface AlertLogRow {
  id: string
  meetingId: string
  buyerName: string
  alertDate: string  // YYYY-MM-DD
  emailTo: string
  status: string
  createdAt: string
}

// Headers for the auto-created tracking tabs (kept here so creation + read align)
const SCHEDULE_HEADERS = [
  "ID", "Buyer Name", "Country",
  "Last Meeting Date", "Next Due Date", "Meeting Remarks", "Updated At",
]
const HISTORY_HEADERS = [
  "ID", "Meeting ID", "Buyer Name", "Country",
  "Meeting Date", "Completed By", "Outcome", "Notes", "Created At",
]
const ALERT_HEADERS = [
  "ID", "Meeting ID", "Buyer Name", "Alert Date", "Email To", "Status", "Created At",
]

async function getMeetingScheduleRows(): Promise<MeetingScheduleRow[]> {
  try {
    await ensureSheetExists(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_SCHEDULE_8020, SCHEDULE_HEADERS)
    const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_SCHEDULE_8020)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)
    return dataRows
      .filter((r) => getCell(r, h, "ID"))
      .map((r) => ({
        id:              getCell(r, h, "ID"),
        buyerName:       getCell(r, h, "Buyer Name"),
        country:         getCell(r, h, "Country"),
        lastMeetingDate: getCell(r, h, "Last Meeting Date"),
        nextDueDate:     getCell(r, h, "Next Due Date"),
        meetingRemarks:  getCell(r, h, "Meeting Remarks"),
        updatedAt:       getCell(r, h, "Updated At"),
      }))
  } catch {
    return []
  }
}

async function getMeetingHistoryRows(): Promise<MeetingHistoryRow[]> {
  try {
    await ensureSheetExists(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_HISTORY_8020, HISTORY_HEADERS)
    const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_HISTORY_8020)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)
    return dataRows
      .filter((r) => getCell(r, h, "ID"))
      .map((r) => ({
        id:          getCell(r, h, "ID"),
        meetingId:   getCell(r, h, "Meeting ID"),
        buyerName:   getCell(r, h, "Buyer Name"),
        country:     getCell(r, h, "Country"),
        meetingDate: getCell(r, h, "Meeting Date"),
        completedBy: getCell(r, h, "Completed By"),
        outcome:     getCell(r, h, "Outcome") || "OTHER",
        notes:       getCell(r, h, "Notes"),
        createdAt:   getCell(r, h, "Created At"),
      }))
  } catch {
    return []
  }
}

export async function getAlertLogRows(alertDate?: string): Promise<AlertLogRow[]> {
  try {
    await ensureSheetExists(SHEETS.SALES_TRACKING, SHEET_NAMES.ALERT_LOG_8020, ALERT_HEADERS)
    const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.ALERT_LOG_8020)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)
    const all = dataRows
      .filter((r) => getCell(r, h, "ID"))
      .map((r) => ({
        id:         getCell(r, h, "ID"),
        meetingId:  getCell(r, h, "Meeting ID"),
        buyerName:  getCell(r, h, "Buyer Name"),
        alertDate:  getCell(r, h, "Alert Date"),
        emailTo:    getCell(r, h, "Email To"),
        status:     getCell(r, h, "Status"),
        createdAt:  getCell(r, h, "Created At"),
      }))
    return alertDate ? all.filter((a) => a.alertDate === alertDate) : all
  } catch {
    return []
  }
}

/** Append one or more new schedule rows. Caller ensures rows don't already exist. */
async function appendMeetingSchedules(rows: MeetingScheduleRow[]): Promise<void> {
  if (!rows.length) return
  await ensureSheetExists(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_SCHEDULE_8020, SCHEDULE_HEADERS)
  await appendToSheet(
    SHEETS.SALES_TRACKING,
    SHEET_NAMES.MEETING_SCHEDULE_8020,
    rows.map((r) => [
      r.id, r.buyerName, r.country,
      r.lastMeetingDate, r.nextDueDate, r.meetingRemarks, r.updatedAt,
    ])
  )
  invalidateSheetCache(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_SCHEDULE_8020)
}

/** Update an existing schedule row identified by ID. */
async function updateMeetingScheduleRow(
  id: string,
  updates: Partial<MeetingScheduleRow>
): Promise<boolean> {
  const rowIdx = await findRowIndexByKey(
    SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_SCHEDULE_8020, "ID", id
  )
  if (rowIdx === -1) return false

  const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_SCHEDULE_8020)
  const h = buildHeaderMap(rows[0])
  const row = [...rows[rowIdx - 1]]

  const set = (col: string, val: string | undefined) => {
    const idx = h[col]
    if (idx === undefined || val === undefined) return
    while (row.length <= idx) row.push("")
    row[idx] = val
  }
  set("Buyer Name",         updates.buyerName)
  set("Country",            updates.country)
  set("Last Meeting Date",  updates.lastMeetingDate)
  set("Next Due Date",      updates.nextDueDate)
  set("Meeting Remarks",    updates.meetingRemarks)
  set("Updated At",         updates.updatedAt ?? nowIST())

  await updateSheetRow(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_SCHEDULE_8020, rowIdx, row)
  invalidateSheetCache(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_SCHEDULE_8020)
  return true
}

export async function addMeetingHistoryEntry(entry: {
  meetingId: string; buyerName: string; country: string
  meetingDate: string; completedBy: string; outcome?: string; notes: string
}): Promise<string> {
  await ensureSheetExists(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_HISTORY_8020, HISTORY_HEADERS)
  const id = uniqueId("h")
  const createdAt = nowIST()
  await appendToSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_HISTORY_8020, [[
    id, entry.meetingId, entry.buyerName, entry.country,
    entry.meetingDate, entry.completedBy, entry.outcome ?? "OTHER", entry.notes, createdAt,
  ]])
  invalidateSheetCache(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_HISTORY_8020)
  return id
}

/** Batch-append many history entries in a single Sheets API call (rate-limit friendly). */
async function appendMeetingHistoryBatch(entries: {
  meetingId: string; buyerName: string; country: string
  meetingDate: string; completedBy: string; outcome?: string; notes: string
}[]): Promise<void> {
  if (!entries.length) return
  await ensureSheetExists(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_HISTORY_8020, HISTORY_HEADERS)
  const createdAt = new Date().toISOString()
  const rows = entries.map((e) => [
    uniqueId("h"), e.meetingId, e.buyerName, e.country,
    e.meetingDate, e.completedBy, e.outcome ?? "OTHER", e.notes, createdAt,
  ])
  await appendToSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_HISTORY_8020, rows)
  invalidateSheetCache(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_HISTORY_8020)
}

/**
 * Remove a single history entry by its ID. Used by the Undo flow.
 * Returns the deleted entry so the caller can recompute the schedule.
 */
async function deleteMeetingHistoryById(historyId: string): Promise<MeetingHistoryRow | null> {
  const rows = await getMeetingHistoryRows()
  const target = rows.find((r) => r.id === historyId)
  if (!target) return null
  const rowIdx = await findRowIndexByKey(
    SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_HISTORY_8020, "ID", historyId
  )
  if (rowIdx === -1) return null
  await deleteSheetRow(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_HISTORY_8020, rowIdx)
  invalidateSheetCache(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_HISTORY_8020)
  return target
}

export async function addAlertLogEntry(entry: {
  meetingId: string; buyerName: string; alertDate: string
  emailTo: string; status: string
}): Promise<string> {
  await ensureSheetExists(SHEETS.SALES_TRACKING, SHEET_NAMES.ALERT_LOG_8020, ALERT_HEADERS)
  const id = uniqueId("a")
  const createdAt = nowIST()
  await appendToSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.ALERT_LOG_8020, [[
    id, entry.meetingId, entry.buyerName,
    entry.alertDate, entry.emailTo, entry.status, createdAt,
  ]])
  invalidateSheetCache(SHEETS.SALES_TRACKING, SHEET_NAMES.ALERT_LOG_8020)
  return id
}

/**
 * Main read for the 80/20 module.
 *
 * Joins:
 *  - "80/20 Buyers" sheet (targets, tier, owner, coordinator)
 *  - MEETING_SCHEDULE_8020 (last meeting / next due date)
 *  - MEETING_HISTORY_8020 (audit trail)
 *  - PI_BACKEND_MASTER (actuals = sum of current-FY containers per buyer)
 *
 * Returns enriched MeetingSchedule[] with real performance data.
 */
export async function getMeetingSchedules(): Promise<MeetingSchedule[]> {
  return withMemo("meeting_schedules", async () => {
  const [buyers8020, scheduleRows, historyRows, allPI] = await Promise.all([
    get8020Buyers(),
    getMeetingScheduleRows(),
    getMeetingHistoryRows(),
    getPIRecords(),
  ])

  const buyers = buyers8020.filter((b) => b.tier !== "OTHERS")
  if (!buyers.length) return []

  // ── Schedule row sync (append-only for new buyers) ─────────────────────────
  // For each new buyer, build a staggered initial schedule with auto-done
  // backlog history (so they don't appear permanently overdue).
  const existingById = new Map(scheduleRows.map((s) => [s.id, s]))
  const toCreate: MeetingScheduleRow[] = []
  const backlogHistoryToAppend: { meetingId: string; buyerName: string; country: string; meetingDate: string; notes: string }[] = []

  for (const b of buyers) {
    const id = buildMeetingId(b.buyerName, b.country)
    if (!existingById.has(id)) {
      const bootstrap = buildInitialSchedule(b.tier, b.buyerName)
      const row: MeetingScheduleRow = {
        id,
        buyerName:       b.buyerName,
        country:         b.country,
        lastMeetingDate: bootstrap.lastMeetingDate ?? "",
        nextDueDate:     bootstrap.nextDueDate,
        meetingRemarks:  bootstrap.history.length > 0 ? "Auto-bootstrapped on system init" : "",
        updatedAt:       new Date().toISOString(),
      }
      toCreate.push(row)
      existingById.set(id, row)
      // Queue history entries for batch append
      for (const h of bootstrap.history) {
        backlogHistoryToAppend.push({
          meetingId:   id,
          buyerName:   b.buyerName,
          country:     b.country,
          meetingDate: h.meetingDate,
          notes:       h.notes,
        })
      }
    }
  }
  if (toCreate.length) await appendMeetingSchedules(toCreate)
  // Batch-append backlog history (single Sheets API call, rate-limit friendly)
  if (backlogHistoryToAppend.length) {
    await appendMeetingHistoryBatch(
      backlogHistoryToAppend.map((h) => ({
        meetingId:   h.meetingId,
        buyerName:   h.buyerName,
        country:     h.country,
        meetingDate: h.meetingDate,
        completedBy: "system",
        notes:       h.notes,
      }))
    )
  }
  // Re-read history if we appended any (else use existing)
  const finalHistoryRows = backlogHistoryToAppend.length > 0
    ? await getMeetingHistoryRows()
    : historyRows

  // ── Build history index ───────────────────────────────────────────────────
  const historyByMeetingId = new Map<string, MeetingHistoryRow[]>()
  for (const h of finalHistoryRows) {
    if (!historyByMeetingId.has(h.meetingId)) historyByMeetingId.set(h.meetingId, [])
    historyByMeetingId.get(h.meetingId)!.push(h)
  }

  // ── Build PI buyer index (current FY only) ─────────────────────────────────
  const currentFY   = getCurrentFY()
  const currentWeek = getCurrentFYWeek()
  const currentFYPI = filterPIByFY(allPI, currentFY)

  const normName = (s: string) => s.toLowerCase().trim()
  const piByBuyer = new Map<string, { containers: number; lastOrderDate: string; orderCount: number; seenPIs: Set<string> }>()
  for (const r of currentFYPI) {
    const key = normName(r.buyerCompanyName)
    if (!piByBuyer.has(key)) piByBuyer.set(key, { containers: 0, lastOrderDate: "", orderCount: 0, seenPIs: new Set() })
    const e = piByBuyer.get(key)!
    // Containers are PI-level (repeated per product row) — count each PI once per buyer.
    if (!e.seenPIs.has(r.piNumber)) {
      e.seenPIs.add(r.piNumber)
      e.containers += r.totalContainers
    }
    e.orderCount  += 1
    if (r.piDate > e.lastOrderDate) e.lastOrderDate = r.piDate
  }

  // ── Merge + enrich each monitored buyer ────────────────────────────────────
  return buyers.map((b): MeetingSchedule => {
    const id    = buildMeetingId(b.buyerName, b.country)
    const sched = existingById.get(id)!
    const hist  = (historyByMeetingId.get(id) ?? [])
      .sort((a, z) => z.meetingDate.localeCompare(a.meetingDate))
    const nextDueDateObj = new Date(sched.nextDueDate)

    // Performance from PI
    const pi             = piByBuyer.get(normName(b.buyerName))
    const target         = b.annualTarget
    const actual         = pi?.containers ?? 0
    const targetDue      = targetDueTillWeek(target, currentWeek)
    const gap            = parseFloat((actual - targetDue).toFixed(2))
    const achievementPct = target > 0 ? Math.round((actual / target) * 100) : 0
    const performanceStatus = getStatus(target, actual, targetDue) as PerformanceStatus
    const lastOrderDate  = pi?.lastOrderDate || null

    return {
      id,
      buyerName:         b.buyerName,
      country:           b.country,
      tier:              b.tier as MeetingSchedule["tier"],
      responsiblePerson: b.responsiblePerson,
      responsibleEmail:  b.responsibleEmail,
      salesCoordinator:  b.salesCoordinator,
      coordinatorEmail:  b.coordinatorEmail,
      target,
      actual,
      targetDue,
      gap,
      achievementPct,
      performanceStatus,
      lastOrderDate,
      lastMeetingDate:   sched.lastMeetingDate || null,
      nextDueDate:       sched.nextDueDate,
      meetingRemarks:    sched.meetingRemarks,
      displayStatus:     getMeetingDisplayStatus(nextDueDateObj),
      daysRemaining:     daysUntil(nextDueDateObj),
      history: hist.map((h): MeetingHistoryEntry => ({
        id:          h.id,
        meetingDate: h.meetingDate,
        completedBy: h.completedBy,
        outcome:     (h.outcome || "OTHER") as MeetingHistoryEntry["outcome"],
        notes:       h.notes,
        createdAt:   h.createdAt,
      })),
      createdAt: sched.updatedAt,
      updatedAt: sched.updatedAt,
    }
  })
  }, SHORT_TTL)
}

/**
 * Returns OTHERS-tier buyers (not in 80/20 monitoring) joined with current-FY
 * performance from PI_BACKEND_MASTER.
 */
export async function getOthersBuyers(): Promise<OthersBuyerSummary[]> {
  return withMemo("others_buyers", async () => {
  const [buyers, allPI] = await Promise.all([get8020Buyers(), getPIRecords()])
  const others = buyers.filter((b) => b.tier === "OTHERS")
  if (!others.length) return []

  const currentFY   = getCurrentFY()
  const currentFYPI = filterPIByFY(allPI, currentFY)
  const normName = (s: string) => s.toLowerCase().trim()

  const piByBuyer = new Map<string, { containers: number; lastOrderDate: string; seenPIs: Set<string> }>()
  for (const r of currentFYPI) {
    const key = normName(r.buyerCompanyName)
    if (!piByBuyer.has(key)) piByBuyer.set(key, { containers: 0, lastOrderDate: "", seenPIs: new Set() })
    const e = piByBuyer.get(key)!
    // Containers are PI-level (repeated per product row) — count each PI once per buyer.
    if (!e.seenPIs.has(r.piNumber)) {
      e.seenPIs.add(r.piNumber)
      e.containers += r.totalContainers
    }
    if (r.piDate > e.lastOrderDate) e.lastOrderDate = r.piDate
  }

  return others.map((b): OthersBuyerSummary => {
    const pi     = piByBuyer.get(normName(b.buyerName))
    const target = b.annualTarget
    const actual = pi?.containers ?? 0
    return {
      buyerName:         b.buyerName,
      country:           b.country,
      responsiblePerson: b.responsiblePerson,
      salesCoordinator:  b.salesCoordinator,
      target,
      actual,
      achievementPct:    target > 0 ? Math.round((actual / target) * 100) : 0,
      lastOrderDate:     pi?.lastOrderDate || null,
    }
  })
  }, SHORT_TTL)
}

/**
 * Complete a meeting: update the schedule row + append a history entry.
 * Returns the freshly-updated MeetingSchedule (re-read from sheet via getMeetingSchedules).
 */
export async function completeMeeting(params: {
  meetingId:   string
  meetingDate: string   // YYYY-MM-DD
  outcome?:    string   // MeetingOutcome enum
  notes:       string
  completedBy: string
}): Promise<MeetingSchedule | null> {
  const { calcNextDueDate } = await import("./8020-utils")

  const all = await getMeetingSchedules()
  const target = all.find((m) => m.id === params.meetingId)
  if (!target) return null

  const meetingDateObj = new Date(params.meetingDate)
  const nextDue = calcNextDueDate(meetingDateObj, target.tier)
    .toISOString().split("T")[0]

  const updated = await updateMeetingScheduleRow(params.meetingId, {
    lastMeetingDate: params.meetingDate,
    nextDueDate:     nextDue,
    meetingRemarks:  params.notes || target.meetingRemarks,
    updatedAt:       nowIST(),
  })
  if (!updated) {
    // Row didn't exist yet (e.g. user clicked Done before the auto-bootstrap row was
    // persisted). Append a fresh row instead so the meeting is actually recorded.
    await appendMeetingSchedules([{
      id:              params.meetingId,
      buyerName:       target.buyerName,
      country:         target.country,
      lastMeetingDate: params.meetingDate,
      nextDueDate:     nextDue,
      meetingRemarks:  params.notes || target.meetingRemarks,
      updatedAt:       nowIST(),
    }])
  }
  await addMeetingHistoryEntry({
    meetingId:   params.meetingId,
    buyerName:   target.buyerName,
    country:     target.country,
    meetingDate: params.meetingDate,
    completedBy: params.completedBy,
    outcome:     params.outcome,
    notes:       params.notes,
  })

  // Bust the memo so the NEXT call (e.g. dashboard refresh) reads fresh data.
  invalidateMemo("meeting_schedules", "others_buyers")

  // ── Fast path: build the updated MeetingSchedule locally instead of doing a
  // second 4-sheet round-trip. The dashboard will refetch on its own after this
  // response returns — no need to re-read here.
  const { getMeetingDisplayStatus } = await import("./8020-utils")
  const { daysUntil } = await import("./8020-utils")
  const nextDueDateObj = new Date(nextDue)
  const newHistoryEntry: MeetingHistoryEntry = {
    id:          `h_pending_${Date.now()}`,   // real id will appear on next refresh
    meetingDate: params.meetingDate,
    completedBy: params.completedBy,
    outcome:     (params.outcome ?? "OTHER") as MeetingHistoryEntry["outcome"],
    notes:       params.notes,
    createdAt:   new Date().toISOString(),
  }
  const updatedMeeting: MeetingSchedule = {
    ...target,
    lastMeetingDate: params.meetingDate,
    nextDueDate:     nextDue,
    meetingRemarks:  params.notes || target.meetingRemarks,
    displayStatus:   getMeetingDisplayStatus(nextDueDateObj),
    daysRemaining:   daysUntil(nextDueDateObj),
    history:         [newHistoryEntry, ...target.history],
    updatedAt:       new Date().toISOString(),
  }
  return updatedMeeting
}

/**
 * Undo the most recent "done" action for a meeting:
 *   1. Delete the latest history entry for this meetingId
 *   2. Recompute lastMeetingDate from the now-latest history (or "" if none)
 *   3. Recompute nextDueDate using calcNextDueDate / buildInitialSchedule
 *
 * Used when a sales coordinator marks a meeting done by mistake.
 *
 * Returns the refreshed MeetingSchedule. If there was no history to undo,
 * returns the meeting unchanged with `undone: false`.
 */
export async function undoLastMeeting(params: {
  meetingId: string
  undoneBy:  string   // for audit log only (not stored separately yet)
}): Promise<{ meeting: MeetingSchedule | null; undone: boolean; removedHistoryId?: string }> {
  const { calcNextDueDate, buildInitialSchedule } = await import("./8020-utils")

  const all    = await getMeetingSchedules()
  const target = all.find((m) => m.id === params.meetingId)
  if (!target) return { meeting: null, undone: false }

  if (!target.history.length) {
    return { meeting: target, undone: false }
  }

  // history is sorted most-recent-first by getMeetingSchedules
  const latest = target.history[0]
  const removed = await deleteMeetingHistoryById(latest.id)
  if (!removed) {
    return { meeting: target, undone: false }
  }

  // Recompute the schedule row
  const remaining = target.history.slice(1)  // everything except the one we removed
  let newLastMeetingDate: string
  let newNextDueDate: string

  if (remaining.length > 0) {
    // Use the prior latest entry
    newLastMeetingDate = remaining[0].meetingDate
    newNextDueDate = calcNextDueDate(new Date(newLastMeetingDate), target.tier)
      .toISOString().split("T")[0]
  } else {
    // No prior history → revert to bootstrap (staggered initial due date)
    const bootstrap = buildInitialSchedule(target.tier, target.buyerName)
    newLastMeetingDate = bootstrap.lastMeetingDate ?? ""
    newNextDueDate = bootstrap.nextDueDate
  }

  await updateMeetingScheduleRow(params.meetingId, {
    lastMeetingDate: newLastMeetingDate,
    nextDueDate:     newNextDueDate,
    meetingRemarks:  `Undone by ${params.undoneBy} on ${new Date().toISOString().split("T")[0]}`,
    updatedAt:       new Date().toISOString(),
  })

  // Bust the memo so the NEXT call (e.g. dashboard refresh) reads fresh data.
  invalidateMemo("meeting_schedules", "others_buyers")

  // Fast path: build the updated MeetingSchedule locally
  const { getMeetingDisplayStatus, daysUntil } = await import("./8020-utils")
  const nextDueDateObj = new Date(newNextDueDate)
  const updatedMeeting: MeetingSchedule = {
    ...target,
    lastMeetingDate: newLastMeetingDate || null,
    nextDueDate:     newNextDueDate,
    displayStatus:   getMeetingDisplayStatus(nextDueDateObj),
    daysRemaining:   daysUntil(nextDueDateObj),
    history:         remaining,
    updatedAt:       new Date().toISOString(),
  }
  return {
    meeting:          updatedMeeting,
    undone:           true,
    removedHistoryId: removed.id,
  }
}

// ─── Reschedule Meeting ───────────────────────────────────────────────────────

/**
 * Reschedule a meeting: update the Next Due Date + log a RESCHEDULED history entry.
 * Does NOT mark the meeting as completed — just moves the due date forward.
 */
export async function rescheduleMeeting(params: {
  meetingId:  string
  newDueDate: string   // YYYY-MM-DD
  remarks?:   string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    // Fetch meeting info (needed for buyer name / country in history)
    const all    = await getMeetingSchedules()
    const target = all.find((m) => m.id === params.meetingId)
    if (!target) return { ok: false, error: "Meeting not found" }

    const notes = [
      params.remarks ? params.remarks : "",
      `(Previous due date: ${target.nextDueDate})`,
    ].filter(Boolean).join(" — ")

    // 1. Update the schedule row
    const ok = await updateMeetingScheduleRow(params.meetingId, {
      nextDueDate:    params.newDueDate,
      meetingRemarks: params.remarks ?? target.meetingRemarks,
      updatedAt:      nowIST(),
    })
    if (!ok) return { ok: false, error: "Row update failed" }

    // 2. Append a RESCHEDULED entry to history (audit trail)
    await addMeetingHistoryEntry({
      meetingId:   params.meetingId,
      buyerName:   target.buyerName,
      country:     target.country,
      meetingDate: params.newDueDate,       // new due date stored as "meeting date"
      completedBy: "Rescheduled via email",
      outcome:     "RESCHEDULED",
      notes,
    })

    invalidateMemo("meeting_schedules", "others_buyers")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" }
  }
}

// ─── Magic-Link Done Tokens ───────────────────────────────────────────────────
// Stored in MEETING_DONE_TOKENS sheet (auto-created in SALES_TRACKING).
// Columns: TOKEN | MEETING_ID | BUYER_NAME | EXPIRES_AT | USED | CREATED_AT

const TOKEN_HEADERS = ["TOKEN", "MEETING_ID", "BUYER_NAME", "EXPIRES_AT", "USED", "CREATED_AT"]
// Tokens never expire — permanent magic links

async function ensureTokenSheet() {
  await ensureSheetExists(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_DONE_TOKENS, TOKEN_HEADERS)
}

/** Generate a secure random token (hex string) */
function generateToken(): string {
  // Works in both Node.js (crypto.randomUUID) and edge runtimes
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "")
  }
  // Fallback: Math.random based (less secure, but functional)
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("")
}

/**
 * Compute a deterministic HMAC-SHA256 token for a meeting ID.
 * Same meetingId always produces the same token — no sheet needed.
 */
function computeHmacToken(meetingId: string): string {
  // DO NOT change the fallback order — existing email links will break if secret changes
  const secret =
    process.env.MEETING_TOKEN_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.AUTH_SECRET ??
    "shazia-rice-token-secret-2024"
  return createHmac("sha256", secret).update(meetingId).digest("hex")
}

/**
 * Create a done-token for a meeting.
 * Returns a deterministic HMAC token — permanent, no sheet write needed.
 */
export async function createDoneToken(meetingId: string, _buyerName?: string): Promise<string> {
  return computeHmacToken(meetingId)
}

/**
 * Validate a done token. Returns the meetingId if valid, null otherwise.
 *
 * If meetingId is supplied (preferred): verifies via HMAC instantly — permanent, no sheet access.
 * If meetingId is omitted: falls back to legacy sheet lookup (for old tokens).
 */
export async function validateDoneToken(token: string, meetingId?: string): Promise<string | null> {
  // Fast HMAC path — always works for tokens generated by createDoneToken
  if (meetingId) {
    if (token === computeHmacToken(meetingId)) return meetingId
  }

  // Legacy fallback: check old random tokens stored in the sheet
  try {
    await ensureTokenSheet()
    const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_DONE_TOKENS)
    if (rows.length >= 2) {
      const [header, ...data] = rows
      const hm  = buildHeaderMap(header)
      const row = data.find((r) => getCell(r, hm, "TOKEN") === token)
      if (row) return getCell(row, hm, "MEETING_ID") || null
    }
  } catch { /* sheet unavailable — HMAC is the primary path anyway */ }

  return null
}

/**
 * Mark a token as used (after successful meeting completion).
 */
export async function consumeDoneToken(token: string): Promise<void> {
  await ensureTokenSheet()
  const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_DONE_TOKENS)
  if (rows.length < 2) return
  const [header, ...data] = rows
  const hm = buildHeaderMap(header)
  const rowIdx = data.findIndex((r) => getCell(r, hm, "TOKEN") === token)
  if (rowIdx === -1) return
  // Update USED column (col index 4, 0-based)
  const usedColIdx = hm["USED"] ?? 4
  const fullRow = [...(data[rowIdx] ?? [])]
  while (fullRow.length <= usedColIdx) fullRow.push("")
  fullRow[usedColIdx] = "true"
  await updateSheetRow(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_DONE_TOKENS, rowIdx + 2, fullRow)
  invalidateSheetCache(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_DONE_TOKENS)
}

/**
 * Clear ALL tokens from the sheet and regenerate fresh ones for every
 * active meeting. Returns a map of meetingId → new token.
 */
export async function regenAllDoneTokens(): Promise<Map<string, string>> {
  await ensureTokenSheet()

  // Load all active meetings
  const meetings  = await getMeetingSchedules()
  const result    = new Map<string, string>()
  const rows: string[][] = []
  const createdAt = new Date().toISOString()

  for (const m of meetings) {
    const token = computeHmacToken(m.id)
    rows.push([token, m.id, m.buyerName, "", "false", createdAt])
    result.set(m.id, token)
  }

  // Replace ALL existing token rows with fresh ones (keeps header at row 1)
  await overwriteSheetRows(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_DONE_TOKENS, rows)
  invalidateSheetCache(SHEETS.SALES_TRACKING, SHEET_NAMES.MEETING_DONE_TOKENS)

  return result
}
