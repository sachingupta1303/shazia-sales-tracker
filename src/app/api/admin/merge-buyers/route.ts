/**
 * Merge two buyer name-variants into one.
 *
 * GET  /api/admin/merge-buyers   — list all distinct buyer names (for the pickers)
 * POST /api/admin/merge-buyers   — merge a variant name into a primary name
 *      body = { primaryName, variantName }
 *
 * The primary name is kept; the variant is aliased to the primary's canonical
 * buyer. getPIRecords() then rewrites the variant to the primary name everywhere,
 * so target + actual line up in one place.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getPIRecords, getCanonicalBuyers, updateCanonicalBuyer, updateAliasMapping,
} from "@/lib/data"
import type { AppUser } from "@/types"

function canAdmin(user: AppUser) {
  return user.role === "MANAGER" || user.role === "DIRECTOR"
    || user.role === "SUPER_ADMIN" || user.role === "ADMIN"
}
const norm = (s: string) => s.toLowerCase().trim()
const makeCode = (name: string) => "raw_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)

// ── GET: distinct buyer names for the pickers ────────────────────────────────
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!canAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const [allPI, canon] = await Promise.all([getPIRecords(), getCanonicalBuyers()])
  const byName = new Map<string, { name: string; country: string }>()
  for (const r of allPI) {
    const k = norm(r.buyerCompanyName)
    if (k && !byName.has(k)) byName.set(k, { name: r.buyerCompanyName, country: r.countries })
  }
  for (const c of canon) {
    const k = norm(c.canonicalBuyerName)
    if (k && !byName.has(k)) byName.set(k, { name: c.canonicalBuyerName, country: c.country })
  }
  const names = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
  return NextResponse.json({ names })
}

// ── POST: merge variant → primary ────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!canAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json() as { primaryName?: string; variantName?: string }
  const primaryName = (body.primaryName || "").trim()
  const variantName = (body.variantName || "").trim()

  if (!primaryName || !variantName) {
    return NextResponse.json({ error: "primaryName and variantName required" }, { status: 400 })
  }
  if (norm(primaryName) === norm(variantName)) {
    return NextResponse.json({ error: "Primary and variant names are the same" }, { status: 400 })
  }

  try {
    const [allPI, canon] = await Promise.all([getPIRecords(), getCanonicalBuyers()])

    // Find (or create) the canonical buyer for the primary name
    const target = canon.find((c) => norm(c.canonicalBuyerName) === norm(primaryName))
    let code = target?.canonicalBuyerCode
    if (!code) {
      code = makeCode(primaryName)
      const country =
        allPI.find((r) => norm(r.buyerCompanyName) === norm(primaryName))?.countries ||
        allPI.find((r) => norm(r.buyerCompanyName) === norm(variantName))?.countries || ""
      const created = await updateCanonicalBuyer(code, { canonicalBuyerName: primaryName, country })
      if (!created) return NextResponse.json({ error: "Could not create canonical buyer (canonical map sheet not writable?)" }, { status: 400 })
    }

    // Alias the variant name → the primary's canonical code
    const ok = await updateAliasMapping({ aliasName: variantName, canonicalBuyerCode: code, matchConfidence: "HIGH" })
    if (!ok) return NextResponse.json({ error: "Alias write failed (canonical map sheet not writable?)" }, { status: 400 })

    return NextResponse.json({ ok: true, primaryName, variantName, code })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    console.error("[merge-buyers] ERROR:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
