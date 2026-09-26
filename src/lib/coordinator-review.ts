/**
 * Weekly Sales Coordinator Review.
 *
 * Identifies "good buyers whose orders aren't coming / are very low" per sales
 * coordinator, sends each coordinator a no-login magic link to fill reasons, and
 * collects the submissions for the director's Friday review.
 *
 * Risk buyer = Tier 1/2/3 (80/20) buyer that this FY is either:
 *   • NO_ORDER — 0 containers this FY (and had prior orders or a target), OR
 *   • LOW      — below 50% of expected pace (target × week/52).
 */
import { createHmac } from "crypto"
import {
  get8020Buyers, getPIRecords, filterPIByFY, sumContainersBy,
  getCoordinatorReviews, getAlertLogRows, addAlertLogEntry,
} from "./data"
import { getCurrentFY, getPreviousFY, getCurrentFYWeek, targetDueTillWeek, parsePIDate } from "./fy-utils"
import { sendMail, esc, APP_BASE_URL } from "./mailer"
import type { CoordinatorRiskBuyer, FinancialYear } from "@/types"

export interface CoordinatorRiskGroup {
  coordinator: string
  email:       string
  buyers:      CoordinatorRiskBuyer[]
}

const norm = (s: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim()

/** Today's date (YYYY-MM-DD) in IST — local copy to avoid importing 8020-batch. */
function todayIST(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60_000)
  return ist.toISOString().split("T")[0]
}

// ─── Magic-link token (stateless, HMAC-signed — no sheet needed) ───────────────

function tokenSecret(): string {
  return (
    process.env.MEETING_TOKEN_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.AUTH_SECRET ??
    "shazia-rice-token-secret-2024"
  )
}

export function signReviewToken(p: { coordinator: string; fyWeek: number; fy: string }): string {
  const body = Buffer.from(JSON.stringify({ c: p.coordinator, w: p.fyWeek, fy: p.fy }), "utf8").toString("base64url")
  const sig  = createHmac("sha256", tokenSecret()).update(body).digest("base64url")
  return `${body}.${sig}`
}

export function verifyReviewToken(token: string): { coordinator: string; fyWeek: number; fy: string } | null {
  try {
    const [body, sig] = (token || "").split(".")
    if (!body || !sig) return null
    const expect = createHmac("sha256", tokenSecret()).update(body).digest("base64url")
    if (sig !== expect) return null
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
    if (!p?.c || !p?.fy) return null
    return { coordinator: String(p.c), fyWeek: Number(p.w), fy: String(p.fy) }
  } catch { return null }
}

// ─── Risk detection ────────────────────────────────────────────────────────────

export async function getRiskBuyersByCoordinator(fy: FinancialYear): Promise<CoordinatorRiskGroup[]> {
  const prevFY = getPreviousFY(fy)
  const week   = getCurrentFYWeek()
  const [buyers8020, allPI] = await Promise.all([get8020Buyers(), getPIRecords()])

  const actualByName = sumContainersBy(filterPIByFY(allPI, fy),     (r) => norm(r.buyerCompanyName))
  const prevByName   = sumContainersBy(filterPIByFY(allPI, prevFY), (r) => norm(r.buyerCompanyName))

  // Most-recent PI date (any FY) per buyer name
  const lastMs  = new Map<string, number>()
  const lastStr = new Map<string, string>()
  for (const r of allPI) {
    const k = norm(r.buyerCompanyName)
    const d = parsePIDate(r.piDate)
    if (!d || isNaN(d.getTime())) continue
    if (!lastMs.has(k) || d.getTime() > lastMs.get(k)!) { lastMs.set(k, d.getTime()); lastStr.set(k, r.piDate) }
  }
  const today = Date.now()

  const groups = new Map<string, CoordinatorRiskGroup>()
  for (const b of buyers8020) {
    if (b.tier !== "TIER1" && b.tier !== "TIER2" && b.tier !== "TIER3") continue
    const coord = (b.salesCoordinator || "").trim()
    if (!coord) continue

    const nk     = norm(b.buyerName)
    const actual = actualByName.get(nk) ?? 0
    const prev   = prevByName.get(nk) ?? 0
    const target = b.annualTarget || b.targetContainers || 0
    const due    = targetDueTillWeek(target, week)
    const achPct = due > 0 ? Math.round((actual / due) * 100) : (actual > 0 ? 100 : 0)

    const noOrder = actual === 0 && (prev > 0 || target > 0)
    const low     = actual > 0 && target > 0 && achPct < 50
    if (!noOrder && !low) continue

    const lms = lastMs.get(nk)
    const buyer: CoordinatorRiskBuyer = {
      buyerName:      b.buyerName,
      country:        b.country,
      tier:          b.tier,
      target, actual,
      achievementPct: achPct,
      lastYear:       prev,
      lastOrderDate:  lastStr.get(nk) ?? "",
      daysSinceOrder: lms ? Math.floor((today - lms) / 86_400_000) : null,
      status:         actual === 0 ? "NO_ORDER" : "LOW",
    }

    let g = groups.get(coord)
    if (!g) { g = { coordinator: coord, email: (b.coordinatorEmail || "").trim(), buyers: [] }; groups.set(coord, g) }
    if (!g.email && b.coordinatorEmail) g.email = b.coordinatorEmail.trim()
    g.buyers.push(buyer)
  }

  const tierRank = (t: string) => (t === "TIER1" ? 0 : t === "TIER2" ? 1 : 2)
  for (const g of groups.values()) {
    g.buyers.sort((a, b) =>
      (a.status === b.status ? 0 : a.status === "NO_ORDER" ? -1 : 1) ||
      tierRank(a.tier) - tierRank(b.tier) ||
      b.target - a.target
    )
  }
  return [...groups.values()].sort((a, b) => b.buyers.length - a.buyers.length)
}

