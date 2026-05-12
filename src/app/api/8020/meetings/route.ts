/**
 * GET /api/8020/meetings
 *
 * Reads the "80/20 buyers" sheet, ensures every Tier-1/2/3 buyer has a
 * MEETING_SCHEDULE_8020 row (appending new ones with initial due date),
 * then returns enriched MeetingSchedule records joined with history.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getMeetingSchedules } from "@/lib/data"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url           = new URL(req.url)
  const filterTier    = url.searchParams.get("tier")    ?? ""
  const filterStatus  = url.searchParams.get("status")  ?? ""
  const filterPerson  = url.searchParams.get("person")  ?? ""
  const filterCountry = url.searchParams.get("country") ?? ""

  const all = await getMeetingSchedules()

  const filtered = all.filter((m) => {
    if (filterTier    && m.tier    !== filterTier)    return false
    if (filterStatus  && m.displayStatus !== filterStatus) return false
    if (filterPerson  && m.responsiblePerson.toLowerCase() !== filterPerson.toLowerCase()) return false
    if (filterCountry && m.country.toLowerCase() !== filterCountry.toLowerCase())          return false
    return true
  })

  // Sort by nextDueDate ascending so overdue/due-soon surface first
  filtered.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))

  // Filter option lists derived from full set (not filtered) so dropdowns stay stable
  const persons   = [...new Set(all.map((m) => m.responsiblePerson).filter(Boolean))].sort()
  const countries = [...new Set(all.map((m) => m.country).filter(Boolean))].sort()

  return NextResponse.json({
    meetings: filtered,
    filterOptions: { persons, countries },
  })
}
