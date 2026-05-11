/**
 * generate-canonical-buyer-template.ts
 *
 * Reads the Business Plan Backend sheet (top 50 buyers by TARGET CONTAINER 2026)
 * and produces two CSV files:
 *
 *   out/CANONICAL_BUYER_MASTER.csv  — one row per unique buyer
 *   out/BUYER_ALIAS_MAP.csv         — one row per name variant found in PI_BACKEND_MASTER
 *
 * Usage:
 *   npx tsx scripts/generate-canonical-buyer-template.ts
 *
 * Requires:  GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY + both sheet IDs in .env.local
 */

import * as fs   from "fs"
import * as path from "path"
import { google } from "googleapis"
import * as dotenv from "dotenv"

dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

// ── env ─────────────────────────────────────────────────────────────────────
const SA_EMAIL   = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!
const SA_KEY     = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n")
const BP_SHEET   = process.env.BUSINESS_PLAN_SHEET_ID!
const ST_SHEET   = process.env.SALES_TRACKING_SHEET_ID!

if (!SA_EMAIL || !SA_KEY || !BP_SHEET || !ST_SHEET) {
  console.error("Missing env vars — check .env.local")
  process.exit(1)
}

// ── Google Sheets auth ───────────────────────────────────────────────────────
const auth = new google.auth.JWT({
  email: SA_EMAIL,
  key:   SA_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
})
const sheets = google.sheets({ version: "v4", auth })

async function readSheet(spreadsheetId: string, range: string): Promise<string[][]> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range })
  return (res.data.values ?? []) as string[][]
}

// ── helpers ──────────────────────────────────────────────────────────────────
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40)
}

