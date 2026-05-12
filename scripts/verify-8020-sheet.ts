/**
 * Verifies that get8020Buyers() correctly parses the "80/20 Buyers" tab.
 * Run with: npx tsx scripts/verify-8020-sheet.ts
 */
import { config } from "dotenv"
config({ path: ".env.local" })

async function main() {
  // Dynamic import AFTER env vars are loaded (SHEETS reads process.env at import time)
  const { get8020Buyers } = await import("../src/lib/data")

  console.log("\n📋 Calling get8020Buyers()...\n")
  const buyers = await get8020Buyers()
  console.log(`Total parsed: ${buyers.length} buyers\n`)

  // Tier breakdown
  const tiers: Record<string, number> = {}
  for (const b of buyers) tiers[b.tier] = (tiers[b.tier] ?? 0) + 1
  console.log("Tier breakdown:")
  for (const [t, c] of Object.entries(tiers).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${t}: ${c}`)
  }
  console.log(`   → Monitored (T1+T2+T3): ${(tiers.TIER1 ?? 0) + (tiers.TIER2 ?? 0) + (tiers.TIER3 ?? 0)}`)

  // Show first 3 Tier-1 buyers fully parsed
  const t1 = buyers.filter((b) => b.tier === "TIER1").slice(0, 3)
  console.log(`\nSample Tier-1 buyers (parsed):`)
  for (const b of t1) {
    console.log(`\n  • ${b.buyerName} (${b.country})`)
    console.log(`    Responsible:  ${b.responsiblePerson || "—"} <${b.responsibleEmail || "—"}>`)
    console.log(`    Coordinator:  ${b.salesCoordinator || "—"} <${b.coordinatorEmail || "—"}>`)
    console.log(`    Target:       ${b.targetContainers} containers (annual: ${b.annualTarget})`)
    console.log(`    Notes:        ${b.notes || "—"}`)
  }

  // Sanity check: any T1/T2/T3 buyers missing responsible email?
  const missingEmail = buyers.filter(
    (b) => b.tier !== "OTHERS" && !b.responsibleEmail
  )
  if (missingEmail.length) {
    console.log(`\n⚠️  ${missingEmail.length} monitored buyers missing responsible email:`)
    missingEmail.slice(0, 5).forEach((b) =>
      console.log(`   - ${b.buyerName} (${b.country}) [${b.tier}]`)
    )
    if (missingEmail.length > 5) console.log(`   ... and ${missingEmail.length - 5} more`)
  } else {
    console.log(`\n✓ All monitored buyers have responsible emails`)
  }
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message)
  console.error(e.stack)
  process.exit(1)
})
