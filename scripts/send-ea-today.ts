/**
 * Send today's Mohit Gupta reminders to EA only.
 * Run: npx tsx scripts/send-ea-today.ts
 */
import { config } from "dotenv"
config({ path: ".env.local" })
process.env.APP_BASE_URL = "https://shazia-sales-tracker-gvmj.vercel.app"

const EA_EMAIL = "operations.hrexports@shaziarice.com"

async function main() {
  const { getMeetingSchedules, createDoneToken } = await import("../src/lib/data")
  const { sendConsolidatedEmail }                = await import("../src/lib/email-8020")
  const { APP_BASE_URL }                         = await import("../src/lib/mailer")

  const meetings = await getMeetingSchedules()
  const eligible = meetings.filter(
    m => (m.displayStatus === "OVERDUE" || m.displayStatus === "DUE_SOON")
      && m.responsiblePerson.toLowerCase().includes("mohit gupta")
  ).sort((a, b) => {
    if (a.displayStatus !== b.displayStatus)
      return a.displayStatus === "OVERDUE" ? -1 : 1
    return a.daysRemaining - b.daysRemaining
  })

  console.log(`\nMohit Gupta eligible meetings: ${eligible.length}`)
  if (!eligible.length) { console.log("Nothing to send."); return }

  const rows = await Promise.all(eligible.map(async m => {
    let doneUrl: string | undefined
    try {
      const token = await createDoneToken(m.id, m.buyerName)
      doneUrl = `${APP_BASE_URL}/meeting-done/${encodeURIComponent(m.id)}?token=${token}`
    } catch { /* skip */ }
    return {
      meetingId: m.id, buyerName: m.buyerName, country: m.country,
      tier: m.tier, responsiblePerson: m.responsiblePerson,
      nextDueDate: m.nextDueDate, daysRemaining: m.daysRemaining,
      displayStatus: m.displayStatus as "OVERDUE" | "DUE_SOON", doneUrl,
    }
  }))

  console.log(`📤 Sending to EA: ${EA_EMAIL}`)
  const r = await sendConsolidatedEmail({
    personName:  "Mohit Gupta",
    personEmail: EA_EMAIL,
    role:        "responsible",
    meetings:    rows,
  })
  console.log(r.ok ? "✅ SENT!" : `❌ FAILED: ${r.reason}`)
}

main().catch(e => { console.error("💥", e.message); process.exit(1) })