function csvRow(cells: (string | number)[]): string {
  return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Reading Business Plan Backend sheet…")

  // ── 1. Read Business Plan Backend ─────────────────────────────────────────
  const [bpRows, bmRows, tgRows] = await Promise.all([
    readSheet(BP_SHEET, "BUSINESS PLAN BACKEND SHEET!A1:Z500"),
    readSheet(ST_SHEET, "BUYER_MASTER!A1:Z2000"),
    readSheet(ST_SHEET, "TARGET_MASTER!A1:Z2000"),
  ])
  if (!bpRows.length) { console.error("Empty BP sheet"); process.exit(1) }

  // Build quick lookup: buyerName → { buyerCode, salesPerson } from BUYER_MASTER
  const bmHeader = bmRows[0] ?? []
  const bmH = (n: string) => bmHeader.findIndex((h: string) => h.trim().toLowerCase() === n.toLowerCase())
  const bmNameCol = bmH("Buyer Company Name"); const bmCodeCol = bmH("Buyer Code"); const bmSPCol = bmH("Sales Person")
  const buyerLookup = new Map<string, { code: string; sp: string }>()
  for (const r of bmRows.slice(1)) {
    const n = r[bmNameCol]?.trim().toLowerCase()
    if (n) buyerLookup.set(n, { code: r[bmCodeCol]?.trim() ?? "", sp: r[bmSPCol]?.trim() ?? "" })
  }

  // Also build from TARGET_MASTER (same buyer may appear there with salesPerson)
  const tgHeader = tgRows[0] ?? []
  const tgH = (n: string) => tgHeader.findIndex((h: string) => h.trim().toLowerCase() === n.toLowerCase())
  const tgNameCol = tgH("Buyer Company Name"); const tgSPCol = tgH("Sales Person")
  const targetLookup = new Map<string, string>()
  for (const r of tgRows.slice(1)) {
    const n = r[tgNameCol]?.trim().toLowerCase()
    if (n && r[tgSPCol]?.trim()) targetLookup.set(n, r[tgSPCol].trim())
  }

  const bpHeader = bpRows[0]
  const col = (name: string) => bpHeader.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
  // fuzzy col find: header contains the keyword
  const colFuzzy = (keyword: string) => bpHeader.findIndex((h) => h.trim().toLowerCase().includes(keyword.toLowerCase()))

  const buyerNameCol   = col("Buyer Name")
  const buyerCodeCol   = colFuzzy("buyer code")   // may not exist in BP sheet
  const countryCol     = col("COUNTRY")
  const targetCtrsCol  = colFuzzy("target container")
  const salesPersonCol = colFuzzy("sales person")

  console.log(`BP header cols found: buyerName=${buyerNameCol}, buyerCode=${buyerCodeCol}, country=${countryCol}, target=${targetCtrsCol}, sp=${salesPersonCol}`)
  console.log("BP headers:", bpHeader.join(" | "))

  interface BPBuyer {
    canonicalBuyerCode: string
    canonicalBuyerName: string
    buyerCode:          string
    country:            string
    targetFY2026:       number
    primaryOwner:       string
  }

  const buyers: BPBuyer[] = bpRows
    .slice(1)
    .filter((r) => r[buyerNameCol]?.trim())
    .map((r) => {
      const name    = r[buyerNameCol]?.trim() ?? ""
      const nameLow = name.toLowerCase()
      const bm      = buyerLookup.get(nameLow)
      const spFromTgt = targetLookup.get(nameLow)
      return {
        canonicalBuyerName: name,
        buyerCode:          buyerCodeCol >= 0 ? (r[buyerCodeCol]?.trim() ?? "") : (bm?.code ?? ""),
        country:            r[countryCol]?.trim()    ?? "",
        targetFY2026:       targetCtrsCol >= 0 ? (Number(r[targetCtrsCol]) || 0) : 0,
        primaryOwner:       salesPersonCol >= 0
          ? (r[salesPersonCol]?.trim() || bm?.sp || spFromTgt || "")
          : (bm?.sp || spFromTgt || ""),
        canonicalBuyerCode: "",
      }
    })
    .sort((a, b) => b.targetFY2026 - a.targetFY2026)
    .slice(0, 50)

  // Generate stable canonical codes
  const seen = new Map<string, number>()
  for (const b of buyers) {
    const base = `CB_${slug(b.canonicalBuyerName)}`
    const n    = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    b.canonicalBuyerCode = n === 1 ? base : `${base}_${n}`
  }

  console.log(`Top ${buyers.length} buyers extracted from Business Plan`)

  // ── 2. Read PI_BACKEND_MASTER for alias detection ─────────────────────────
  console.log("Reading PI_BACKEND_MASTER for alias variants…")
  const piRows = await readSheet(ST_SHEET, "PI_BACKEND_MASTER!A1:Z5000")
  const piHeader = piRows[0]
  const piBuyerCol  = piHeader.findIndex((h) => /buyer.*company|company.*name/i.test(h))
  const piBCodeCol  = piHeader.findIndex((h) => /buyer.*code/i.test(h))

  console.log(`PI header: buyerName=${piBuyerCol}, buyerCode=${piBCodeCol}`)

  // Collect all unique (name, code) pairs from PI data
  const piPairs = new Map<string, string>() // name → code
  for (const r of piRows.slice(1)) {
    const n = r[piBuyerCol]?.trim()
    const c = r[piBCodeCol]?.trim()
    if (n) piPairs.set(n, c ?? "")
  }

  console.log(`${piPairs.size} unique buyer name variants found in PI data`)

  // Build alias map: for each BP canonical buyer, fuzzy-match PI names
  interface AliasRow {
    aliasName:          string
    canonicalBuyerCode: string
    buyerCode:          string
    matchConfidence:    string // HIGH / MEDIUM / UNMATCHED
    source:             string
    addedBy:            string
    addedDate:          string
  }

  const today = new Date().toISOString().split("T")[0]
  const aliasRows: AliasRow[] = []

  // Also track which PI names matched so we can add unmatched as blanks
  const matchedPINames = new Set<string>()

  for (const buyer of buyers) {
    const canonName = buyer.canonicalBuyerName.toLowerCase()

    for (const [piName, piCode] of piPairs) {
      const piLow = piName.toLowerCase()

      // HIGH match: exact same (case-insensitive)
      if (piLow === canonName) {
        aliasRows.push({
          aliasName:          piName,
          canonicalBuyerCode: buyer.canonicalBuyerCode,
          buyerCode:          piCode || buyer.buyerCode,
          matchConfidence:    "HIGH",
          source:             "PI_BACKEND_MASTER",
          addedBy:            "system",
          addedDate:          today,
        })
        matchedPINames.add(piName)
        continue
      }

      // MEDIUM match: one contains the other, or share ≥80% of words
      const canonWords = canonName.split(/\s+/).filter(Boolean)
      const piWords    = piLow.split(/\s+/).filter(Boolean)
      const shared     = canonWords.filter((w) => piWords.includes(w)).length
      const similarity = shared / Math.max(canonWords.length, piWords.length)

      if (
        piLow.includes(canonName) ||
        canonName.includes(piLow) ||
        similarity >= 0.8
      ) {
        aliasRows.push({
          aliasName:          piName,
          canonicalBuyerCode: buyer.canonicalBuyerCode,
          buyerCode:          piCode || buyer.buyerCode,
          matchConfidence:    "MEDIUM",
          source:             "PI_BACKEND_MASTER",
          addedBy:            "system",
          addedDate:          today,
        })
        matchedPINames.add(piName)
      }
    }
  }

  // Add UNMATCHED PI names so the user can manually assign them
  for (const [piName, piCode] of piPairs) {
    if (!matchedPINames.has(piName)) {
      aliasRows.push({
        aliasName:          piName,
        canonicalBuyerCode: "",   // user must fill
        buyerCode:          piCode,
        matchConfidence:    "UNMATCHED",
        source:             "PI_BACKEND_MASTER",
        addedBy:            "system",
        addedDate:          today,
      })
    }
  }

  console.log(`${aliasRows.filter((r) => r.matchConfidence === "HIGH").length} HIGH matches`)
  console.log(`${aliasRows.filter((r) => r.matchConfidence === "MEDIUM").length} MEDIUM matches`)
  console.log(`${aliasRows.filter((r) => r.matchConfidence === "UNMATCHED").length} UNMATCHED (need manual review)`)

  // ── 3. Write CSVs ─────────────────────────────────────────────────────────
  const outDir = path.resolve(__dirname, "../out")
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  // CANONICAL_BUYER_MASTER.csv
  const cbmHeader = [
    "canonicalBuyerCode","canonicalBuyerName","buyerCode","country",
    "segment","strategicRank","isKeyAccount","primaryOwner","backupOwner",
    "targetFY2026","notes"
  ]
  const cbmLines = [
    csvRow(cbmHeader),
    ...buyers.map((b, i) =>
      csvRow([
        b.canonicalBuyerCode,
        b.canonicalBuyerName,
        b.buyerCode,
        b.country,
        "EXISTING",          // user to update: STRONG_HOLD / KEY_ACCOUNT / GROWTH / RISK / NEW_OPP
        i + 1,               // strategicRank by target desc
        i < 10 ? "TRUE" : "FALSE",  // top 10 default key account
        b.primaryOwner,
        "",                  // backupOwner — user to fill
        b.targetFY2026,
        "",                  // notes
      ])
    ),
  ]
  fs.writeFileSync(path.join(outDir, "CANONICAL_BUYER_MASTER.csv"), cbmLines.join("\n"), "utf8")
  console.log(`✅ Written: out/CANONICAL_BUYER_MASTER.csv  (${buyers.length} rows)`)

  // BUYER_ALIAS_MAP.csv
  const bamHeader = [
    "aliasName","canonicalBuyerCode","buyerCode","matchConfidence","source","addedBy","addedDate"
  ]
  const bamLines = [
    csvRow(bamHeader),
    ...aliasRows.map((r) =>
      csvRow([
        r.aliasName, r.canonicalBuyerCode, r.buyerCode,
        r.matchConfidence, r.source, r.addedBy, r.addedDate,
      ])
    ),
  ]
  fs.writeFileSync(path.join(outDir, "BUYER_ALIAS_MAP.csv"), bamLines.join("\n"), "utf8")
  console.log(`✅ Written: out/BUYER_ALIAS_MAP.csv  (${aliasRows.length} rows)`)

  console.log("\nNext steps:")
  console.log("1. Create a new Google Sheet called 'Buyer Canonical Map'")
  console.log("2. Import out/CANONICAL_BUYER_MASTER.csv as the first tab (name it CANONICAL_BUYER_MASTER)")
  console.log("3. Import out/BUYER_ALIAS_MAP.csv as the second tab (name it BUYER_ALIAS_MAP)")
  console.log("4. Review MEDIUM matches and confirm/correct canonicalBuyerCode")
  console.log("5. Fill in UNMATCHED rows by searching the canonical buyer name")
  console.log("6. Update 'segment' column in CANONICAL_BUYER_MASTER per your strategy")
  console.log("7. Share the new sheet with the service account (editor access)")
  console.log(`   Service account: ${SA_EMAIL}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
