/**
 * Buyer Control admin API (Control Panel · Buyers tab).
 *
 * GET  /api/admin/buyer-control   — list 80/20 buyers with tier + matched segment/VIP
 * POST /api/admin/buyer-control   — update tier OR segment/VIP for a buyer
 *      body (tier):    { action: "tier", buyerName, country?, tier }
 *      body (segment): { action: "segment", buyerName, country?, canonicalCode?, segment, isKeyAccount }
 *
 *      body (active):  { action: "active", buyerName, country, active: boolean, reason? }
 *      body (coord):   { action: "coordinator", buyerName, country?, coordinator }
 *
 * Tier  → 80/20 buyers sheet ("Tier" column) — meeting cadence follows automatically.
 * Active → INACTIVE_BUYERS tab (inactive buyers drop out of every report).
 * Coordinator → 80/20 buyers sheet ("Sales Coordinators" + coordinator mail).
 * Segment/VIP → CANONICAL_BUYER_MASTER (creates a canonical row if none matched).
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  get8020BuyersAll, getCanonicalBuyers, getBuyerAliasMap, getInactiveBuyerKeys, isBuyerInactive,
  updateBuyer8020Tier, updateCanonicalBuyer, setBuyerActive, updateBuyer8020Coordinator,
} from "@/lib/data"
import type { AppUser, BuyerSegment, CanonicalBuyer } from "@/types"

function canAdmin(user: AppUser) {
  return user.role === "MANAGER" || user.role === "DIRECTOR"
    || user.role === "SUPER_ADMIN" || user.role === "ADMIN"
}
const normName = (s: string) => s.toLowerCase().trim()
function makeCode(name: string) {
  return "raw_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)
}

const VALID_TIERS = ["TIER1", "TIER2", "TIER3", "OTHERS"]
const VALID_SEGMENTS = [
  "VIP", "STRATEGIC", "STRONG_HOLD", "KEY_ACCOUNT", "GROWTH", "EXISTING", "RISK", "NEW_OPP",
]

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!canAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const [buyers, canonical, aliasMap, inactive] = await Promise.all([
    get8020BuyersAll(), getCanonicalBuyers(), getBuyerAliasMap(), getInactiveBuyerKeys(),
  ])

  const canonByCode = new Map(canonical.map((c) => [c.canonicalBuyerCode, c]))
  const canonByName = new Map(canonical.map((c) => [normName(c.canonicalBuyerName), c]))

  const rows = buyers.map((b) => {
    // Resolve canonical: alias map first, then exact name match
    const codeFromAlias = aliasMap.get(normName(b.buyerName))
    const canon = (codeFromAlias && canonByCode.get(codeFromAlias)) || canonByName.get(normName(b.buyerName)) || null
    return {
      buyerName:         b.buyerName,
      country:           b.country,
      tier:              b.tier,
      annualTarget:      b.annualTarget,
      responsiblePerson: b.responsiblePerson,
      canonicalCode:     canon?.canonicalBuyerCode ?? "",
      segment:          (canon?.segment ?? "EXISTING") as BuyerSegment,
      isKeyAccount:      canon?.isKeyAccount ?? false,
      salesCoordinator:  b.salesCoordinator,
      active:            !isBuyerInactive(inactive, b.buyerName, b.country),
    }
  }).sort((a, b) => b.annualTarget - a.annualTarget || a.buyerName.localeCompare(b.buyerName))

  // Coordinator names already used in the sheet (case-insensitive unique)
  const coordMap = new Map<string, string>()
  for (const b of buyers) {
    const c = (b.salesCoordinator || "").trim()
    if (c && !coordMap.has(c.toLowerCase())) coordMap.set(c.toLowerCase(), c)
  }
  const coordinators = [...coordMap.values()].sort((a, b) => a.localeCompare(b))

  return NextResponse.json({ rows, segments: VALID_SEGMENTS, tiers: VALID_TIERS, coordinators })
}

// ── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!canAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json() as {
    action:        "tier" | "segment" | "active" | "coordinator"
    active?:       boolean
    reason?:       string
    coordinator?:  string
    buyerName:     string
    country?:      string
    tier?:         "TIER1" | "TIER2" | "TIER3" | "OTHERS"
    canonicalCode?: string
    segment?:      BuyerSegment
    isKeyAccount?: boolean
  }

  if (!body.buyerName) return NextResponse.json({ error: "buyerName required" }, { status: 400 })

  // ── Tier update ──
  if (body.action === "tier") {
    if (!body.tier || !VALID_TIERS.includes(body.tier)) {
      return NextResponse.json({ error: "valid tier required" }, { status: 400 })
    }
    const result = await updateBuyer8020Tier({
      buyerName: body.buyerName, country: body.country, tier: body.tier,
    })
    if (!result.ok) return NextResponse.json({ error: result.reason ?? "update_failed" }, { status: 400 })
    return NextResponse.json({ ok: true, oldTier: result.oldTier, newTier: body.tier })
  }

  // ── Active / inactive switch ──
  if (body.action === "active") {
    if (typeof body.active !== "boolean") return NextResponse.json({ error: "active (true/false) required" }, { status: 400 })
    await setBuyerActive({
      buyerName: body.buyerName, country: body.country ?? "", active: body.active,
      reason: (body.reason ?? "").slice(0, 200), by: user.email ?? user.name ?? "",
    })
    return NextResponse.json({ ok: true, active: body.active })
  }

  // ── Sales coordinator change ──
  if (body.action === "coordinator") {
    const coord = (body.coordinator ?? "").trim()
    if (!coord) return NextResponse.json({ error: "coordinator required" }, { status: 400 })
    const result = await updateBuyer8020Coordinator({ buyerName: body.buyerName, country: body.country, coordinator: coord })
    if (!result.ok) return NextResponse.json({ error: result.reason ?? "update_failed" }, { status: 400 })
    return NextResponse.json({ ok: true, oldCoordinator: result.oldCoordinator, coordinator: coord })
  }

  // ── Segment / VIP update ──
  if (body.action === "segment") {
    if (!body.segment || !VALID_SEGMENTS.includes(body.segment)) {
      return NextResponse.json({ error: "valid segment required" }, { status: 400 })
    }
    // Use matched canonical code, else create a new canonical row keyed by a generated code
    const code = body.canonicalCode || makeCode(body.buyerName)
    const updates: Partial<CanonicalBuyer> = {
      canonicalBuyerName: body.buyerName,
      country:            body.country ?? "",
      segment:            body.segment,
      isKeyAccount:       body.isKeyAccount ?? (body.segment === "VIP" || body.segment === "KEY_ACCOUNT"),
    }
    const ok = await updateCanonicalBuyer(code, updates)
    if (!ok) return NextResponse.json({ error: "update_failed" }, { status: 400 })
    return NextResponse.json({ ok: true, canonicalCode: code, segment: body.segment })
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}
