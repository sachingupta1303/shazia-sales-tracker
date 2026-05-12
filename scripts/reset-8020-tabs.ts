/**
 * Clears MEETING_SCHEDULE_8020 + MEETING_HISTORY_8020 + ALERT_LOG_8020 tabs
 * (keeps headers) and re-bootstraps with the new staggered + backlog logic.
 *
 * Run with: npx tsx scripts/reset-8020-tabs.ts
 *
 * WARNING: This wipes existing meeting state. Only run during fresh setup.
 */
import { config } from "dotenv"
config({ path: ".env.local" })

async function main() {
  const { google } = await import("googleapis")

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const sheets = google.sheets({ version: "v4", auth })
  const spreadsheetId = process.env.SALES_TRACKING_SHEET_ID!

  console.log("\n🗑️  Clearing meeting tabs (keeping headers)...\n")

  const TABS = ["MEETING_SCHEDULE_8020", "MEETING_HISTORY_8020", "ALERT_LOG_8020"]
  for (const tab of TABS) {
    try {
      // Clear everything below row 1 (headers row stays)
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${tab}!A2:Z`,
      })
      console.log(`  ✓ Cleared ${tab}`)
    } catch (e: unknown) {
      console.log(`  ⚠ ${tab}: ${(e as Error).message}`)
    }
  }

  console.log("\n♻️  Re-bootstrapping with new staggered + backlog logic...\n")
  const { getMeetingSchedules } = await import("../src/lib/data")
  const meetings = await getMeetingSchedules()

  // Stats
  const withBacklog = meetings.filter((m) => m.history.length > 0).length
  const tierCount = {
    TIER1: meetings.filter((m) => m.tier === "TIER1").length,
    TIER2: meetings.filter((m) => m.tier === "TIER2").length,
    TIER3: meetings.filter((m) => m.tier === "TIER3").length,
  }

  console.log(`✓ Re-created ${meetings.length} schedule rows`)
  console.log(`  Tier 1: ${tierCount.TIER1} · Tier 2: ${tierCount.TIER2} · Tier 3: ${tierCount.TIER3}`)
  console.log(`  ${withBacklog} buyers have auto-bootstrap history entries`)

  // Show how stagger spreads next due dates
  const dueGroups: Record<string, number> = {}
  for (const m of meetings) dueGroups[m.nextDueDate] = (dueGroups[m.nextDueDate] ?? 0) + 1
  const sorted = Object.entries(dueGroups).sort(([a], [b]) => a.localeCompare(b))
  console.log(`\nNext-due-date distribution (showing stagger spread):`)
  for (const [date, count] of sorted.slice(0, 15)) {
    const bar = "█".repeat(count)
    console.log(`  ${date}: ${bar} (${count})`)
  }
  if (sorted.length > 15) console.log(`  ... and ${sorted.length - 15} more dates`)

  console.log(`\n✅ Done. Refresh /8020 to see the updated schedule.`)
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message)
  console.error(e.stack)
  process.exit(1)
})
