/**
 * Tests the FULL consolidated email pipeline using Ethereal (Nodemailer's free test SMTP).
 * Sends TWO emails: one Responsible Person view, one Sales Coordinator view (with Done buttons).
 * No real email is sent — proves the code & template are correct.
 *
 * Run: npx tsx scripts/test-smtp-ethereal.ts
 */
import { config } from "dotenv"
config({ path: ".env.local" })

import nodemailer from "nodemailer"

async function main() {
  console.log("\n📧 Testing 80/20 consolidated email pipeline with Ethereal...\n")

  // 1. Create a one-shot Ethereal account
  const testAccount = await nodemailer.createTestAccount()
  console.log(`✓ Ethereal account created: ${testAccount.user}`)

  // 2. Inject Ethereal credentials so mailer.ts picks them up
  process.env.SMTP_HOST   = testAccount.smtp.host
  process.env.SMTP_PORT   = String(testAccount.smtp.port)
  process.env.SMTP_USER   = testAccount.user
  process.env.SMTP_PASS   = testAccount.pass
  process.env.SMTP_FROM   = "Shazia Rice Alerts <alerts@shaziarice.com>"
  process.env.SMTP_SECURE = testAccount.smtp.secure ? "true" : "false"

  // 3. Dynamic-import after env is set
  const { verifySmtp }         = await import("../src/lib/mailer")
  const { sendConsolidatedEmail } = await import("../src/lib/email-8020")

  const v = await verifySmtp()
  console.log(`✓ SMTP verify: ${v.ok ? "OK" : v.error}`)
  if (!v.ok) process.exit(1)

  // 4. Test data — two meetings
  const testMeetings = [
    {
      meetingId:         "suncons_qatar",
      buyerName:         "Suncons Trading & Contracting Wll",
      country:           "Qatar",
      tier:              "TIER1",
      responsiblePerson: "Mohit Gupta",
      nextDueDate:       "2026-05-10",
      daysRemaining:     -3,
      displayStatus:     "OVERDUE" as const,
    },
    {
      meetingId:         "almaridah_uae",
      buyerName:         "Al Maridah Trading",
      country:           "UAE",
      tier:              "TIER2",
      responsiblePerson: "Mohit Gupta",
      nextDueDate:       "2026-05-17",
      daysRemaining:     4,
      displayStatus:     "DUE_SOON" as const,
    },
  ]

  // 5. Send Responsible Person email (no done buttons)
  console.log(`\n📤 Sending Responsible Person consolidated email...`)
  const r1 = await sendConsolidatedEmail({
    personName:  "Mohit Gupta",
    personEmail: testAccount.user,
    role:        "responsible",
    meetings:    testMeetings,
  })
  console.log(`Result: ${r1.ok ? "✓ SENT" : `✗ ${r1.reason}`}`)
  if ((r1 as { previewUrl?: string }).previewUrl) console.log(`   Preview: ${(r1 as { previewUrl?: string }).previewUrl}`)

  // 6. Send Coordinator email
  const coordMeetings = testMeetings.map((m) => ({ ...m }))
  console.log(`\n📤 Sending Sales Coordinator consolidated email...`)
  const r2 = await sendConsolidatedEmail({
    personName:  "Atif Coordinator",
    personEmail: testAccount.user,
    role:        "coordinator",
    meetings:    coordMeetings,
  })
  console.log(`Result: ${r2.ok ? "✓ SENT" : `✗ ${r2.reason}`}`)
  if ((r2 as { previewUrl?: string }).previewUrl) console.log(`   Preview: ${(r2 as { previewUrl?: string }).previewUrl}`)

  console.log("\n" + "═".repeat(70))
  if (r1.ok && r2.ok) {
    console.log("✅ BOTH EMAILS SENT SUCCESSFULLY!")
  } else {
    console.log("⚠️  Some emails failed — check output above")
  }
  console.log("═".repeat(70) + "\n")
}

main().catch((e) => {
  console.error("\n💥 Error:", e.message)
  console.error(e.stack)
  process.exit(1)
})
