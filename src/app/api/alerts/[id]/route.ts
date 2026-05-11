import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateAlertStatus } from "@/lib/data"
import type { AppUser, Alert } from "@/types"

// PATCH /api/alerts/[id] — update an alert's status (Mark Done / Resolve / Reopen)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const _user = session.user as unknown as AppUser
  const { id } = await params

  const body = await req.json() as { status: Alert["status"] }
  if (!body.status) return NextResponse.json({ error: "status required" }, { status: 400 })

  const validStatuses: Alert["status"][] = ["OPEN", "READ", "RESOLVED", "DONE", "OVERDUE"]
  if (!validStatuses.includes(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 })
  }

  const ok = await updateAlertStatus(id, body.status)
  if (!ok) return NextResponse.json({ error: "alert not found" }, { status: 404 })

  return NextResponse.json({ ok: true, id, status: body.status })
}
