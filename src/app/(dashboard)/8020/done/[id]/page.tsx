/**
 * /8020/done/[id]
 *
 * Dedicated one-click "Mark as Done" page linked from reminder emails.
 * Sales coordinator opens email → clicks CTA → lands here → fills outcome →
 * submits → sees confirmation with an Undo button.
 *
 * Server-side: enforces auth (redirect to /login with callback), reads the
 * meeting by id, hands off to the client form.
 */

import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { getMeetingSchedules } from "@/lib/data"
import { MarkDonePageClient } from "./done-client"
import type { AppUser } from "@/types"

export default async function MarkDonePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) {
    // Bounce through login then back here
    redirect(`/login?callbackUrl=${encodeURIComponent(`/8020/done/${id}`)}`)
  }

  const all     = await getMeetingSchedules()
  const meeting = all.find((m) => m.id === id)
  if (!meeting) notFound()

  return (
    <MarkDonePageClient
      meeting={meeting}
      user={session.user as unknown as AppUser}
    />
  )
}
