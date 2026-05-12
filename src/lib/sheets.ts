import { google } from "googleapis"

// ─── Sheet IDs ────────────────────────────────────────────────────────────────

export const SHEETS = {
  SALES_TRACKING:  process.env.SALES_TRACKING_SHEET_ID!,
  BUSINESS_PLAN:   process.env.BUSINESS_PLAN_SHEET_ID!,
  // Optional — populated after canonical buyer map sheet is created
  CANONICAL_MAP:   process.env.CANONICAL_BUYER_MAP_SHEET_ID || process.env.SALES_TRACKING_SHEET_ID || "",
  // 80/20 key account sheet — separate spreadsheet or falls back to SALES_TRACKING
  EIGHTY_TWENTY:   process.env.EIGHTY_TWENTY_SHEET_ID || process.env.SALES_TRACKING_SHEET_ID!,
}

export const SHEET_NAMES = {
  PI_BACKEND_MASTER:      "PI_BACKEND_MASTER",
  BUYER_MASTER:           "BUYER_MASTER",
  TARGET_MASTER:          "TARGET_MASTER",
  DASHBOARD_TRACKER:      "DASHBOARD_TRACKER",
  REMINDER_LOG:           "REMINDER_LOG",
  WEEKLY_REVIEW:          "WEEKLY_REVIEW",
  COUNTRY_TARGET:         "COUNTRY TARGET 26",
  BUSINESS_PLAN_BACKEND:  "BUSINESS PLAN BACKEND SHEET",
  // Canonical buyer map (separate Google Sheet)
  CANONICAL_BUYER_MASTER: "CANONICAL_BUYER_MASTER",
  BUYER_ALIAS_MAP:        "BUYER_ALIAS_MAP",
  BRAND_CATEGORIES:       "BRAND_CATEGORIES",
  // Execution layer (in SALES_TRACKING sheet)
  OWNERSHIP_RECORDS:      "OWNERSHIP_RECORDS",
  LEAD_ACTIVITIES:        "LEAD_ACTIVITIES",
  TARGET_AUDIT:           "TARGET_AUDIT",
  BUYER_TASKS:            "Task Allocation",
  // Country strategy (in BUSINESS_PLAN sheet)
  COUNTRY_STRATEGIES:     "COUNTRY_STRATEGIES",
  TRAVEL_PLANS:           "TRAVEL_PLANS",
  CREDENTIALS:            "Credential",
  // 80/20 Key Account buyers (note: trailing space is intentional — matches sheet tab name)
  EIGHTY_TWENTY_BUYERS:   "80/20 buyers ",
  // 80/20 Meeting tracking (auto-created tabs in SALES_TRACKING by default)
  MEETING_SCHEDULE_8020:  "MEETING_SCHEDULE_8020",
  MEETING_HISTORY_8020:   "MEETING_HISTORY_8020",
  ALERT_LOG_8020:         "ALERT_LOG_8020",
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
}

function getSheetsClient() {
  const auth = getAuth()
  return google.sheets({ version: "v4", auth })
}

// ─── Cache Logic ──────────────────────────────────────────────────────────────
// Two TTLs: 5 min for actual data, 10 sec for empty results (so a transient
// Sheets API blip doesn't lock the entire app into "0 rows" for 5 minutes).
const CACHE_TTL_MS          = 30 * 60 * 1000 // 30 minutes (sheets rarely change mid-day)
const CACHE_NEGATIVE_TTL_MS = 10 * 1000      // 10 seconds for empty / error results
const cache = new Map<string, { data: string[][]; timestamp: number; ttl: number }>()

function getCachedData(key: string): string[][] | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCachedData(key: string, data: string[][]) {
  const ttl = data.length === 0 ? CACHE_NEGATIVE_TTL_MS : CACHE_TTL_MS
  cache.set(key, { data, timestamp: Date.now(), ttl })
}

/** Invalidate cached reads for a specific sheet tab (call after writes) */
export function invalidateSheetCache(spreadsheetId: string, sheetName: string): void {
  const prefix = `${spreadsheetId}:${sheetName}:`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

// ─── Tab discovery + auto-bootstrap ──────────────────────────────────────────

const tabListCache = new Map<string, { tabs: string[]; timestamp: number }>()
const ensuredTabs  = new Set<string>()   // module-level memo: tabs we've verified/created

/** Returns all tab names in a spreadsheet (cached for 60 seconds). */
export async function listSheetTabs(spreadsheetId: string): Promise<string[]> {
  const cached = tabListCache.get(spreadsheetId)
  if (cached && Date.now() - cached.timestamp < 60_000) return cached.tabs

  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  })
  const tabs = (res.data.sheets ?? [])
    .map((s) => s.properties?.title ?? "")
    .filter(Boolean)
  tabListCache.set(spreadsheetId, { tabs, timestamp: Date.now() })
  return tabs
}

