/**
 * Verifies SMTP wiring without needing the Next.js dev server.
 *
 * What it does:
 *   1. Loads .env.local
 *   2. Checks if SMTP_HOST/USER/PASS are set
 *   3. If yes → tries to verify connection AND sends a real test email to SMTP_USER
 *   4. If no  → tells you exactly what env vars to add
 *
 * Run: npx tsx scripts/test-smtp.ts
 */
import { config } from "dotenv"
config({ path: ".env.local" })

async function main() {
  console.log("\n📧 SMTP Wiring Test\n" + "─".repeat(60))

  // 1. Check env vars
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM

  console.log("\nEnv var status:")
  console.log(`  SMTP_HOST:  ${host  ? "✓ " + host : "✗ MISSING"}`)
  console.log(`  SMTP_PORT:  ${port  ? "✓ " + port : "✗ MISSING (will default to 587)"}`)
  console.log(`  SMTP_USER:  ${user  ? "✓ " + user : "✗ MISSING"}`)
  console.log(`  SMTP_PASS:  ${pass  ? "✓ ***** (hidden, " + pass.length + " chars)" : "✗ MISSING"}`)
  console.log(`  SMTP_FROM:  ${from  ? "✓ " + from : "✗ MISSING (will default)"}`)

  if (!host || !user || !pass) {
    console.log("\n❌ Cannot test — SMTP credentials missing.\n")
    console.log("Add these to .env.local then re-run this script:\n")
    console.log("  SMTP_HOST=smtp.gmail.com")
    console.log("  SMTP_PORT=587")
    console.log("  SMTP_USER=alerts@shaziarice.com")
    console.log("  SMTP_PASS=xxxx-xxxx-xxxx-xxxx   ← App password from Google")
    console.log("  SMTP_FROM=Shazia Rice Alerts <alerts@shaziarice.com>")
    console.log("\nFor Gmail App Password: https://myaccount.google.com/apppasswords")
    process.exit(1)
  }

  // 2. Verify SMTP connection
  const { verifySmtp, sendMail } = await import("../src/lib/mailer")

  console.log("\n🔌 Verifying SMTP connection...")
  const verify = await verifySmtp()
  if (!verify.ok) {
    console.log(`❌ Verify failed: ${verify.error}`)
    console.log("\nCommon causes:")
    console.log("  • Wrong host/port (check provider's SMTP settings)")
    console.log("  • Wrong password / app-password expired")
    console.log("  • 2FA not enabled (Gmail/Google Workspace)")
    console.log("  • IP blocked by provider")
    process.exit(1)
  }
  console.log("✓ SMTP connection verified")

  // 3. Send a real test email to SMTP_USER (yourself)
  console.log(`\n📤 Sending test email to ${user}...`)
  const result = await sendMail({
    to:      user,
    subject: "✅ SMTP test from Shazia Rice 80/20 Tracker",
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:500px;padding:24px;background:#f9fafb">
        <div style="background:white;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
          <h2 style="color:#16a34a;margin:0 0 12px">✅ SMTP is working!</h2>
          <p style="color:#374151;line-height:1.5">
            This is a test email from the 80/20 Key Account meeting tracker.
          </p>
          <p style="color:#6b7280;font-size:13px;line-height:1.5">
            If you're reading this, the daily reminder cron is ready.
            It will send to both <strong>Responsible Person</strong> and
            <strong>Sales Coordinator</strong> 5 days before each meeting,
            daily until marked done.
          </p>
          <p style="color:#9ca3af;font-size:11px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px">
            Auto-generated · ${new Date().toLocaleString()}
          </p>
        </div>
      </div>
    `,
  })

  console.log("\nResult:")
  console.log(`  ok:        ${result.ok}`)
  console.log(`  messageId: ${result.messageId ?? "—"}`)
  console.log(`  reason:    ${result.reason ?? "—"}`)

  if (result.ok) {
    console.log(`\n✅ Test email sent! Check inbox of ${user} (also spam folder).`)
  } else {
    console.log(`\n❌ Send failed: ${result.reason}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error("\n💥 Unexpected error:", e.message)
  process.exit(1)
})
