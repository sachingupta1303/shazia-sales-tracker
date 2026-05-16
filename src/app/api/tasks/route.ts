import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getTasks, addTask } from "@/lib/data"
import type { AppUser, BuyerTask, TaskStatus, TaskType, AssignedRole } from "@/types"

// ── GET /api/tasks ────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  const isSP = user.role === "SALES_PERSON"
  const url  = new URL(req.url)

  const buyerCode  = url.searchParams.get("buyerCode")  ?? ""
  const status     = url.searchParams.get("status")     ?? ""
  const role       = url.searchParams.get("role")       ?? ""
  const limit      = Number(url.searchParams.get("limit") ?? "100")

  // SALES_PERSON sees only tasks assigned to them; managers see all (or filtered by ?assignedTo=)
  const assignedTo = isSP
    ? (user.salesPersonName ?? user.name)
    : (url.searchParams.get("assignedTo") ?? "")

  const tasks = await getTasks({
    buyerCode:  buyerCode  || undefined,
    status:     (status as TaskStatus) || undefined,
    role:       (role as AssignedRole) || undefined,
    assignedTo: assignedTo || undefined,
    limit,
  })

  // Group counts
  const byStatus: Record<string, number> = { OPEN: 0, IN_PROGRESS: 0, DONE: 0, OVERDUE: 0 }
  for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1

  return NextResponse.json({
    tasks,
    summary: {
      total: tasks.length,
      byStatus,
    },
  })
}

// ── POST /api/tasks ───────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  const body = await req.json() as Partial<BuyerTask> & {
    daysFromNow?: number
  }

  if (body.id) {
    // Update existing task
    const { updateTaskDetails } = await import("@/lib/data")
    const ok = await updateTaskDetails(body.id, {
      title: body.title,
      description: body.description,
      assignedTo: body.assignedTo,
      dueDate: body.dueDate,
    })
    if (!ok) return NextResponse.json({ error: "Task not found" }, { status: 404 })
    return NextResponse.json({ ok: true, id: body.id })
  }

  if (!body.buyerName || !body.title || !body.assignedTo) {
    return NextResponse.json({ error: "buyerName, title and assignedTo required" }, { status: 400 })
  }

  // Default dueDate: today + (daysFromNow ?? 5)
  let dueDate = body.dueDate
  if (!dueDate) {
    const d = new Date()
    d.setDate(d.getDate() + (body.daysFromNow ?? 5))
    dueDate = d.toISOString().split("T")[0]
  }

  const task: Omit<BuyerTask, "id" | "daysToDue"> = {
    buyerCode:     body.buyerCode  ?? "",
    buyerName:     body.buyerName,
    country:       body.country    ?? "",
    title:         body.title,
    description:   body.description ?? "",
    taskType:      (body.taskType ?? "CUSTOM") as TaskType,
    assignedTo:    body.assignedTo,
    assignedRole:  (body.assignedRole ?? "SALES_PERSON") as AssignedRole,
    dueDate,
    status:        "OPEN",
    recurringDays: body.recurringDays ?? 0,
    createdBy:     user.name ?? user.email ?? "unknown",
    createdAt:     new Date().toISOString(),
  }

  const id = await addTask(task)
  return NextResponse.json({ ok: true, id, task: { ...task, id } })
}

// ── DELETE /api/tasks ────────────────────────────────────────────────────────
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get("id")

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { deleteTask } = await import("@/lib/data")
  const ok = await deleteTask(id)
  
  if (!ok) return NextResponse.json({ error: "Task not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
