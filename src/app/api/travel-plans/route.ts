import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getTravelPlans, addTravelPlan } from "@/lib/data"
import type { AppUser, TravelPlan, TravelStatus } from "@/types"

// GET /api/travel-plans?country=&status=
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url     = new URL(req.url)
  const country = url.searchParams.get("country") ?? ""
  const status  = url.searchParams.get("status")  ?? ""
  const limit   = Number(url.searchParams.get("limit") ?? "200")

  const plans = await getTravelPlans({
    country: country || undefined,
    status:  (status as TravelStatus) || undefined,
    limit,
  })

  // Group by status for summary
  const byStatus: Record<string, number> = { PLANNED: 0, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 }
  for (const p of plans) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1

  return NextResponse.json({ plans, summary: { total: plans.length, byStatus } })
}

// POST /api/travel-plans — create new
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  if (user.role === "SALES_PERSON") {
    return NextResponse.json({ error: "Forbidden — managers only" }, { status: 403 })
  }

  const body = await req.json() as Partial<TravelPlan>
  if (!body.country || !body.assignedTo || !body.plannedMonth) {
    return NextResponse.json({ error: "country, assignedTo and plannedMonth required" }, { status: 400 })
  }

  const plan: Omit<TravelPlan, "id"> = {
    country:         body.country.toUpperCase(),
    purpose:         body.purpose ?? "",
    assignedTo:      body.assignedTo,
    plannedMonth:    body.plannedMonth,
    days:            body.days ?? 0,
    keyBuyers:       body.keyBuyers ?? "",
    expectedOutcome: body.expectedOutcome ?? "",
    status:          (body.status ?? "PLANNED") as TravelStatus,
    remarks:         body.remarks ?? "",
    createdBy:       user.name ?? user.email ?? "unknown",
    createdAt:       new Date().toISOString(),
  }

  const id = await addTravelPlan(plan)
  return NextResponse.json({ ok: true, id, plan: { ...plan, id } })
}
