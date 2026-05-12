/**
 * Tests the FULL email pipeline using Ethereal (Nodemailer's free test SMTP).
 * Ethereal generates temporary credentials, accepts mail, and gives a preview URL.
 * No real email is sent — proves the code & template are correct.
 *
 * Run: npx tsx scripts/test-smtp-ethereal.ts
 */
import { config } from "dotenv"
config({ path: ".env.local" })

import nodemailer from "nodemailer"

async function main() {
  console.log("\n📧 Testing 80/20 email pipeline with Ethereal...\n")

  // 1. Create a one-shot Ethereal account
  const testAccount = await nodemailer.createTestAccount()
  console.log(`✓ Ethereal account created: ${testAccount.user}`)

  // 2. Inject Ethereal credentials so mailer.ts picks them up
  process.env.SMTP_HOST  = testAccount.smtp.host
  process.env.SMTP_PORT  = String(testAccount.smtp.port)
  process.env.SMTP_USER  = testAccount.user
  process.env.SMTP_PASS  = testAccount.pass
  process.env.SMTP_FROM  = "Shazia Rice Alerts <alerts@shaziarice.com>"
  process.env.SMTP_SECURE = testAccount.smtp.secure ? "true" : "false"

  // 3. Dynamic-import mailer + 80/20 email sender AFTER env is set
  const { verifySmtp }              = await import("../src/lib/mailer")
  const { sendMeetingReminderEmail } = await import("../src/lib/email-8020")

  const v = await verifySmtp()
  console.log(`✓ SMTP verify: ${v.ok ? "OK" : v.error}`)
  if (!v.ok) process.exit(1)

  // 4. Send a realistic 80/20 reminder using actual buyer data shape
  console.log(`\n📤 Sending test meeting reminder...`)
  const result = await sendMeetingReminderEmail({
    buyerName:         "Suncons Trading & Contracting Wll",
    country:           "QATAR",
    tier:              "TIER1",
    nextDueDate:       new Date("2026-05-17"),
    daysRemaining:     5,
    responsiblePerson: "mohit gupta",
    responsibleEmail:  "mohit.gupta@shaziarice.com",
    salesCoordinator:  "SAWANTI BOSE",
    coordinatorEmail:  "crm@shaziarice.com",
  })

  console.log("\nResult:", JSON.stringify(result, null, 2))

  if (!result.ok) {
    console.error("\n❌ Send failed")
    process.exit(1)
  }

  console.log("\n" + "═".repeat(70))
  console.log("✅ EMAIL PIPELINE WORKING!")
  console.log("═".repeat(70))
  console.log("\nThis exact email would go to BOTH:")
  console.log("  → mohit.gupta@shaziarice.com  (Responsible Person)")
  console.log("  → crm@shaziarice.com          (Sales Coordinator)")
  if (result.previewUrl) {
    console.log("\n🔗 See the actual rendered email here (Ethereal web inbox):\n")
    console.log(`   ${result.previewUrl}\n`)
  }
}

main().catch((e) => {
  console.error("\n💥 Error:", e.message)
  console.error(e.stack)
  process.exit(1)
})
