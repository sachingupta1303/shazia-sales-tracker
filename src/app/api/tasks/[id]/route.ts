import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateTaskStatus } from "@/lib/data"
import type { AppUser, TaskStatus } from "@/types"

// PATCH /api/tasks/[id] — update task status
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  const { id } = await params
  const body = await req.json() as { status: TaskStatus }

  if (!body.status) {
    return NextResponse.json({ error: "status required" }, { status: 400 })
  }
  const valid: TaskStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "OVERDUE"]
  if (!valid.includes(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 })
  }

  const result = await updateTaskStatus(id, body.status, user.name ?? user.email ?? "unknown")
  if (!result.ok) return NextResponse.json({ error: "task not found" }, { status: 404 })

  return NextResponse.json({ ok: true, id, status: body.status })
}
