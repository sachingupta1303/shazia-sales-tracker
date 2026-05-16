import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateTravelPlan } from "@/lib/data"
import type { AppUser, TravelPlan, TravelStatus } from "@/types"

// PATCH /api/travel-plans/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  if (user.role === "SALES_PERSON") {
    return NextResponse.json({ error: "Forbidden — managers only" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json() as Partial<TravelPlan>

  if (body.status) {
    const valid: TravelStatus[] = ["PLANNED", "IN_PROGRESS", "DONE", "CANCELLED"]
    if (!valid.includes(body.status as TravelStatus)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 })
    }
  }

  const ok = await updateTravelPlan(id, body, user.name ?? user.email ?? "unknown")
  if (!ok) return NextResponse.json({ error: "plan not found" }, { status: 404 })

  return NextResponse.json({ ok: true, id })
}
