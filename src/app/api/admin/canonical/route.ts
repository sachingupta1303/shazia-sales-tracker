/**
 * Canonical Buyer Map admin API.
 *
 * GET   /api/admin/canonical          — list canonical buyers + alias entries
 * POST  /api/admin/canonical          — create new canonical buyer
 *                                       body = { buyer: CanonicalBuyer }
 * PATCH /api/admin/canonical          — map an alias → canonical
 *                                       body = { aliasName, canonicalBuyerCode, matchConfidence }
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { readSheet, buildHeaderMap, getCell, SHEETS, SHEET_NAMES } from "@/lib/sheets"
import { getCanonicalBuyers, addCanonicalBuyer, updateAliasMapping } from "@/lib/data"
import type { AppUser, CanonicalBuyer, BuyerSegment } from "@/types"

function requireManager(user: AppUser) {
  if (user.role === "SALES_PERSON") return false
  return true
}

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!requireManager(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (!SHEETS.CANONICAL_MAP) {
    return NextResponse.json({
      configured:   false,
      message:      "Set CANONICAL_BUYER_MAP_SHEET_ID in .env.local and create the sheet first.",
      canonicalBuyers: [],
      aliases:      [],
    })
  }

  const canonicalBuyers = await getCanonicalBuyers()

  // Read alias rows including UNMATCHED ones (data layer's getBuyerAliasMap drops these)
  let aliases: { aliasName: string; canonicalBuyerCode: string; buyerCode: string; matchConfidence: string }[] = []
  try {
    const rows = await readSheet(SHEETS.CANONICAL_MAP, SHEET_NAMES.BUYER_ALIAS_MAP)
    if (rows.length) {
      const [header, ...data] = rows
      const h = buildHeaderMap(header)
      aliases = data
        .filter((r) => getCell(r, h, "aliasName"))
        .map((r) => ({
          aliasName:          getCell(r, h, "aliasName"),
          canonicalBuyerCode: getCell(r, h, "canonicalBuyerCode"),
          buyerCode:          getCell(r, h, "buyerCode"),
          matchConfidence:    getCell(r, h, "matchConfidence") || "UNMATCHED",
        }))
    }
  } catch { /* sheet missing */ }

  const unmatched = aliases.filter((a) => a.matchConfidence === "UNMATCHED" || !a.canonicalBuyerCode)
  const mapped    = aliases.filter((a) => a.matchConfidence !== "UNMATCHED" && a.canonicalBuyerCode)

  return NextResponse.json({
    configured:       true,
    canonicalBuyers,
    aliases,
    unmatched,
    mapped,
    summary: {
      totalCanonical: canonicalBuyers.length,
      totalAliases:   aliases.length,
      mappedCount:    mapped.length,
      unmatchedCount: unmatched.length,
    },
  })
}

// ── POST: create canonical buyer ──────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!requireManager(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (!SHEETS.CANONICAL_MAP) {
    return NextResponse.json({ error: "Canonical sheet not configured" }, { status: 400 })
  }

  const body = await req.json() as Partial<CanonicalBuyer>
  if (!body.canonicalBuyerName) {
    return NextResponse.json({ error: "canonicalBuyerName required" }, { status: 400 })
  }

  // Generate code if not provided
  const slug = body.canonicalBuyerName
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40)
  const code = body.canonicalBuyerCode || `CB_${slug}`

  const buyer: CanonicalBuyer = {
    canonicalBuyerCode: code,
    canonicalBuyerName: body.canonicalBuyerName,
    buyerCode:          body.buyerCode ?? "",
    country:            body.country ?? "",
    segment:            (body.segment ?? "EXISTING") as BuyerSegment,
    strategicRank:      body.strategicRank ?? 999,
    isKeyAccount:       body.isKeyAccount ?? false,
    primaryOwner:       body.primaryOwner ?? "",
    backupOwner:        body.backupOwner ?? "",
    targetFY2026:       body.targetFY2026 ?? 0,
    notes:              body.notes ?? "",
  }

  await addCanonicalBuyer(buyer)
  return NextResponse.json({ ok: true, buyer })
}

// ── PATCH: map alias → canonical ──────────────────────────────────────────────
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!requireManager(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (!SHEETS.CANONICAL_MAP) {
    return NextResponse.json({ error: "Canonical sheet not configured" }, { status: 400 })
  }

  const body = await req.json() as {
    aliasName:          string
    canonicalBuyerCode: string
    matchConfidence?:   "HIGH" | "MEDIUM"
  }
  if (!body.aliasName || !body.canonicalBuyerCode) {
    return NextResponse.json({ error: "aliasName and canonicalBuyerCode required" }, { status: 400 })
  }

  const ok = await updateAliasMapping({
    aliasName:          body.aliasName,
    canonicalBuyerCode: body.canonicalBuyerCode,
    matchConfidence:    body.matchConfidence ?? "HIGH",
  })

  return NextResponse.json({ ok })
}
