/**
 * GET /api/debug/data-health
 *
 * Diagnostic endpoint. Returns the actual state of every data source the
 * performance pages depend on. Use when the dashboard shows empty data —
 * the response tells you WHERE the chain breaks.
 *
 * Returns: { sheets: [...], sources: { ... }, currentFY, sample rows for each. }
 */

import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import {
  get8020Buyers,
  getTargetRecords,
  getPIRecords,
  getBuyerMaster,
  getMeetingSchedules,
  filterPIByFY,
  invalidateAllMemo,
} from "@/lib/data"
import { listSheetTabs, findExistingTab, SHEETS, SHEET_NAMES, readSheet } from "@/lib/sheets"
import { getCurrentFY, getPreviousFY } from "@/lib/fy-utils"

export const dynamic = "force-dynamic"

interface SourceCheck {
  name: string
  count: number
  ok: boolean
  detail?: string
  sample?: unknown[]
  error?: string
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `${label}: ${e.message}` : String(e) }
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // ?force=1 → clear ALL caches and re-fetch from Google Sheets fresh
  const url = new URL(req.url)
  if (url.searchParams.get("force") === "1") {
    invalidateAllMemo()
    console.log("[data-health] All memo caches cleared — forcing fresh fetch")
  }

  const currentFY  = getCurrentFY()
  const previousFY = getPreviousFY(currentFY)
  const sources: SourceCheck[] = []

  // ── 1. Spreadsheet tab discovery ─────────────────────────────────────────
  const tabsResult = await safe("listSheetTabs", () => listSheetTabs(SHEETS.SALES_TRACKING))
  const tabs = tabsResult.ok ? tabsResult.value : []
  const tabsError = tabsResult.ok ? undefined : tabsResult.error

  // ── 2. 80/20 buyers tab + column detection ──────────────────────────────
  const eightyTwentyTabResult = await safe("findExistingTab", () =>
    findExistingTab(SHEETS.EIGHTY_TWENTY, [
      SHEET_NAMES.EIGHTY_TWENTY_BUYERS, "80/20 Buyers", "80/20 buyers", "80/20",
      "80-20 buyers", "8020 buyers", "EIGHTY_TWENTY_BUYERS",
    ])
  )
  const eightyTwentyTab = eightyTwentyTabResult.ok ? eightyTwentyTabResult.value : null

  let eightyTwentyHeaders: string[] = []
  let eightyTwentyRowCount = 0
  if (eightyTwentyTab) {
    const rawResult = await safe("readSheet 80/20", () => readSheet(SHEETS.EIGHTY_TWENTY, eightyTwentyTab))
    if (rawResult.ok && rawResult.value.length) {
      eightyTwentyHeaders = rawResult.value[0].map((h) => h.trim())
      eightyTwentyRowCount = rawResult.value.length - 1
    }
  }

  const buyers8020Result = await safe("get8020Buyers", () => get8020Buyers())
  const buyers8020 = buyers8020Result.ok ? buyers8020Result.value : []
  sources.push({
    name:   "get8020Buyers()",
    count:  buyers8020.length,
    ok:     buyers8020.length > 0,
    detail: !buyers8020Result.ok
      ? `ERROR: ${buyers8020Result.error}`
      : !eightyTwentyTab
        ? `Tab not found. Looked for '${SHEET_NAMES.EIGHTY_TWENTY_BUYERS}'. Existing tabs: ${tabs.join(", ") || "(none)"}`
        : buyers8020.length === 0
          ? `Tab "${eightyTwentyTab}" found with ${eightyTwentyRowCount} data rows. Headers detected: ${eightyTwentyHeaders.join(" | ")}. No buyers parsed — check that the Buyer Name column matches one of: 'Buyer Company Name', 'Buyer Name', 'Buyer', 'Company Name', 'Company'.`
          : `Tab "${eightyTwentyTab}" → ${buyers8020.length} buyers (${eightyTwentyRowCount} rows in sheet). Tiers: ${["TIER1","TIER2","TIER3","OTHERS"].map(t => `${t}=${buyers8020.filter(b=>b.tier===t).length}`).join(", ")}. Targets > 0: ${buyers8020.filter(b=>b.annualTarget>0).length}.`,
    sample: buyers8020.slice(0, 3).map((b) => ({
      name:           b.buyerName,
      country:        b.country,
      tier:           b.tier,
      annualTarget:   b.annualTarget,
      target:         b.targetContainers,
      responsible:    b.responsiblePerson,
      coordinator:    b.salesCoordinator,
      responsibleEmail: b.responsibleEmail,
    })),
  })

  // ── 3. Target records ────────────────────────────────────────────────────
  const targetsAllResult     = await safe("getTargetRecords", () => getTargetRecords())
  const targetsCurrentResult = await safe("getTargetRecords(current)", () => getTargetRecords(currentFY))
  const targetsAll     = targetsAllResult.ok     ? targetsAllResult.value     : []
  const targetsCurrent = targetsCurrentResult.ok ? targetsCurrentResult.value : []
  const targetsByFY: Record<string, number> = {}
  for (const t of targetsAll) targetsByFY[t.financialYear] = (targetsByFY[t.financialYear] ?? 0) + 1

  sources.push({
    name:   `getTargetRecords(fy="${currentFY}")`,
    count:  targetsCurrent.length,
    ok:     targetsCurrent.length > 0,
    detail: !targetsCurrentResult.ok
      ? `ERROR: ${targetsCurrentResult.error}`
      : `Total across all FYs: ${targetsAll.length}. By FY: ${Object.entries(targetsByFY).map(([fy, n]) => `${fy}=${n}`).join(", ") || "(empty)"}. For current FY "${currentFY}": ${targetsCurrent.length} matches.${
          targetsCurrent.length === 0 && targetsAll.length > 0
            ? ` ⚠️ Targets exist but NONE match current FY — this is why /performance is empty. The data is from a previous FY.`
            : ""
        }`,
    sample: targetsCurrent.slice(0, 3),
  })

  // ── 4. PI records ────────────────────────────────────────────────────────
  const piResult = await safe("getPIRecords", () => getPIRecords())
  const allPI = piResult.ok ? piResult.value : []
  const piCurrent  = piResult.ok ? filterPIByFY(allPI, currentFY)  : []
  const piPrevious = piResult.ok ? filterPIByFY(allPI, previousFY) : []
  // FY distribution
  const piByFY: Record<string, number> = {}
  for (const r of allPI) {
    const yr = r.piDate?.slice(0, 4)
    if (!yr) continue
    const mo = Number(r.piDate.slice(5, 7))
    const fyStart = mo >= 4 ? Number(yr) : Number(yr) - 1
    const fy = `${fyStart}-${String(fyStart + 1).slice(-2)}`
    piByFY[fy] = (piByFY[fy] ?? 0) + 1
  }
  sources.push({
    name:   "getPIRecords()",
    count:  allPI.length,
    ok:     allPI.length > 0,
    detail: !piResult.ok
      ? `ERROR: ${piResult.error}`
      : `Total PI rows: ${allPI.length}. By FY: ${Object.entries(piByFY).sort().map(([fy, n]) => `${fy}=${n}`).join(", ") || "(empty)"}. Current FY (${currentFY}): ${piCurrent.length}. Previous FY (${previousFY}): ${piPrevious.length}.`,
    sample: piCurrent.slice(0, 2).map((r) => ({
      buyer: r.buyerCompanyName, country: r.countries, sp: r.salesPerson,
      piDate: r.piDate, containers: r.totalContainers,
    })),
  })

  // ── 5. Buyer Master ──────────────────────────────────────────────────────
  const bmResult = await safe("getBuyerMaster", () => getBuyerMaster())
  const buyerMaster = bmResult.ok ? bmResult.value : []
  sources.push({
    name:   "getBuyerMaster()",
    count:  buyerMaster.length,
    ok:     buyerMaster.length > 0,
    detail: !bmResult.ok ? `ERROR: ${bmResult.error}` : `${buyerMaster.length} buyer master rows.`,
    sample: buyerMaster.slice(0, 2),
  })

  // ── 6. Meeting Schedules (drives 80/20 + Meeting Reports) ────────────────
  const meetingsResult = await safe("getMeetingSchedules", () => getMeetingSchedules())
  const meetings = meetingsResult.ok ? meetingsResult.value : []
  sources.push({
    name:   "getMeetingSchedules()",
    count:  meetings.length,
    ok:     meetings.length > 0,
    detail: !meetingsResult.ok
      ? `ERROR: ${meetingsResult.error}`
      : `${meetings.length} monitored buyers (T1/T2/T3 only). Tiers: ${["TIER1","TIER2","TIER3"].map(t => `${t}=${meetings.filter(m=>m.tier===t).length}`).join(", ")}. Overdue: ${meetings.filter(m => m.displayStatus === "OVERDUE").length}, DueSoon: ${meetings.filter(m => m.displayStatus === "DUE_SOON").length}. Total history entries across all buyers: ${meetings.reduce((s, m) => s + m.history.length, 0)}.`,
    sample: meetings.slice(0, 2).map((m) => ({
      name: m.buyerName, country: m.country, tier: m.tier,
      target: m.target, actual: m.actual,
      nextDue: m.nextDueDate, status: m.displayStatus,
      historyCount: m.history.length,
    })),
  })

  // ── Top-level summary / verdict ──────────────────────────────────────────
  const verdict: string[] = []
  if (tabsError) verdict.push(`❌ Cannot read spreadsheet metadata: ${tabsError}`)
  if (!eightyTwentyTab) verdict.push(`❌ "80/20 Buyers" tab not found. Available tabs: ${tabs.join(", ") || "(none)"}`)
  if (buyers8020.length === 0 && eightyTwentyTab) verdict.push(`❌ 80/20 sheet has ${eightyTwentyRowCount} rows but 0 parsed as buyers. Likely a column-name mismatch — check Headers above.`)
  if (buyers8020.length > 0 && targetsCurrent.length === 0) verdict.push(`⚠️ 80/20 has buyers but getTargetRecords returns 0 for FY ${currentFY}. Memo cache may be stale (wait 5 min or restart).`)
  if (allPI.length > 0 && piCurrent.length === 0) verdict.push(`⚠️ PI data exists (${allPI.length} rows) but NONE are in current FY ${currentFY}. All actuals will be 0 — but rows should still render. Latest PI is from FY ${Object.keys(piByFY).sort().pop() || "?"}.`)
  if (verdict.length === 0) verdict.push(`✅ All data sources healthy. If performance pages still look empty, check browser network tab for API errors.`)

  return NextResponse.json({
    currentFY,
    previousFY,
    serverTime: new Date().toISOString(),
    spreadsheetTabs: tabs,
    eightyTwentyTab,
    eightyTwentyHeaders,
    eightyTwentyRowCount,
    verdict,
    sources,
  })
}
