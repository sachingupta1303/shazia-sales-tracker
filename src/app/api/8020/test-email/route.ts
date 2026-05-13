/**
 * GET /api/8020/test-email
 *
 * Manual test endpoint: verifies SMTP connection and sends a real test email
 * to the logged-in user. Useful before going live with the cron.
 */
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sendMail, verifySmtp } from "@/lib/mailer"

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // First, verify the SMTP connection (catches wrong credentials/host early)
  const verify = await verifySmtp()
  if (!verify.ok) {
    // Attach env-var presence info to help diagnose "not configured" errors
    const diagEnv = {
      SMTP_HOST:  !!(process.env.SMTP_HOST),
      SMTP_USER:  !!(process.env.SMTP_USER),
      SMTP_PASS:  !!(process.env.SMTP_PASS),
      SMTP_PORT:  process.env.SMTP_PORT ?? "(not set)",
      configured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    }
    return NextResponse.json({
      ok: false,
      step: "smtp_verify",
      error: verify.error,
      hint: "Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars",
      diagEnv,
    }, { status: 500 })
  }

  // Send a test message
  const result = await sendMail({
    to:      session.user.email,
    subject: "✅ SMTP test from Shazia Rice 80/20 Tracker",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 500px; padding: 20px;">
        <h2 style="color: #16a34a;">SMTP is working!</h2>
        <p style="color: #374151;">Hi ${session.user.name ?? session.user.email},</p>
        <p style="color: #374151;">This is a test email sent via nodemailer from the 80/20 Key Account tracker.</p>
        <p style="color: #6b7280; font-size: 13px;">
          If you're seeing this, the daily reminder cron is ready to go.
          It will send alerts to <strong>Responsible Person</strong> + <strong>Sales Coordinator</strong>
          5 days before each meeting's due date.
        </p>
        <p style="color: #9ca3af; font-size: 11px; margin-top: 24px;">
          Auto-generated · ${new Date().toISOString()}
        </p>
      </div>
    `,
  })

  return NextResponse.json({
    ok:        result.ok,
    sentTo:    session.user.email,
    messageId: result.messageId,
    reason:    result.reason,
    step:      result.ok ? "sent" : "send_failed",
  })
}
