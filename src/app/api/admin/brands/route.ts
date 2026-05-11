/**
 * GET   /api/admin/brands       — list all brands (from PI data) + their categories
 * PATCH /api/admin/brands       — set/update brand category
 *                                 body = { brand, category, notes? }
 *
 * Brand categories are stored in the canonical map sheet under tab BRAND_CATEGORIES.
 * If the sheet isn't configured, GET still returns the brands found in PI data with
 * heuristic-guessed categories so the UI can show something useful.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listAllBrandsFromPI, getBrandCategoryMap, getBrandMappings, setBrandCategory } from "@/lib/data"
import { SHEETS } from "@/lib/sheets"
import { guessBrandCategory } from "@/lib/utils"
import type { AppUser, BrandCategory } from "@/types"

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Public for read — sales people can see brand categories where shown.
  // We just return the data; admin role is checked on PATCH.

  const [allBrands, categoryMap, mappings] = await Promise.all([
    listAllBrandsFromPI(),
    getBrandCategoryMap(),
    getBrandMappings(),
  ])

  // Build the full brand list:
  //  - every brand seen in PI data, paired with its mapped or guessed category
  //  - plus any extra mappings in the sheet that aren't currently in PI data
  const known = new Map<string, { brand: string; category: BrandCategory; mapped: boolean }>()
  for (const brand of allBrands) {
    const mapped = categoryMap.get(brand.toLowerCase().trim())
    known.set(brand, {
      brand,
      category: mapped ?? guessBrandCategory(brand),
      mapped:   !!mapped,
    })
  }
  for (const m of mappings) {
    if (!known.has(m.brand)) {
      known.set(m.brand, { brand: m.brand, category: m.category, mapped: true })
    }
  }

  const list = Array.from(known.values()).sort((a, b) => a.brand.localeCompare(b.brand))

  // Build map (lowercase key) for client-side lookup
  const map: Record<string, BrandCategory> = {}
  for (const item of list) map[item.brand.toLowerCase().trim()] = item.category

  return NextResponse.json({
    configured:    !!SHEETS.CANONICAL_MAP,
    list,
    map,
    summary: {
      total:        list.length,
      mapped:       list.filter((x) => x.mapped).length,
      ourBrand:     list.filter((x) => x.category === "OUR_BRAND").length,
      privateBrand: list.filter((x) => x.category === "PRIVATE_BRAND").length,
      unclassified: list.filter((x) => x.category === "UNCLASSIFIED").length,
    },
  })
}

// ── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (user.role === "SALES_PERSON") {
    return NextResponse.json({ error: "Forbidden — managers only" }, { status: 403 })
  }

  if (!SHEETS.CANONICAL_MAP) {
    return NextResponse.json({ error: "Canonical sheet not configured" }, { status: 400 })
  }

  const body = await req.json() as { brand: string; category: BrandCategory; notes?: string }
  if (!body.brand || !body.category) {
    return NextResponse.json({ error: "brand and category required" }, { status: 400 })
  }

  const valid: BrandCategory[] = ["OUR_BRAND", "PRIVATE_BRAND", "UNCLASSIFIED"]
  if (!valid.includes(body.category)) {
    return NextResponse.json({ error: "invalid category" }, { status: 400 })
  }

  const ok = await setBrandCategory({
    brand:     body.brand,
    category:  body.category,
    notes:     body.notes,
    updatedBy: user.name,
  })
  if (!ok) return NextResponse.json({ error: "Update failed" }, { status: 500 })

  return NextResponse.json({ ok: true, brand: body.brand, category: body.category })
}
