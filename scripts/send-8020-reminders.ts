/**
 * Sends 80/20 consolidated meeting reminder emails.
 * One email per Responsible Person + one per Sales Coordinator.
 *
 * Uses the same runReminderBatch() logic as the daily cron.
 *
 * Run: npx tsx scripts/send-8020-reminders.ts
 * Run (force, bypass office hours): npx tsx scripts/send-8020-reminders.ts --force
 */
import { config } from "dotenv"
config({ path: ".env.local" })

async function main() {
  const force = process.argv.includes("--force")

  console.log("\n" + "═".repeat(70))
  console.log("📧  80/20 KEY ACCOUNT — CONSOLIDATED REMINDER EMAIL DISPATCH")
  console.log("═".repeat(70))
  if (force) console.log("  ⚡ Force mode: bypassing office-hours + 2h gap checks\n")

  const { runReminderBatch } = await import("../src/lib/8020-batch")
  const { verifySmtp }       = await import("../src/lib/mailer")

  const v = await verifySmtp()
  if (!v.ok) {
    console.error(`\n❌ SMTP not ready: ${v.error}`)
    process.exit(1)
  }
  console.log("✓ SMTP connection verified\n")

  const result = await runReminderBatch({ force })

  if (result.skipped) {
    console.log(`⏭️  Batch skipped: ${result.skipReason}`)
  } else {
    console.log(`Total eligible buyers:  ${result.candidates}`)
    console.log(`Persons emailed:        ${result.batchSize}`)
    console.log(`Emails sent:            ${result.sent}`)
    console.log(`Emails failed:          ${result.failed}`)
    console.log("")
    for (const p of result.buyersSent) {
      const icon = p.status === "SENT" ? "✓" : "✗"
      console.log(`  ${icon} ${p.buyerName.padEnd(30)} [${p.tier}] — ${p.recipients} meeting${p.recipients === 1 ? "" : "s"}`)
    }
  }

  console.log("\n" + "═".repeat(70))
  console.log("✅ Done. All alerts logged to ALERT_LOG_8020 sheet.")
  console.log("   Each person receives max 1 consolidated email per day.\n")
}

main().catch((e) => {
  console.error("\n💥 Error:", e.message)
  console.error(e.stack)
  process.exit(1)
})
