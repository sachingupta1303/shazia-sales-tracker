/**
 * Sends 80/20 meeting reminder emails for all buyers whose next meeting is
 * DUE_SOON (within 5 days) or OVERDUE. Uses the same logic as the daily cron.
 *
 * Recipients: Responsible Person email + Sales Coordinator email (per buyer)
 * Dedupe:     ALERT_LOG_8020 (same email + date = skipped)
 *
 * Run: npx tsx scripts/send-8020-reminders.ts
 */
import { config } from "dotenv"
config({ path: ".env.local" })

async function main() {
  console.log("\n" + "═".repeat(70))
  console.log("📧  80/20 KEY ACCOUNT — REMINDER EMAIL DISPATCH")
  console.log("═".repeat(70))

  const {
    getMeetingSchedules,
    getAlertLogRows,
    addAlertLogEntry,
  } = await import("../src/lib/data")
  const { sendMeetingReminderEmail } = await import("../src/lib/email-8020")
  const { verifySmtp } = await import("../src/lib/mailer")

  // 0. SMTP sanity check
  const v = await verifySmtp()
  if (!v.ok) {
    console.error(`\n❌ SMTP not ready: ${v.error}`)
    process.exit(1)
  }
  console.log("\n✓ SMTP connection verified\n")

  const todayISO = new Date().toISOString().split("T")[0]
  const meetings = await getMeetingSchedules()

  const dueSoonOrOverdue = meetings.filter(
    (m) => m.displayStatus === "DUE_SOON" || m.displayStatus === "OVERDUE"
  )

  console.log(`Total monitored buyers:  ${meetings.length}`)
  console.log(`Eligible for reminder:   ${dueSoonOrOverdue.length} (OVERDUE + DUE_SOON within 5 days)`)
  console.log(`  • OVERDUE: ${meetings.filter((m) => m.displayStatus === "OVERDUE").length}`)
  console.log(`  • DUE_SOON: ${meetings.filter((m) => m.displayStatus === "DUE_SOON").length}\n`)

  if (!dueSoonOrOverdue.length) {
    console.log("✅ No buyers currently need reminders. (Everyone is either upcoming or already alerted today.)")
    return
  }

  // Build dedup set: meetingId|email already sent today
  const todaysAlerts = await getAlertLogRows(todayISO)
  const sentToday = new Set(todaysAlerts.map((a) => `${a.meetingId}|${a.emailTo}`))

  let sent = 0, skipped = 0, failed = 0
  const sentBuyers: string[] = []

  for (const m of dueSoonOrOverdue) {
    const recipients: string[] = []
    if (m.responsibleEmail) recipients.push(m.responsibleEmail)
    if (m.coordinatorEmail && m.coordinatorEmail !== m.responsibleEmail) {
      recipients.push(m.coordinatorEmail)
    }

    if (!recipients.length) {
      console.log(`  ⚠️  ${m.buyerName} — no email addresses, skipped`)
      continue
    }

    // Dedup: if all recipients already got an alert today, skip the whole send
    const allDedup = recipients.every((email) => sentToday.has(`${m.id}|${email}`))
    if (allDedup) {
      console.log(`  ⏭️  ${m.buyerName} — already alerted today, skipped`)
      skipped += recipients.length
      continue
    }

    process.stdout.write(`  📤 ${m.buyerName.padEnd(40).slice(0, 40)} [${m.tier}] → `)

    const { ok, reason } = await sendMeetingReminderEmail({
      meetingId:         m.id,
      buyerName:         m.buyerName,
      country:           m.country,
      tier:              m.tier,
      nextDueDate:       new Date(m.nextDueDate),
      daysRemaining:     m.daysRemaining,
      responsiblePerson: m.responsiblePerson,
      responsibleEmail:  m.responsibleEmail,
      salesCoordinator:  m.salesCoordinator,
      coordinatorEmail:  m.coordinatorEmail,
      target:            m.target,
      actual:            m.actual,
      achievementPct:    m.achievementPct,
      lastMeetingDate:   m.lastMeetingDate,
    })

    // Log each recipient to the alert log
    for (const email of recipients) {
      if (sentToday.has(`${m.id}|${email}`)) continue
      await addAlertLogEntry({
        meetingId: m.id,
        buyerName: m.buyerName,
        alertDate: todayISO,
        emailTo:   email,
        status:    ok ? "SENT" : "FAILED",
      })
    }

    if (ok) {
      sent += recipients.length
      sentBuyers.push(m.buyerName)
      console.log(`✓ ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`)
    } else {
      failed += recipients.length
      console.log(`✗ ${reason}`)
    }
  }

  console.log("\n" + "═".repeat(70))
  console.log("📊 SUMMARY")
  console.log("═".repeat(70))
  console.log(`  Emails sent:    ${sent}`)
  console.log(`  Skipped (dedup): ${skipped}`)
  console.log(`  Failed:         ${failed}`)
  console.log(`  Total buyers:   ${sentBuyers.length}`)

  if (sentBuyers.length) {
    console.log(`\nBuyers notified:`)
    sentBuyers.forEach((b) => console.log(`  • ${b}`))
  }

  console.log("\n✅ Done. All alerts logged to ALERT_LOG_8020 sheet.")
  console.log("   Reminder cycle: emails continue daily until 'Done' is clicked.\n")
}

main().catch((e) => {
  console.error("\n💥 Error:", e.message)
  console.error(e.stack)
  process.exit(1)
})
