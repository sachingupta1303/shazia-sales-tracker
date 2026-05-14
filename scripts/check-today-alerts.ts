import { config } from "dotenv"
config({ path: ".env.local" })

async function main() {
  const { getAlertLogRows } = await import("../src/lib/data")
  const { todayIST } = await import("../src/lib/8020-batch")

  const today = todayIST()
  console.log(`\n📋 ALERT_LOG_8020 entries for ${today}:\n`)

  const rows = await getAlertLogRows(today)
  if (!rows.length) {
    console.log("⚠️  No emails sent today yet.")
    return
  }

  console.log(`Total: ${rows.length} emails today\n`)
  for (const r of rows) {
    const time = r.createdAt ? new Date(r.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "?"
    console.log(`  ${r.status === "SENT" ? "✓" : "✗"} ${r.emailTo.padEnd(35)} ${r.buyerName.padEnd(40)} ${time}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
