/**
 * PATCH /api/admin/canonical/[code]
 *   Updates a canonical buyer record. Used for segment swap and other field edits.
 *   If no canonical record exists with this code, creates one (manager-driven segment).
 *   Body = Partial<CanonicalBuyer>
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateCanonicalBuyer } from "@/lib/data"
import { SHEETS } from "@/lib/sheets"
import type { AppUser, CanonicalBuyer } from "@/types"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (user.role === "SALES_PERSON") {
    return NextResponse.json({ error: "Forbidden — managers only" }, { status: 403 })
  }

  if (!SHEETS.CANONICAL_MAP) {
    return NextResponse.json({ error: "Canonical sheet not configured" }, { status: 400 })
  }

  const { code: rawCode } = await params
  const code = decodeURIComponent(rawCode)
  const body = await req.json() as Partial<CanonicalBuyer>

  // Whitelist allowed fields (avoid accidental overwrites of code)
  const updates: Partial<CanonicalBuyer> = {}
  if (body.canonicalBuyerName !== undefined) updates.canonicalBuyerName = body.canonicalBuyerName
  if (body.buyerCode          !== undefined) updates.buyerCode          = body.buyerCode
  if (body.country            !== undefined) updates.country            = body.country
  if (body.segment            !== undefined) updates.segment            = body.segment
  if (body.strategicRank      !== undefined) updates.strategicRank      = body.strategicRank
  if (body.isKeyAccount       !== undefined) updates.isKeyAccount       = body.isKeyAccount
  if (body.primaryOwner       !== undefined) updates.primaryOwner       = body.primaryOwner
  if (body.backupOwner        !== undefined) updates.backupOwner        = body.backupOwner
  if (body.targetFY2026       !== undefined) updates.targetFY2026       = body.targetFY2026
  if (body.notes              !== undefined) updates.notes              = body.notes

  const ok = await updateCanonicalBuyer(code, updates)
  if (!ok) return NextResponse.json({ error: "Update failed" }, { status: 500 })

  return NextResponse.json({ ok: true, code, updates })
}
