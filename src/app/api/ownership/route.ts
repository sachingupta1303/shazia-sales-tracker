import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getOwnershipRecords, addOwnershipRecord,
  getPIRecords, getTargetRecords, filterPIByFY, sumContainers,
} from "@/lib/data"
import { getCurrentFY, getCurrentFYWeek, targetDueTillWeek } from "@/lib/fy-utils"
import type { AppUser } from "@/types"

// GET /api/ownership?buyerCode=XXX — ownership history for a buyer
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url  = new URL(req.url)
  const code = url.searchParams.get("buyerCode") ?? url.searchParams.get("canonicalBuyerCode") ?? ""

  const records = await getOwnershipRecords(code || undefined)
  return NextResponse.json({ records })
}

// POST /api/ownership — reassign a buyer
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  if (user.role === "SALES_PERSON") {
    return NextResponse.json({ error: "Forbidden — managers only" }, { status: 403 })
  }

  const body = await req.json() as {
    canonicalBuyerCode: string
    buyerName:          string
    fromOwner:          string
    toOwner:            string
    reason?:            string
    effectiveDate?:     string
  }

  if (!body.canonicalBuyerCode || !body.fromOwner || !body.toOwner) {
    return NextResponse.json({ error: "canonicalBuyerCode, fromOwner, toOwner required" }, { status: 400 })
  }

  const currentFY   = getCurrentFY()
  const currentWeek = getCurrentFYWeek()

  // Compute historical actual (containers sold by fromOwner for this buyer up to today)
  const allPI = await getPIRecords()
  const fyPI  = filterPIByFY(allPI, currentFY)
  const historicalActual = sumContainers(
    fyPI.filter((r) =>
      r.salesPerson.toLowerCase() === body.fromOwner.toLowerCase() &&
      (r.buyerCompanyName.toLowerCase().includes(body.buyerName.toLowerCase()) ||
       r.buyerCode === body.canonicalBuyerCode)
    )
  )

  // Compute remaining target = annual target - containers_sold_to_date
  const targets = await getTargetRecords(currentFY)
  const buyerTarget = targets
    .filter((t) =>
      t.salesPerson.toLowerCase() === body.fromOwner.toLowerCase() &&
      t.buyerCompanyName.toLowerCase().includes(body.buyerName.toLowerCase())
    )
    .reduce((s, t) => s + t.currentYearTargetContainers, 0)
  const inheritedTarget = Math.max(0, buyerTarget - historicalActual)

  const record = {
    canonicalBuyerCode: body.canonicalBuyerCode,
    buyerName:          body.buyerName,
    fromOwner:          body.fromOwner,
    toOwner:            body.toOwner,
    effectiveDate:      body.effectiveDate ?? new Date().toISOString().split("T")[0],
    transferredBy:      user.name ?? user.email ?? "unknown",
    reason:             body.reason ?? "",
    historicalActual,
    inheritedTarget,
  }

  const id = await addOwnershipRecord(record)
  return NextResponse.json({ ok: true, id, record: { ...record, id } })
}
