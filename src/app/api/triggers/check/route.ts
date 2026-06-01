/**
 * GET  /api/triggers/check  — run all trigger rules, return alerts (no write)
 * POST /api/triggers/check  — run + write new alerts to REMINDER_LOG (cron-safe)
 *
 * Vercel Cron: add to vercel.json:
 *   { "crons": [{ "path": "/api/triggers/check", "schedule": "0 6 * * 1" }] }
 * The cron hits POST each Monday at 6am UTC.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getPIRecords, getTargetRecords, getBuyerMaster,
  filterPIByFY, appendAlert, getAlerts, updateAlertStatus,
  getPendingReviews, getTasks, updateTaskStatus,
  sumContainersBy,
} from "@/lib/data"
import {
  getCurrentFY, getPreviousFY, getCurrentFYWeek,
  targetDueTillWeek,
} from "@/lib/fy-utils"
import { ALL_SALES_PERSONS } from "@/lib/users"
import { sendAlertEmail, sendReviewReminderEmail } from "@/lib/email"
import type { Alert, TriggerType, AlertSeverity } from "@/types"

function normName(s: string) { return s.toLowerCase().trim() }

interface FireArgs {
  triggerType: TriggerType
  severity:    AlertSeverity
  title:       string
  message:     string
  buyerCode?:  string
  buyerName?:  string
  country?:    string
  salesPerson?: string
  actionUrl?:  string
}

async function runTriggers(): Promise<Omit<Alert, "id">[]> {
  const currentFY   = getCurrentFY()
  const previousFY  = getPreviousFY(currentFY)
  const currentWeek = getCurrentFYWeek()

  if (currentWeek < 4) return []  // Too early in FY for meaningful alerts

  const [allPI, targets, buyerMaster] = await Promise.all([
    getPIRecords(),
    getTargetRecords(currentFY),
    getBuyerMaster(),
  ])

  const currentPI  = filterPIByFY(allPI, currentFY)
  const previousPI = filterPIByFY(allPI, previousFY)

  const now = new Date().toISOString()
  const alerts: Omit<Alert, "id">[] = []

  const fire = (args: FireArgs) => {
    alerts.push({
      ...args,
      createdAt: now,
      fyWeek:    currentWeek,
      status:    "OPEN",
    })
  }

  // ── Group PI by buyer ────────────────────────────────────────────────────
  const buyerCurrentMap = new Map<string, { actual: number; lastWeek: number; sp: string; name: string; country: string; byWeek: number[]; seenPI: Set<string>; seenWeekPI: Set<string> }>()
  for (const r of currentPI) {
    const key = normName(r.buyerCompanyName)
    let e     = buyerCurrentMap.get(key)
    if (!e) {
      e = {
        actual: 0, lastWeek: r.fyWeekNo,
        sp: r.salesPerson, name: r.buyerCompanyName,
        country: r.countries, byWeek: new Array(53).fill(0),
        seenPI: new Set(), seenWeekPI: new Set(),
      }
      buyerCurrentMap.set(key, e)
    }
    e.lastWeek = Math.max(e.lastWeek, r.fyWeekNo)
    // Containers are PI-level (repeated per product row) — count each PI once per buyer.
    if (!e.seenPI.has(r.piNumber)) {
      e.seenPI.add(r.piNumber)
      e.actual += r.totalContainers
    }
    // …and once per (buyer, week).
    const weekKey = r.fyWeekNo + ":" + r.piNumber
    if (!e.seenWeekPI.has(weekKey)) {
      e.seenWeekPI.add(weekKey)
      e.byWeek[r.fyWeekNo] = (e.byWeek[r.fyWeekNo] ?? 0) + r.totalContainers
    }
  }

  // Containers are PI-level — count each PI once per buyer.
  const prevBuyerActual = sumContainersBy(previousPI, (r) => normName(r.buyerCompanyName))

  // ── Buyer-level triggers ─────────────────────────────────────────────────
  for (const t of targets) {
    const target      = t.currentYearTargetContainers
    if (target === 0) continue

    const key         = normName(t.buyerCompanyName)
    const bData       = buyerCurrentMap.get(key)
    const actual      = bData?.actual ?? 0
    const targetDue   = targetDueTillWeek(target, currentWeek)
    const achPct      = targetDue > 0 ? (actual / targetDue) * 100 : 0
    const bm          = buyerMaster.find((b) => normName(b.buyerCompanyName) === key)
    const tier        = bm?.tier ?? "TIER3"
    const lastWeek    = bData?.lastWeek ?? 0
    const weeksSince  = currentWeek - lastWeek
    const sp          = t.salesPerson

    // ── BUYER_BEHIND_PACE ────────────────────────────────────────────────
    if (achPct < 60 && currentWeek >= 8) {
      fire({
        triggerType: "BUYER_BEHIND_PACE",
        severity:    tier === "TIER1" ? "HIGH" : tier === "TIER2" ? "MEDIUM" : "LOW",
        title:       `${t.buyerCompanyName} is behind pace`,
        message:     `${achPct.toFixed(0)}% of target due achieved. Target: ${target}, Due: ${targetDue.toFixed(0)}, Actual: ${actual} containers.`,
        buyerCode:   bm?.buyerCode,
        buyerName:   t.buyerCompanyName,
        country:     t.countries,
        salesPerson: sp,
        actionUrl:   `/buyers/${encodeURIComponent(bm?.buyerCode ?? key)}`,
      })
    }

    // ── BUYER_DORMANT ────────────────────────────────────────────────────
    const prevActual = prevBuyerActual.get(key) ?? 0
    if (actual === 0 && prevActual > 0 && currentWeek >= 6) {
      fire({
        triggerType: "BUYER_DORMANT",
        severity:    tier === "TIER1" ? "HIGH" : "MEDIUM",
        title:       `${t.buyerCompanyName} has not ordered this FY`,
        message:     `${t.buyerCompanyName} placed ${prevActual} containers last FY but has 0 this year. Target is ${target} containers.`,
        buyerCode:   bm?.buyerCode,
        buyerName:   t.buyerCompanyName,
        country:     t.countries,
        salesPerson: sp,
        actionUrl:   `/buyers/${encodeURIComponent(bm?.buyerCode ?? key)}`,
      })
    }

    // ── KEY_BUYER_AGING ──────────────────────────────────────────────────
    if ((tier === "TIER1" || tier === "TIER2") && actual > 0 && weeksSince >= 4) {
      fire({
        triggerType: "KEY_BUYER_AGING",
        severity:    tier === "TIER1" ? "HIGH" : "MEDIUM",
        title:       `Key buyer ${t.buyerCompanyName} — ${weeksSince}w without order`,
        message:     `${t.buyerCompanyName} (${tier}) last ordered in W${lastWeek}. ${weeksSince} weeks with no new PI.`,
        buyerCode:   bm?.buyerCode,
        buyerName:   t.buyerCompanyName,
        country:     t.countries,
        salesPerson: sp,
        actionUrl:   `/buyers/${encodeURIComponent(bm?.buyerCode ?? key)}`,
      })
    }

    // ── MILESTONE_ACHIEVED ───────────────────────────────────────────────
    const milestones = [50, 75, 100]
    for (const ms of milestones) {
      const threshold = (target * ms) / 100
      // Check if actual just crossed this milestone (within last 2 weeks)
      const prevWeekActual = bData
        ? [...bData.byWeek].slice(0, currentWeek - 1).reduce((s, v) => s + v, 0)
        : 0
      if (actual >= threshold && prevWeekActual < threshold) {
        fire({
          triggerType: "MILESTONE_ACHIEVED",
          severity:    "LOW",
          title:       `🎯 ${t.buyerCompanyName} hit ${ms}% of target`,
          message:     `${t.buyerCompanyName} reached ${actual} containers — ${ms}% of their ${target} container target.`,
          buyerCode:   bm?.buyerCode,
          buyerName:   t.buyerCompanyName,
          country:     t.countries,
          salesPerson: sp,
          actionUrl:   `/buyers/${encodeURIComponent(bm?.buyerCode ?? key)}`,
        })
        break
      }
    }
  }

  // ── Weekly Review Pending ────────────────────────────────────────────────
  if (currentWeek >= 2) {
    const pending = await getPendingReviews({
      currentFY,
      currentWeek,
      salesPersons:  ALL_SALES_PERSONS,
      lookbackWeeks: 3,   // last 3 weeks
    })
    // Group by SP — one alert per SP per week missed
    for (const p of pending) {
      // Only fire if 1+ weeks overdue (so we don't spam mid-week)
      if (p.weeksOverdue >= 1) {
        fire({
          triggerType: "WEEKLY_REVIEW_PENDING",
          severity:    p.weeksOverdue >= 2 ? "HIGH" : "MEDIUM",
          title:       `Weekly review pending · W${p.fyWeek}`,
          message:     `${p.salesPerson} has not logged the W${p.fyWeek} review (${p.weeksOverdue}w overdue).`,
          salesPerson: p.salesPerson,
          actionUrl:   "/execution",
        })
      }
    }
  }

  // ── Action Plan Overdue ─────────────────────────────────────────────────
  // Read existing OPEN action plans, check due dates
  const openActionPlans = await getAlerts({
    triggerType: "ACTION_PLAN",
    status:      "OPEN",
    limit:       500,
  })
  const todayISO = new Date().toISOString().split("T")[0]
  for (const ap of openActionPlans) {
    if (ap.dueDate && ap.dueDate < todayISO) {
      // Update existing row's status to OVERDUE
      await updateAlertStatus(ap.id, "OVERDUE").catch(() => {})
      // Fire a fresh ACTION_OVERDUE alert (so it surfaces in feeds + emails)
      fire({
        triggerType: "ACTION_OVERDUE",
        severity:    "HIGH",
        title:       `Action plan overdue · ${ap.buyerName ?? "buyer"}`,
        message:     `Action was due ${ap.dueDate}. Original: "${ap.message.slice(0, 120)}${ap.message.length > 120 ? "…" : ""}"`,
        buyerCode:   ap.buyerCode,
        buyerName:   ap.buyerName,
        country:     ap.country,
        salesPerson: ap.followUpOwner || ap.salesPerson,
        actionUrl:   ap.actionUrl,
      })
    }
  }

  // ── Task Overdue ─────────────────────────────────────────────────────────
  const openTasks = await getTasks({ limit: 1000 })
  const todayStr  = todayISO  // already declared above
  for (const t of openTasks) {
    // Only fire for OPEN/IN_PROGRESS tasks that are past due
    const stillOpen = t.status === "OPEN" || t.status === "IN_PROGRESS"
    if (!stillOpen) continue
    if (!t.dueDate || t.dueDate >= todayStr) continue

    // Flip the task itself to OVERDUE in the sheet
    await updateTaskStatus(t.id, "OVERDUE").catch(() => {})

    const daysLate = Math.floor((Date.now() - new Date(t.dueDate).getTime()) / 86_400_000)
    fire({
      triggerType: "TASK_OVERDUE",
      severity:    daysLate >= 7 ? "HIGH" : daysLate >= 3 ? "MEDIUM" : "LOW",
      title:       `Task overdue · ${t.title}`,
      message:     `${t.assignedTo} has not completed "${t.title}" for ${t.buyerName}. Due ${t.dueDate} (${daysLate}d late).`,
      buyerCode:   t.buyerCode,
      buyerName:   t.buyerName,
      country:     t.country,
      salesPerson: t.assignedTo,
      actionUrl:   t.buyerCode ? `/buyers/${encodeURIComponent(t.buyerCode)}` : "/key-accounts",
    })
  }

  // ── Country-level triggers ───────────────────────────────────────────────
  // Containers are PI-level — count each PI once per country.
  const countryActualMap = sumContainersBy(currentPI, (r) => r.countries.toUpperCase())
  const countryTargetMap = new Map<string, number>()
  for (const t of targets) {
    const c = t.countries.toUpperCase()
    countryTargetMap.set(c, (countryTargetMap.get(c) ?? 0) + t.currentYearTargetContainers)
  }

  for (const [country, target] of countryTargetMap) {
    if (target === 0) continue
    const actual    = countryActualMap.get(country) ?? 0
    const targetDue = targetDueTillWeek(target, currentWeek)
    const achPct    = targetDue > 0 ? (actual / targetDue) * 100 : 0

    if (achPct < 60 && currentWeek >= 8) {
      fire({
        triggerType: "COUNTRY_BEHIND",
        severity:    target >= 200 ? "HIGH" : "MEDIUM",
        title:       `${country} is behind pace`,
        message:     `${achPct.toFixed(0)}% of target due. Target: ${target}, Due: ${targetDue.toFixed(0)}, Actual: ${actual} containers.`,
        country,
        actionUrl:   `/countries/${encodeURIComponent(country)}`,
      })
    }
  }

  return alerts
}

// GET — dry run (no write)
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as unknown as AppUser
  if (user.role === "SALES_PERSON") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const alerts = await runTriggers()
  return NextResponse.json({ alerts, count: alerts.length, dryRun: true })
}

// POST — fire triggers + write to REMINDER_LOG (used by Vercel Cron)
export async function POST(req: Request) {
  // Allow Vercel Cron (no session) OR authenticated manager/director
  const session = await auth()
  const isCron  = req.headers.get("x-vercel-cron") === "1"
  if (!isCron && !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isCron && session) {
    const user = session.user as unknown as AppUser
    if (user.role === "SALES_PERSON") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const alerts = await runTriggers()
  let written = 0
  let emailed = 0

  for (const alert of alerts) {
    try {
      const id = await appendAlert(alert)
      written++
      // Best-effort email — don't fail the cron run if email is down
      const result = await sendAlertEmail({ ...alert, id })
      if (result.ok) emailed++
    } catch { /* skip individual failures */ }
  }

  // Also send weekly review reminder emails for SPs that have many overdue
  try {
    const pending = await getPendingReviews({
      currentFY:     getCurrentFY(),
      currentWeek:   getCurrentFYWeek(),
      salesPersons:  ALL_SALES_PERSONS,
      lookbackWeeks: 3,
    })
    // De-dup by SP — only most-overdue pending review per SP gets an email
    const bySP = new Map<string, typeof pending[number]>()
    for (const p of pending) {
      const cur = bySP.get(p.salesPerson)
      if (!cur || p.weeksOverdue > cur.weeksOverdue) bySP.set(p.salesPerson, p)
    }
    for (const p of bySP.values()) {
      const r = await sendReviewReminderEmail(p)
      if (r.ok) emailed++
    }
  } catch { /* ignore email failures */ }

  return NextResponse.json({ ok: true, triggered: alerts.length, written, emailed })
}

// Required for app-level type access
import type { AppUser } from "@/types"
