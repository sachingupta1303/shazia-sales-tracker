import { google } from "googleapis"

// ─── Sheet IDs ────────────────────────────────────────────────────────────────

export const SHEETS = {
  SALES_TRACKING: process.env.SALES_TRACKING_SHEET_ID!,
  BUSINESS_PLAN:  process.env.BUSINESS_PLAN_SHEET_ID!,
  // Optional — populated after canonical buyer map sheet is created
  CANONICAL_MAP:  process.env.CANONICAL_BUYER_MAP_SHEET_ID || process.env.SALES_TRACKING_SHEET_ID || "",
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
const CACHE_TTL_MS = 60 * 1000 // 60 seconds
const cache = new Map<string, { data: string[][]; timestamp: number }>()

function getCachedData(key: string): string[][] | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCachedData(key: string, data: string[][]) {
  cache.set(key, { data, timestamp: Date.now() })
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
