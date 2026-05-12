/**
 * Local "day-long batch loop" for 80/20 reminders.
 *
 * Behaviour: starts now, sends one batch (2–3 buyers), then sleeps ~BATCH_GAP_MIN
 * minutes and repeats — staying inside 9:30 AM – 6:00 PM IST. Outside that window
 * it just sleeps until the next office-hour tick. Stops automatically once every
 * eligible buyer has been alerted today (dedup'd via ALERT_LOG_8020).
 *
 * Run:   npx tsx scripts/send-8020-batch-loop.ts
 * Stop:  Ctrl+C
 *
 * For a Vercel-deployed setup, use vercel.json cron + /api/8020/cron-batch instead.
 */
import { config } from "dotenv"
config({ path: ".env.local" })

const BATCH_GAP_MIN     = 150   // 2.5 hours between batches
const POLL_SLEEP_MIN    = 15    // when waiting for office hours to open
const FORCE             = process.argv.includes("--force")
const BATCH_SIZE        = (() => {
  const flag = process.argv.find((a) => a.startsWith("--batch="))
  return flag ? Math.max(1, parseInt(flag.split("=")[1], 10)) : 3
})()

async function main() {
  const { runReminderBatch, isOfficeHoursIST } = await import("../src/lib/8020-batch")
  const { verifySmtp } = await import("../src/lib/mailer")

  console.log("\n" + "═".repeat(72))
  console.log("📧  80/20 BATCHED REMINDER LOOP")
  console.log("═".repeat(72))
  console.log(`  Batch size:    ${BATCH_SIZE} buyers`)
  console.log(`  Batch gap:     ${BATCH_GAP_MIN} min`)
  console.log(`  Office hours:  09:30 – 18:00 IST${FORCE ? "  (BYPASSED via --force)" : ""}`)
  console.log("═".repeat(72) + "\n")

  const v = await verifySmtp()
  if (!v.ok) { console.error(`❌ SMTP not ready: ${v.error}`); process.exit(1) }
  console.log("✓ SMTP verified\n")

  let tick = 0
  while (true) {
    tick++
    const stamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })
    console.log(`\n── Tick #${tick} @ ${stamp} IST ──`)

    if (!FORCE && !isOfficeHoursIST()) {
      console.log(`  ⏸  Outside office hours — sleeping ${POLL_SLEEP_MIN} min`)
      await sleep(POLL_SLEEP_MIN * 60_000)
      continue
    }

    const result = await runReminderBatch({ force: FORCE, batchSize: BATCH_SIZE })

    if (result.skipped) {
      console.log(`  ⏭  ${result.skipReason}`)
      // Nothing pending — if it's "all alerted today" we're done for the day.
      // If it's "outside hours" we already handled above. Otherwise sleep longer.
      if (result.skipReason?.startsWith("All ") || result.skipReason?.startsWith("No buyers")) {
        console.log("\n✅ Done for today — every eligible buyer has been alerted.")
        return
      }
      await sleep(POLL_SLEEP_MIN * 60_000)
      continue
    }

    console.log(`  📦 Batch: ${result.batchSize} buyers · sent ${result.sent} · failed ${result.failed} · already-sent today ${result.alreadySent}`)
    for (const b of result.buyersSent) {
      const icon = b.status === "SENT" ? "✓" : "✗"
      console.log(`     ${icon} ${b.buyerName} [${b.tier}] → ${b.recipients} recipient${b.recipients === 1 ? "" : "s"}`)
    }

    console.log(`\n  💤 Sleeping ${BATCH_GAP_MIN} min before next batch…`)
    await sleep(BATCH_GAP_MIN * 60_000)
  }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

main().catch((e) => {
  console.error("\n💥", e?.message ?? e)
  if (e?.stack) console.error(e.stack)
  process.exit(1)
})
