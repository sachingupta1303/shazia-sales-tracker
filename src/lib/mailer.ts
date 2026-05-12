/**
 * Shared SMTP transport for the entire app (used by email.ts and email-8020.ts).
 *
 * Env vars (set in .env.local):
 *   SMTP_HOST            — required (e.g. "smtp.gmail.com", "smtp.office365.com", "smtp.shaziarice.com")
 *   SMTP_PORT            — required (587 for STARTTLS, 465 for SSL/TLS)
 *   SMTP_USER            — required (your SMTP login, e.g. "alerts@shaziarice.com")
 *   SMTP_PASS            — required (password or app-password)
 *   SMTP_FROM            — default "From" address shown to recipients (e.g. "Shazia Rice <alerts@shaziarice.com>")
 *   SMTP_REPLY_TO        — optional default reply-to
 *   SMTP_SECURE          — optional "true"/"false". If unset, derived from port (465 → true, else false)
 *   APP_BASE_URL         — used to build absolute action URLs in emails
 *
 * If any of HOST/USER/PASS is missing, sends become no-ops (logged to console).
 */

import nodemailer, { type Transporter } from "nodemailer"

const SMTP_HOST     = process.env.SMTP_HOST     ?? ""
const SMTP_PORT     = parseInt(process.env.SMTP_PORT ?? "587", 10)
const SMTP_USER     = process.env.SMTP_USER     ?? ""
const SMTP_PASS     = process.env.SMTP_PASS     ?? ""
const SMTP_SECURE_RAW = process.env.SMTP_SECURE
const SMTP_SECURE   = SMTP_SECURE_RAW
  ? SMTP_SECURE_RAW.toLowerCase() === "true"
  : SMTP_PORT === 465

export const MAIL_FROM     = process.env.SMTP_FROM     ?? "Shazia Rice <alerts@shaziarice.com>"
export const MAIL_REPLY_TO = process.env.SMTP_REPLY_TO ?? ""
export const APP_BASE_URL  = process.env.APP_BASE_URL  ?? "http://localhost:3000"

let cachedTransport: Transporter | null = null

function isConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS)
}

/** Returns a singleton nodemailer transport, or null if SMTP is not configured. */
export function getMailer(): Transporter | null {
  if (!isConfigured()) return null
  if (cachedTransport) return cachedTransport
  cachedTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
  return cachedTransport
}

/**
 * Send a single email. Returns `{ ok, reason? }`.
 * If SMTP isn't configured, this is a no-op (so the app still works in dev).
 */
export async function sendMail(opts: {
  to:      string | string[]
  subject: string
  html:    string
  replyTo?: string
  cc?:      string | string[]
}): Promise<{ ok: boolean; reason?: string; messageId?: string; previewUrl?: string }> {
  const tx = getMailer()
  if (!tx) {
    console.log(`[mailer] no-op (SMTP not configured) → ${opts.subject}`)
    return { ok: false, reason: "smtp_not_configured" }
  }
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to]
  if (!recipients.length || recipients.every((r) => !r)) {
    return { ok: false, reason: "no_recipients" }
  }
  try {
    const info = await tx.sendMail({
      from:    MAIL_FROM,
      to:      recipients.filter(Boolean),
      cc:      opts.cc,
      replyTo: opts.replyTo || MAIL_REPLY_TO || undefined,
      subject: opts.subject,
      html:    opts.html,
    })
    // getTestMessageUrl returns a real URL only for Ethereal test accounts
    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined
    return { ok: true, messageId: info.messageId, previewUrl: previewUrl || undefined }
  } catch (e: unknown) {
    console.error("[mailer] send failed:", (e as Error).message)
    return { ok: false, reason: (e as Error).message }
  }
}

/** Verify the SMTP connection — useful for a `/api/8020/test-email` endpoint. */
export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  const tx = getMailer()
  if (!tx) return { ok: false, error: "SMTP not configured (missing SMTP_HOST / SMTP_USER / SMTP_PASS)" }
  try {
    await tx.verify()
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }
}

/** HTML-escape user-supplied strings. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
}
