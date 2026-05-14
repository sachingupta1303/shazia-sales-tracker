/**
 * POST /api/8020/regen-tokens
 *
 * Admin-only endpoint — requires valid session.
 * Clears all existing Done tokens and generates fresh ones for every
 * active meeting. Returns the new token URLs so the caller can see them.
 */
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { regenAllDoneTokens } from "@/lib/data"
import { APP_BASE_URL } from "@/lib/mailer"

export const dynamic = "force-dynamic"

export async function POST() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const tokenMap = await regenAllDoneTokens()

    const links: { meetingId: string; doneUrl: string }[] = []
    for (const [meetingId, token] of tokenMap) {
      links.push({
        meetingId,
        doneUrl: `${APP_BASE_URL}/meeting-done/${encodeURIComponent(meetingId)}?token=${token}`,
      })
    }

    return NextResponse.json({
      ok:      true,
      count:   links.length,
      message: `Regenerated ${links.length} tokens. All Done buttons in the next email will work permanently.`,
      links,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
