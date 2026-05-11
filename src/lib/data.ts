/**
 * Data access layer — all Google Sheets reads go through here.
 * Each function returns typed data ready for API routes or server components.
 */

import {
  readSheet,
  appendToSheet,
  updateSheetRow,
  findRowIndexByKey,
  buildHeaderMap,
  getCell,
  getCellNum,
  SHEETS,
  SHEET_NAMES,
} from "./sheets"
import { parsePIDate, getCurrentFY, getPreviousFY, isInFY } from "./fy-utils"
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

// ─── PI Backend Master ────────────────────────────────────────────────────────

export async function getPIRecords(): Promise<PIRecord[]> {
  const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.PI_BACKEND_MASTER)
  if (!rows.length) return []
  const [headerRow, ...dataRows] = rows
  const h = buildHeaderMap(headerRow)

  return dataRows
    .filter((r) => r[h["PI Number"]] && r[h["PI Date"]])
    .map((r) => ({
      piNumber:          getCell(r, h, "PI Number"),
      piDate:            getCell(r, h, "PI Date"),
      crmEmail:          getCell(r, h, "CRM Email"),
      buyerCompanyName:  getCell(r, h, "Buyer Company Name"),
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
}

// ─── Target Master ────────────────────────────────────────────────────────────

export async function getTargetRecords(fy?: FinancialYear): Promise<TargetRecord[]> {
  const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.TARGET_MASTER)
  if (!rows.length) return []
  const [headerRow, ...dataRows] = rows
  const h = buildHeaderMap(headerRow)

  const records: TargetRecord[] = dataRows
    .filter((r) => getCell(r, h, "Buyer Company Name"))
    .map((r) => ({
      buyerCompanyName:           getCell(r, h, "Buyer Company Name"),
      countries:                  getCell(r, h, "Countries"),
      salesPerson:                getCell(r, h, "Sales Person"),
      financialYear:              getCell(r, h, "Financial Year") as FinancialYear,
      previousYearContainers:     getCellNum(r, h, "Previous Year Containers"),
      currentYearTargetContainers:getCellNum(r, h, "Current Year Target Containers"),
      targetType:                 getCell(r, h, "Target Type") as "Manual" | "Auto",
      remarks:                    getCell(r, h, "Remarks"),
    }))

  return fy ? records.filter((r) => r.financialYear === fy) : records
}

// ─── Buyer Master ─────────────────────────────────────────────────────────────

export async function getBuyerMaster(): Promise<BuyerRecord[]> {
  const rows = await readSheet(SHEETS.SALES_TRACKING, SHEET_NAMES.BUYER_MASTER)
  if (!rows.length) return []
  const [headerRow, ...dataRows] = rows
  const h = buildHeaderMap(headerRow)

  return dataRows
    .filter((r) => getCell(r, h, "Buyer Company Name") || getCell(r, h, "Buyer Code"))
    .map((r) => ({
      buyerCode:        getCell(r, h, "Buyer Code"),
      buyerCompanyName: getCell(r, h, "Buyer Company Name"),
      countries:        getCell(r, h, "Countries"),
      salesPerson:      getCell(r, h, "Sales Person"),
      salesCoordinator: getCell(r, h, "Sales Cordinator"),
      tier:             getCell(r, h, "Tier") as "TIER1" | "TIER2" | "TIER3" | undefined,
      contactPerson:    getCell(r, h, "Contact Person"),
      email:            getCell(r, h, "Email"),
      phone:            getCell(r, h, "Phone"),
      paymentTerms:     getCell(r, h, "Payment Terms"),
    }))
}

// ─── Country Targets ──────────────────────────────────────────────────────────

export async function getCountryTargets(): Promise<CountryTarget[]> {
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
}

// ─── Business Plan Backend ────────────────────────────────────────────────────

export async function getBusinessPlanBuyers(): Promise<BusinessPlanBuyer[]> {
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

export async function addBuyerAlias(alias: {
  aliasName:          string
  canonicalBuyerCode: string
  buyerCode:          string
  matchConfidence:    "HIGH" | "MEDIUM" | "UNMATCHED"
  source:             string
  addedBy:            string
}): Promise<void> {
  if (!SHEETS.CANONICAL_MAP) throw new Error("CANONICAL_BUYER_MAP_SHEET_ID not configured")
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
  return true
}

// ─── Country Strategies (Dream Markets) ──────────────────────────────────────

export async function getCountryStrategies(): Promise<CountryStrategy[]> {
  try {
    const rows = await readSheet(SHEETS.BUSINESS_PLAN, SHEET_NAMES.COUNTRY_STRATEGIES)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)
    return dataRows
      .filter((r) => getCell(r, h, "country"))
      .map((r) => ({
        country:        getCell(r, h, "country").toUpperCase(),
        isDreamMarket:  getCell(r, h, "isDreamMarket").toUpperCase() === "TRUE",
        priority:       getCellNum(r, h, "priority") || undefined,
        strategicNotes: getCell(r, h, "strategicNotes") || undefined,
        updatedBy:      getCell(r, h, "updatedBy") || undefined,
        updatedAt:      getCell(r, h, "updatedAt") || undefined,
      }))
  } catch { return [] }
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

  // Google Sheets API doesn't have a simple "delete row" by index in the values collection
  // We usually clear the row or use batchUpdate to remove it.
  // For simplicity and since our findRowIndexByKey returns the index, 
  // we'll use batchUpdate to remove the row.
  const { google } = await import("googleapis")
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const sheets = google.sheets({ version: "v4", auth })
  const spreadsheetId = process.env.SALES_TRACKING_SHEET_ID!
  
  // Find the sheetId for SHEET_NAMES.BUYER_TASKS
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
  const sheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === SHEET_NAMES.BUYER_TASKS
  )
  const sheetId = sheet?.properties?.sheetId

  if (sheetId == null) return false

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowIdx - 1,
              endIndex: rowIdx,
            },
          },
        },
      ],
    },
  })
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

