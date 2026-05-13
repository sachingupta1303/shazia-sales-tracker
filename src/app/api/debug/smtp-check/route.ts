/**
 * GET /api/debug/smtp-check
 *
 * Shows which SMTP env vars Vercel can actually see at runtime.
 * Never logs values — only presence + length. Safe to leave in production.
 */
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

function envStat(key: string) {
  const val = process.env[key]
  if (val === undefined) return { present: false, length: 0 }
  if (val === "")        return { present: true,  length: 0, empty: true }
  return { present: true, length: val.length }
}

export async function GET() {
  const vars = {
    SMTP_HOST:    envStat("SMTP_HOST"),
    SMTP_PORT:    envStat("SMTP_PORT"),
    SMTP_USER:    envStat("SMTP_USER"),
    SMTP_PASS:    envStat("SMTP_PASS"),
    SMTP_SECURE:  envStat("SMTP_SECURE"),
    SMTP_FROM:    envStat("SMTP_FROM"),
    SMTP_REPLY_TO: envStat("SMTP_REPLY_TO"),
    APP_BASE_URL: envStat("APP_BASE_URL"),
  }

  // Derived: is SMTP "configured" by the same logic as mailer.ts?
  const configured =
    vars.SMTP_HOST.present && !vars.SMTP_HOST.empty &&
    vars.SMTP_USER.present && !vars.SMTP_USER.empty &&
    vars.SMTP_PASS.present && !vars.SMTP_PASS.empty

  // Show first 3 chars of HOST/USER so we can confirm it's the right value (safe)
  const hints = {
    SMTP_HOST_prefix: (process.env.SMTP_HOST ?? "").slice(0, 6) || "(empty)",
    SMTP_USER_prefix: (process.env.SMTP_USER ?? "").slice(0, 8) || "(empty)",
    SMTP_PORT_value:  process.env.SMTP_PORT ?? "(not set)",
  }

  return NextResponse.json({
    configured,
    vars,
    hints,
    nodeEnv:   process.env.NODE_ENV,
    checkedAt: new Date().toISOString(),
  })
}
