import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getLeadActivities, addLeadActivity } from "@/lib/data"
import { getCurrentFY, getCurrentFYWeek } from "@/lib/fy-utils"
import type { AppUser, ActivityType, ActivityOutcome } from "@/types"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user  = session.user as unknown as AppUser
  const isSP  = user.role === "SALES_PERSON"
  const url   = new URL(req.url)
  const spFilter = isSP ? (user.salesPersonName ?? "") : (url.searchParams.get("salesPerson") ?? "")
  const buyerCode = url.searchParams.get("buyerCode") ?? ""
  const limit  = Number(url.searchParams.get("limit") ?? "20")

  const activities = await getLeadActivities({
    salesPerson: spFilter || undefined,
    buyerCode:   buyerCode || undefined,
    limit,
  })

  return NextResponse.json({ activities })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  const body = await req.json()

  if (!body.buyerName || !body.activityType) {
    return NextResponse.json({ error: "buyerName and activityType required" }, { status: 400 })
  }

  const currentFY   = getCurrentFY()
  const currentWeek = getCurrentFYWeek()

  const activity = {
    date:         body.date ?? new Date().toISOString().split("T")[0],
    buyerCode:    body.buyerCode ?? "",
    buyerName:    body.buyerName,
    country:      body.country ?? "",
    activityType: body.activityType as ActivityType,
    notes:        body.notes ?? "",
    salesPerson:  body.salesPerson ?? (user.salesPersonName ?? user.name),
    fyWeek:       body.fyWeek ?? currentWeek,
    outcome:      (body.outcome ?? "NEUTRAL") as ActivityOutcome,
  }

  const id = await addLeadActivity(activity)
  return NextResponse.json({ ok: true, id, activity: { ...activity, id } })
}
