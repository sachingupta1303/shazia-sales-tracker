import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getAlerts, appendAlert } from "@/lib/data"
import { getCurrentFYWeek } from "@/lib/fy-utils"
import type { AppUser, TriggerType, AlertSeverity } from "@/types"

// GET — alert feed (with optional buyer/sp/triggerType filters)
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user  = session.user as unknown as AppUser
  const isSP  = user.role === "SALES_PERSON"
  const url   = new URL(req.url)

  const spFilter    = isSP ? (user.salesPersonName ?? "") : (url.searchParams.get("salesPerson") ?? "")
  const status      = url.searchParams.get("status") ?? ""
  const buyerCode   = url.searchParams.get("buyerCode") ?? ""
  const buyerName   = url.searchParams.get("buyerName") ?? ""
  const triggerType = url.searchParams.get("triggerType") ?? ""
  const limit       = Number(url.searchParams.get("limit") ?? "50")

  const alerts = await getAlerts({
    salesPerson: spFilter || undefined,
    status:      status   || undefined,
    buyerCode:   buyerCode || undefined,
    buyerName:   buyerName || undefined,
    triggerType: triggerType || undefined,
    limit,
  })

  const unreadCount = alerts.filter((a) => a.status === "OPEN").length

  return NextResponse.json({ alerts, unreadCount })
}

// POST — user remark / action plan
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  const body = await req.json() as {
    buyerCode?:      string
    buyerName?:      string
    country?:        string
    salesPerson?:    string
    remark:          string
    nextActionDate?: string
    followUpOwner?:  string
    severity?:       AlertSeverity
    triggerType?:    TriggerType   // defaults to USER_REMARK or ACTION_PLAN
  }

  if (!body.remark) {
    return NextResponse.json({ error: "remark required" }, { status: 400 })
  }

  // Compose message: remark + action plan info if present
  const parts: string[] = [body.remark]
  if (body.nextActionDate) parts.push(`Next action: ${body.nextActionDate}`)
  if (body.followUpOwner)  parts.push(`Owner: ${body.followUpOwner}`)
  const message = parts.join(" · ")

  const triggerType: TriggerType = body.triggerType
    ?? (body.nextActionDate ? "ACTION_PLAN" : "USER_REMARK")

  const alert = {
    triggerType,
    severity:      body.severity ?? "LOW" as AlertSeverity,
    title:         body.nextActionDate
      ? `Action plan · ${body.buyerName ?? "buyer"}`
      : `Remark · ${body.buyerName ?? "buyer"}`,
    message,
    buyerCode:     body.buyerCode,
    buyerName:     body.buyerName,
    country:       body.country,
    salesPerson:   body.salesPerson ?? user.salesPersonName ?? user.name,
    createdAt:     new Date().toISOString(),
    fyWeek:        getCurrentFYWeek(),
    status:        "OPEN" as const,
    actionUrl:     body.buyerCode ? `/buyers/${encodeURIComponent(body.buyerCode)}` : undefined,
    dueDate:       body.nextActionDate || undefined,
    followUpOwner: body.followUpOwner || undefined,
  }

  const id = await appendAlert(alert)
  return NextResponse.json({ ok: true, id, alert: { ...alert, id } })
}
