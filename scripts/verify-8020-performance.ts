/**
 * Confirms that getMeetingSchedules now returns real performance data
 * (target + actual + achievement %) joined from PI_BACKEND_MASTER.
 */
import { config } from "dotenv"
config({ path: ".env.local" })

async function main() {
  const { getMeetingSchedules } = await import("../src/lib/data")
  console.log("\n📊 Fetching enriched meeting schedules...\n")
  const meetings = await getMeetingSchedules()
  console.log(`Total monitored buyers: ${meetings.length}\n`)

  const totalTarget = meetings.reduce((s, m) => s + m.target, 0)
  const totalActual = meetings.reduce((s, m) => s + m.actual, 0)
  const pct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0

  console.log(`Overall performance (FY 2026-27):`)
  console.log(`  Total Target: ${totalTarget.toLocaleString()} containers`)
  console.log(`  Total Actual: ${totalActual.toLocaleString()} containers`)
  console.log(`  Achievement:  ${pct}%`)

  console.log(`\nTop 8 buyers by target:`)
  const top = [...meetings].sort((a, b) => b.target - a.target).slice(0, 8)
  console.log(`\n${"#".padEnd(3)}${"Buyer".padEnd(40)}${"Tier".padEnd(8)}${"Target".padEnd(10)}${"Actual".padEnd(10)}${"Ach%".padEnd(8)}Status`)
  console.log("─".repeat(95))
  top.forEach((m, i) => {
    const name = m.buyerName.length > 38 ? m.buyerName.slice(0, 35) + "..." : m.buyerName
    console.log(
      `${String(i + 1).padEnd(3)}` +
      `${name.padEnd(40)}` +
      `${m.tier.padEnd(8)}` +
      `${String(m.target).padEnd(10)}` +
      `${String(m.actual).padEnd(10)}` +
      `${(m.achievementPct + "%").padEnd(8)}` +
      `${m.performanceStatus}`
    )
  })

  // How many have any actual sales?
  const withActuals = meetings.filter((m) => m.actual > 0).length
  console.log(`\n✓ ${withActuals}/${meetings.length} buyers have at least 1 container shipped this FY`)
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message)
  process.exit(1)
})
