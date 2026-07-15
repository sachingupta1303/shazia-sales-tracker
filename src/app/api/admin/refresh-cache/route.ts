/**
 * POST /api/admin/refresh-cache
 *
 * Clears ALL server-side caches (memoized data + raw sheet reads) so that edits
 * made DIRECTLY in the Google Sheets (e.g. changing a buyer's Sales Coordinator
 * in the 80/20 sheet) reflect across the app immediately, without waiting for the
 * 30-minute cache TTL.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { invalidateAllMemo } from "@/lib/data"
import { clearAllSheetCache } from "@/lib/sheets"
import type { AppUser } from "@/types"

function canAdmin(user: AppUser) {
  return user.role === "MANAGER" || user.role === "DIRECTOR"
    || user.role === "SUPER_ADMIN" || user.role === "ADMIN"
}

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as unknown as AppUser
  if (!canAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  clearAllSheetCache()
  invalidateAllMemo()

  return NextResponse.json({ ok: true, clearedAt: new Date().toISOString() })
}
