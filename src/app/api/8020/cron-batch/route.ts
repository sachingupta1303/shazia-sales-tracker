/**
 * GET /api/8020/cron-batch
 *
 * Batched-reminder cron endpoint. Schedule this every 30 min via Vercel Cron.
 * Each invocation:
 *   • Returns immediately if outside 09:30–18:00 IST office hours
 *   • Otherwise sends ONE batch (default: 3 most-urgent buyers)
 *   • Subsequent calls within the same window pick up where the prior left off
 *     (dedup via ALERT_LOG_8020 sheet)
 *
 * Query params:
 *   ?force=1       — bypass office-hours gate (manual trigger / testing)
 *   ?batchSize=N   — override default batch size
 *
 * Auth: Bearer CRON_SECRET if set, else open.
 */

import { NextResponse } from "next/server"
import { runReminderBatch } from "@/lib/8020-batch"
import { auth } from "@/lib/auth"

export async function GET(req: Request) {
  const url          = new URL(req.url)
  const secret       = process.env.CRON_SECRET ?? ""
  const bearerMatch  = secret && req.headers.get("authorization") === `Bearer ${secret}`
  const isVercelCron = req.headers.get("x-vercel-cron") === "1"
  const noSecret     = !secret

  // Allow if: no secret configured, OR bearer matches, OR Vercel cron header, OR logged-in admin
  const allowed = noSecret || bearerMatch || isVercelCron
  if (!allowed) {
    const session = await auth()
    const role    = (session?.user as { role?: string })?.role ?? ""
    const sessionOk = ["MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN"].includes(role)
    if (!sessionOk) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Vercel cron or bearer → force (bypass office-hours + 2-hour gap)
  const force = isVercelCron || bearerMatch || url.searchParams.get("force") === "1"
  const batchRaw  = url.searchParams.get("batchSize")
  const batchSize = batchRaw ? Math.max(1, Math.min(10, parseInt(batchRaw, 10))) : undefined

  try {
    const result = await runReminderBatch({ force, batchSize })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("[cron-batch] ERROR:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export { GET as POST }
