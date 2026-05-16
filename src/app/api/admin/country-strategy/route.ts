/**
 * GET   /api/admin/country-strategy            — list all country strategies
 * PATCH /api/admin/country-strategy            — set/update strategy for a country
 *                                                body = { country, isDreamMarket, priority?, strategicNotes? }
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCountryStrategies, setCountryStrategy } from "@/lib/data"
import type { AppUser } from "@/types"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const strategies = await getCountryStrategies()
  return NextResponse.json({
    strategies,
    summary: {
      total:        strategies.length,
      dreamMarkets: strategies.filter((s) => s.isDreamMarket).length,
    },
  })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  if (user.role === "SALES_PERSON") {
    return NextResponse.json({ error: "Forbidden — managers only" }, { status: 403 })
  }

  const body = await req.json() as {
    country:        string
    isDreamMarket:  boolean
    priority?:      number
    strategicNotes?: string
  }

  if (!body.country || typeof body.isDreamMarket !== "boolean") {
    return NextResponse.json({ error: "country and isDreamMarket required" }, { status: 400 })
  }

  const ok = await setCountryStrategy({
    country:         body.country,
    isDreamMarket:   body.isDreamMarket,
    priority:        body.priority,
    strategicNotes:  body.strategicNotes,
    updatedBy:       user.name ?? user.email ?? "unknown",
  })
  if (!ok) return NextResponse.json({ error: "Update failed" }, { status: 500 })

  return NextResponse.json({ ok: true, country: body.country.toUpperCase(), isDreamMarket: body.isDreamMarket })
}
