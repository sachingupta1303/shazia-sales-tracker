/**
 * Forces creation of the 3 meeting-tracking tabs in the SALES_TRACKING sheet
 * and seeds an initial schedule row for every Tier-1/2/3 buyer.
 *
 * Run with: npx tsx scripts/bootstrap-8020-tabs.ts
 */
import { config } from "dotenv"
config({ path: ".env.local" })

async function main() {
  console.log("\n🚀 Bootstrapping 80/20 meeting tabs...\n")
  console.log(`Spreadsheet ID: ${process.env.SALES_TRACKING_SHEET_ID}\n`)

  const { getMeetingSchedules, getAlertLogRows } = await import("../src/lib/data")
  const meetings = await getMeetingSchedules()
  await getAlertLogRows()  // touch this to trigger ALERT_LOG_8020 tab creation

  console.log(`✓ Total monitored buyers: ${meetings.length}`)
  console.log(`  Tier 1: ${meetings.filter((m) => m.tier === "TIER1").length}`)
  console.log(`  Tier 2: ${meetings.filter((m) => m.tier === "TIER2").length}`)
  console.log(`  Tier 3: ${meetings.filter((m) => m.tier === "TIER3").length}`)

  console.log(`\nSample schedule (first 3 buyers):`)
  for (const m of meetings.slice(0, 3)) {
    console.log(`  • ${m.buyerName} (${m.country}) [${m.tier}]`)
    console.log(`      Next due: ${m.nextDueDate}  Days: ${m.daysRemaining}  Status: ${m.displayStatus}`)
  }

  console.log(`\n✅ Done. Refresh your Google Sheet to see 3 new tabs:`)
  console.log(`   - MEETING_SCHEDULE_8020`)
  console.log(`   - MEETING_HISTORY_8020`)
  console.log(`   - ALERT_LOG_8020`)
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message)
  console.error(e.stack)
  process.exit(1)
})