// ─── Canonical Buyer Map ──────────────────────────────────────────────────────

/**
 * Reads CANONICAL_BUYER_MASTER from the optional canonical map sheet.
 * Returns [] gracefully when the sheet ID is not configured yet.
 */
export async function getCanonicalBuyers(): Promise<CanonicalBuyer[]> {
  if (!SHEETS.CANONICAL_MAP) return []
  try {
    const rows = await readSheet(SHEETS.CANONICAL_MAP, SHEET_NAMES.CANONICAL_BUYER_MASTER)
    if (!rows.length) return []
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)

    return dataRows
      .filter((r) => getCell(r, h, "canonicalBuyerCode"))
      .map((r) => ({
        canonicalBuyerCode: getCell(r, h, "canonicalBuyerCode"),
        canonicalBuyerName: getCell(r, h, "Buyer Name"),
        buyerCode:          getCell(r, h, "buyerCode") || getCell(r, h, "canonicalBuyerCode"),
        country:            getCell(r, h, "Country"),
        segment:           (getCell(r, h, "Segment") || "EXISTING") as BuyerSegment,
        strategicRank:      getCellNum(r, h, "strategicRank"),
        isKeyAccount:       getCell(r, h, "isKeyAccount").toUpperCase() === "TRUE",
        primaryOwner:       getCell(r, h, "Sales Person"),
        backupOwner:        getCell(r, h, "backupOwner"),
        targetFY2026:       getCellNum(r, h, "Target Containers"),
        notes:              getCell(r, h, "Notes"),
        salesCoordinator:   getCell(r, h, "Sales Coordinator"),
      }))
  } catch {
    return []
  }
}

/**
 * Reads BUYER_ALIAS_MAP and returns a lookup map:
 *   normalised alias name → canonicalBuyerCode
 *
 * Returns empty Map when sheet ID is not configured.
 */
export async function getBuyerAliasMap(): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (!SHEETS.CANONICAL_MAP) return result
  try {
    const rows = await readSheet(SHEETS.CANONICAL_MAP, SHEET_NAMES.BUYER_ALIAS_MAP)
    if (!rows.length) return result
    const [headerRow, ...dataRows] = rows
    const h = buildHeaderMap(headerRow)

    for (const r of dataRows) {
      const alias = getCell(r, h, "aliasName")
      const code  = getCell(r, h, "canonicalBuyerCode")
      const conf  = getCell(r, h, "matchConfidence")
      // Only use HIGH and MEDIUM confirmed matches
      if (alias && code && (conf === "HIGH" || conf === "MEDIUM")) {
        result.set(alias.toLowerCase().trim(), code)
      }
    }
  } catch {
    // fall through — return empty map
  }
  return result
}

// ─── Aggregation Helpers ──────────────────────────────────────────────────────

export function filterPIByFY(records: PIRecord[], fy: FinancialYear): PIRecord[] {
  return records.filter((r) => {
    const date = parsePIDate(r.piDate)
    return isInFY(date, fy)
  })
}

export function sumContainers(records: PIRecord[]): number {
  return records.reduce((sum, r) => sum + r.totalContainers, 0)
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