/** Risk buyers for a single coordinator (case-insensitive name match). */
export async function getRiskForCoordinator(fy: FinancialYear, coordinator: string): Promise<CoordinatorRiskGroup | null> {
  const all = await getRiskBuyersByCoordinator(fy)
  return all.find((g) => g.coordinator.toLowerCase() === coordinator.toLowerCase()) ?? null
}

/** Set of coordinator names (lowercased) who have submitted a review for the week. */
export async function getSubmittedCoordinators(fy: FinancialYear, week: number): Promise<Set<string>> {
  const reviews = await getCoordinatorReviews(fy, week)
  return new Set(reviews.map((r) => r.salesCoordinator.toLowerCase().trim()))
}

// ─── Email ─────────────────────────────────────────────────────────────────────

const STATUS_LABEL = (s: string) => (s === "NO_ORDER" ? "No order yet" : "Low (&lt;50%)")

export async function sendCoordinatorReviewEmail(
  g: CoordinatorRiskGroup, url: string, week: number, fy: string
): Promise<{ ok: boolean; reason?: string }> {
  const rows = g.buyers.slice(0, 40).map((b, i) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#6b7280">${i + 1}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:600;color:#111">${esc(b.buyerName)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#374151">${esc(b.country)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#374151">${esc(b.tier.replace("TIER", "T"))}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;color:#374151">${b.target}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:${b.actual === 0 ? "#b91c1c" : "#374151"}">${b.actual}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;color:${b.status === "NO_ORDER" ? "#b91c1c" : "#b45309"};font-weight:600">${STATUS_LABEL(b.status)}</td>
    </tr>`).join("")

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111">
    <div style="background:#0f766e;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">
      <div style="font-size:12px;opacity:.85;letter-spacing:.5px">SHAZIA RICE · WEEKLY REVIEW</div>
      <div style="font-size:18px;font-weight:700;margin-top:2px">Buyers needing a reason — Week ${week} · FY ${esc(fy)}</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;padding:20px">
      <p style="margin:0 0 6px">Hi <b>${esc(g.coordinator)}</b>,</p>
      <p style="margin:0 0 14px;color:#374151;font-size:14px">
        In neeche diye <b>${g.buyers.length}</b> buyers ke orders is saal <b>nahi aa rahe / bahut kam</b> hain.
        Har buyer ka <b>reason</b> aur <b>next step</b> bhar do — ye director sir ke Friday review mein jaata hai.
      </p>
      <div style="text-align:center;margin:18px 0">
        <a href="${url}" style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block">📝 Fill Review (no login)</a>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
        <thead>
          <tr style="background:#f9fafb;text-align:left">
            <th style="padding:6px 8px;color:#6b7280;font-weight:600">#</th>
            <th style="padding:6px 8px;color:#6b7280;font-weight:600">Buyer</th>
            <th style="padding:6px 8px;color:#6b7280;font-weight:600">Country</th>
            <th style="padding:6px 8px;color:#6b7280;font-weight:600">Tier</th>
            <th style="padding:6px 8px;color:#6b7280;font-weight:600;text-align:right">Target</th>
            <th style="padding:6px 8px;color:#6b7280;font-weight:600;text-align:right">Actual</th>
            <th style="padding:6px 8px;color:#6b7280;font-weight:600">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${g.buyers.length > 40 ? `<p style="color:#6b7280;font-size:12px;margin-top:8px">+${g.buyers.length - 40} more — poori list link par khulegi.</p>` : ""}
      <p style="color:#9ca3af;font-size:12px;margin-top:16px">Link personal hai — kisi ko forward mat karo. Bhar ke submit karte hi ye reminder band ho jayega.</p>
    </div>
  </div>`

  const res = await sendMail({
    to:      g.email,
    subject: `📝 Weekly Review — ${g.buyers.length} buyers need a reason (Week ${week})`,
    html,
  })
  return { ok: res.ok, reason: res.reason }
}

// ─── Cron: send to pending coordinators (once per day, skip after submit) ──────

export async function sendPendingCoordinatorReviewReminders(
  now: Date = new Date()
): Promise<{ sent: number; skipped: number; failed: number; pending: number }> {
  const fy   = getCurrentFY()
  const week = getCurrentFYWeek()
  const groups = await getRiskBuyersByCoordinator(fy)
  if (!groups.length) return { sent: 0, skipped: 0, failed: 0, pending: 0 }

  const submitted    = await getSubmittedCoordinators(fy, week)
  const todayISO     = todayIST(now)
  const todaysAlerts = await getAlertLogRows(todayISO)
  const sentToday    = new Set(todaysAlerts.filter((a) => a.meetingId === "COORD_REVIEW").map((a) => a.emailTo))

  let sent = 0, skipped = 0, failed = 0, pending = 0
  for (const g of groups) {
    if (submitted.has(g.coordinator.toLowerCase().trim())) continue   // already filled → stop reminding
    pending++
    if (!g.email)            { skipped++; continue }
    if (sentToday.has(g.email)) { skipped++; continue }               // already emailed today

    const token = signReviewToken({ coordinator: g.coordinator, fyWeek: week, fy })
    const url   = `${APP_BASE_URL}/coord-review/${token}`
    const { ok } = await sendCoordinatorReviewEmail(g, url, week, fy)
    await addAlertLogEntry({
      meetingId: "COORD_REVIEW",
      buyerName: `[Review] ${g.coordinator} W${week}`,
      alertDate: todayISO,
      emailTo:   g.email,
      status:    ok ? "SENT" : "FAILED",
    })
    if (ok) sent++; else failed++
  }
  return { sent, skipped, failed, pending }
}
