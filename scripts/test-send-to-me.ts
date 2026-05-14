/**
 * Sends TWO test emails to research@shaziarice.com:
 *   1. Responsible Person view (plain list)
 *   2. Sales Coordinator view (plain list + Responsible Person column)
 *
 * Uses REAL meeting data from the sheet.
 * Run: npx tsx scripts/test-send-to-me.ts
 */
import { config } from "dotenv"
config({ path: ".env.local" })

const TEST_EMAIL   = "research@shaziarice.com"
// Force production URL for Done button links
process.env.APP_BASE_URL = "https://shazia-sales-tracker-gvmj.vercel.app"

async function main() {
  console.log("\n" + "═".repeat(70))
  console.log("📧  TEST — Sending sample emails to", TEST_EMAIL)
  console.log("═".repeat(70))

  const { getMeetingSchedules, createDoneToken } = await import("../src/lib/data")
  const { sendConsolidatedEmail }                = await import("../src/lib/email-8020")
  const { verifySmtp, APP_BASE_URL }             = await import("../src/lib/mailer")

  // 0. SMTP check
  const v = await verifySmtp()
  if (!v.ok) { console.error(`❌ SMTP not ready: ${v.error}`); process.exit(1) }
  console.log("✓ SMTP OK\n")

  // 1. Fetch real meetings
  const meetings = await getMeetingSchedules()
  const eligible = meetings.filter(
    m => m.displayStatus === "OVERDUE" || m.displayStatus === "DUE_SOON"
  ).sort((a, b) => {
    if (a.displayStatus !== b.displayStatus)
      return a.displayStatus === "OVERDUE" ? -1 : 1
    return a.daysRemaining - b.daysRemaining
  })

  if (!eligible.length) {
    console.log("⚠️  No OVERDUE or DUE_SOON meetings found in sheet.")
    console.log("   Using dummy data instead...\n")
    // fallback to dummy
    const dummyRows = [
      {
        meetingId: "dummy_1", buyerName: "Al Madeena Trading", country: "UAE",
        tier: "TIER1", responsiblePerson: "Mohit Gupta",
        nextDueDate: "2026-05-05", daysRemaining: -8, displayStatus: "OVERDUE" as const,
      },
      {
        meetingId: "dummy_2", buyerName: "Setara Limited", country: "UK",
        tier: "TIER1", responsiblePerson: "Mohit Gupta",
        nextDueDate: "2026-05-10", daysRemaining: -3, displayStatus: "OVERDUE" as const,
      },
      {
        meetingId: "dummy_3", buyerName: "XYZ Foods Qatar", country: "Qatar",
        tier: "TIER2", responsiblePerson: "Mohit Gupta",
        nextDueDate: "2026-05-17", daysRemaining: 4, displayStatus: "DUE_SOON" as const,
      },
    ]

    console.log("📤 Sending Responsible Person email (dummy data)...")
    const r1 = await sendConsolidatedEmail({
      personName: "Mohit Gupta", personEmail: TEST_EMAIL,
      role: "responsible", meetings: dummyRows,
    })
    console.log(`   ${r1.ok ? "✓ SENT" : `✗ ${r1.reason}`}`)

    console.log("📤 Sending Sales Coordinator email (dummy data)...")
    const r2 = await sendConsolidatedEmail({
      personName: "Atif (Coordinator)", personEmail: TEST_EMAIL,
      role: "coordinator", meetings: dummyRows,
    })
    console.log(`   ${r2.ok ? "✓ SENT" : `✗ ${r2.reason}`}`)
    return
  }

  console.log(`Found ${eligible.length} eligible meetings from sheet.\n`)

  // 2. Build rows with Done tokens for both emails
  async function buildRows(meetings: typeof eligible) {
    return Promise.all(meetings.map(async m => {
      let doneUrl: string | undefined
      try {
        const token = await createDoneToken(m.id, m.buyerName)
        doneUrl = `${APP_BASE_URL}/meeting-done/${encodeURIComponent(m.id)}?token=${token}`
      } catch { /* skip */ }
      return {
        meetingId:         m.id,
        buyerName:         m.buyerName,
        country:           m.country,
        tier:              m.tier,
        responsiblePerson: m.responsiblePerson,
        nextDueDate:       m.nextDueDate,
        daysRemaining:     m.daysRemaining,
        displayStatus:     m.displayStatus as "OVERDUE" | "DUE_SOON",
        doneUrl,
      }
    }))
  }

  const respRows = await buildRows(eligible)

  console.log("📤 Sending RESPONSIBLE PERSON email...")
  console.log(`   → ${TEST_EMAIL}`)
  console.log(`   Buyers in list: ${respRows.length}`)
  const r1 = await sendConsolidatedEmail({
    personName:  "Mohit Gupta",
    personEmail: TEST_EMAIL,
    role:        "responsible",
    meetings:    respRows,
  })
  console.log(`   ${r1.ok ? "✓ SENT SUCCESSFULLY" : `✗ FAILED: ${r1.reason}`}\n`)

  // 3. Build rows for Coordinator email (same tokens)
  const coordRows = await buildRows(eligible)

  console.log("📤 Sending SALES COORDINATOR email...")
  console.log(`   → ${TEST_EMAIL}`)
  console.log(`   Buyers in list: ${coordRows.length}`)
  const r2 = await sendConsolidatedEmail({
    personName:  "Sales Coordinator",
    personEmail: TEST_EMAIL,
    role:        "coordinator",
    meetings:    coordRows,
  })
  console.log(`   ${r2.ok ? "✓ SENT SUCCESSFULLY" : `✗ FAILED: ${r2.reason}`}\n`)

  console.log("═".repeat(70))
  console.log(`✅ Done! Check inbox: ${TEST_EMAIL}`)
  console.log("   Email 1 = Responsible Person view (plain list)")
  console.log("   Email 2 = Sales Coordinator view (plain list + Responsible Person column)\n")
}

main().catch(e => {
  console.error("\n💥 Error:", e.message)
  process.exit(1)
})