/**
 * Ensures a tab exists in the spreadsheet. If it doesn't, creates it and
 * writes the given header row. Idempotent + memoized.
 */
export async function ensureSheetExists(
  spreadsheetId: string,
  sheetName: string,
  headers: string[]
): Promise<void> {
  const key = `${spreadsheetId}:${sheetName}`
  if (ensuredTabs.has(key)) return

  const tabs = await listSheetTabs(spreadsheetId)
  if (tabs.includes(sheetName)) {
    ensuredTabs.add(key)
    return
  }

  const sheets = getSheetsClient()
  // 1. Add the tab
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  })
  // 2. Write headers as row 1, bold
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] },
  })

  // Invalidate the tab-list cache so subsequent calls see the new tab
  tabListCache.delete(spreadsheetId)
  ensuredTabs.add(key)
  console.log(`[sheets] auto-created tab "${sheetName}"`)
}

/**
 * Find an existing tab matching any of the candidate names (case-insensitive,
 * whitespace-insensitive). Returns the actual name as it appears, or null.
 */
export async function findExistingTab(
  spreadsheetId: string,
  candidates: string[]
): Promise<string | null> {
  const tabs = await listSheetTabs(spreadsheetId)
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "")
  for (const c of candidates) {
    const target = norm(c)
    const found = tabs.find((t) => norm(t) === target)
    if (found) return found
  }
  return null
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function readSheet(
  spreadsheetId: string,
  sheetName: string,
  range?: string
): Promise<string[][]> {
  const cacheKey = `${spreadsheetId}:${sheetName}:${range || "FULL"}`
  const cached = getCachedData(cacheKey)
  if (cached) return cached

  const sheets = getSheetsClient()
  const fullRange = range ? `${sheetName}!${range}` : sheetName
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: fullRange,
  })
  
  const values = (res.data.values as string[][]) ?? []
  setCachedData(cacheKey, values)
  return values
}

// ─── Append ───────────────────────────────────────────────────────────────────

export async function appendToSheet(
  spreadsheetId: string,
  sheetName: string,
  values: (string | number | null)[][]
): Promise<void> {
  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: sheetName,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  })
}

// ─── Update (single row by matching key) ─────────────────────────────────────

export async function updateSheetRow(
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number,   // 1-based, including header
  values: (string | number | null)[]
): Promise<void> {
  const sheets = getSheetsClient()
  const range = `${sheetName}!A${rowIndex}:Z${rowIndex}`
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  })
}

// ─── Delete (row by 1-based index) ───────────────────────────────────────────

/**
 * Deletes a single row from the sheet (1-based, header is row 1). Uses the
 * batchUpdate deleteDimension request so all subsequent rows shift up.
 */
export async function deleteSheetRow(
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number,   // 1-based, including header
): Promise<void> {
  const sheets = getSheetsClient()
  // Need the numeric sheetId for batchUpdate.deleteDimension
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  })
  const sheet = (meta.data.sheets ?? []).find(
    (s) => s.properties?.title === sheetName
  )
  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) {
    throw new Error(`Sheet tab not found: ${sheetName}`)
  }
  const sheetId = sheet.properties.sheetId!

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowIndex - 1, // API is 0-based, exclusive end
            endIndex:   rowIndex,
          },
        },
      }],
    },
  })
}

// ─── Find row index by key column ────────────────────────────────────────────

/**
 * Finds the 1-based row index in `sheetName` where the cell in `keyColumn`
 * matches `keyValue`. Returns -1 if not found. Header is row 1.
 */
export async function findRowIndexByKey(
  spreadsheetId: string,
  sheetName: string,
  keyColumn: string,
  keyValue: string
): Promise<number> {
  const rows = await readSheet(spreadsheetId, sheetName)
  if (!rows.length) return -1
  const [headerRow, ...dataRows] = rows
  const colIdx = headerRow.findIndex((h) => h.trim() === keyColumn)
  if (colIdx === -1) return -1
  const idx = dataRows.findIndex((r) => (r[colIdx] ?? "").trim() === keyValue)
  return idx === -1 ? -1 : idx + 2  // +1 for header, +1 for 1-based
}

// ─── Header → Index Map ───────────────────────────────────────────────────────

export function buildHeaderMap(headers: string[]): Record<string, number> {
  return headers.reduce(
    (acc, header, i) => {
      acc[header.trim()] = i
      return acc
    },
    {} as Record<string, number>
  )
}

export function getCell(
  row: string[],
  headerMap: Record<string, number>,
  key: string
): string {
  const idx = headerMap[key]
  if (idx === undefined) return ""
  return row[idx]?.trim() ?? ""
}

export function getCellNum(
  row: string[],
  headerMap: Record<string, number>,
  key: string
): number {
  return parseFloat(getCell(row, headerMap, key)) || 0
}
