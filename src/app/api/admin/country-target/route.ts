/**
 * Country Target admin API (Control Panel).
 *
 * GET   /api/admin/country-target   — list countries with plan target + actuals
 * POST  /api/admin/country-target   — update a country's 2026 plan target
 *                                      body = { country, planned2026 }
 *
 * Edits the COUNTRY_TARGET sheet ("2026 PLANNED"). This is the country-level
 * business-plan number used as the country target where no buyer-level targets
 * exist. Buyer-level targets (TARGET_MASTER) still take precedence in views.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getCountryTargets, getTargetRecords, getPIRecords, filterPIByFY,
  updateCountryTarget, sumContainersBy,
} from "@/lib/data"
import { getCurrentFY } from "@/lib/fy-utils"
import type { AppUser, FinancialYear } from "@/types"

function canAdmin(user: AppUser) {
  return user.role === "MANAGER" || user.role === "DIRECTOR"
    || user.role === "SUPER_ADMIN" || user.role === "ADMIN"
}

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!canAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const fy  = (url.searchParams.get("fy") ?? getCurrentFY()) as FinancialYear

  const [countryTargets, targets, allPI] = await Promise.all([
    getCountryTargets(),
    getTargetRecords(fy),
    getPIRecords(),
  ])
  const fyPI = filterPIByFY(allPI, fy)

  // Actuals by country (containers counted once per PI)
  const actualByCountry = sumContainersBy(fyPI, (r) => r.countries.toUpperCase().trim())

  // Buyer-target sum by country (the value that takes precedence in views)
  const buyerTargetByCountry = new Map<string, number>()
  for (const t of targets) {
    const c = (t.countries ?? "").toUpperCase().trim()
    if (!c) continue
    buyerTargetByCountry.set(c, (buyerTargetByCountry.get(c) ?? 0) + t.currentYearTargetContainers)
  }

  // Union of all country keys
  const keys = new Set<string>([
    ...countryTargets.map((c) => c.country.toUpperCase().trim()),
    ...actualByCountry.keys(),
    ...buyerTargetByCountry.keys(),
  ])

  const planByCountry = new Map(countryTargets.map((c) => [c.country.toUpperCase().trim(), c]))

  const rows = [...keys].filter(Boolean).map((country) => {
    const plan = planByCountry.get(country)
    return {
      country,
      planned2026:     plan?.planned2026 ?? 0,
      buyerTargetSum:  buyerTargetByCountry.get(country) ?? 0,
      actual:          actualByCountry.get(country) ?? 0,
      hasPlanRow:      !!plan,
    }
  }).sort((a, b) => b.actual - a.actual || a.country.localeCompare(b.country))

  return NextResponse.json({ rows, meta: { currentFY: fy } })
}

// ── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!canAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json() as { country: string; planned2026: number }
  if (!body.country || body.planned2026 === undefined) {
    return NextResponse.json({ error: "country and planned2026 required" }, { status: 400 })
  }
  if (body.planned2026 < 0) {
    return NextResponse.json({ error: "planned2026 cannot be negative" }, { status: 400 })
  }

  const result = await updateCountryTarget({
    country:     body.country,
    planned2026: body.planned2026,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "update_failed" }, { status: 400 })
  }

  return NextResponse.json({
    ok:        true,
    oldTarget: result.oldTarget,
    newTarget: body.planned2026,
    delta:     body.planned2026 - result.oldTarget,
  })
}
