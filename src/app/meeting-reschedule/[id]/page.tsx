/**
 * /meeting-reschedule/[id]?token=xxx
 *
 * PUBLIC page — no login required.
 * Same token as Done button — HMAC based, permanent.
 */

import { validateDoneToken, getMeetingSchedules } from "@/lib/data"
import { MeetingRescheduleClient } from "./meeting-reschedule-client"

export const dynamic = "force-dynamic"

export default async function MeetingReschedulePage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { id }    = await params
  const { token } = await searchParams

  if (!token)
    return <ErrorPage message="This link is missing its security token. Please use the Reschedule button in the reminder email." />

  const validId = await validateDoneToken(token, id)
  if (!validId || validId !== id)
    return <ErrorPage message="Link not valid. Please use the Reschedule button from the latest reminder email." />

  const all     = await getMeetingSchedules()
  const meeting = all.find((m) => m.id === id)
  if (!meeting)
    return <ErrorPage message="Meeting not found. It may have been removed from the system." />

  return <MeetingRescheduleClient meeting={meeting} token={token} />
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-red-200 p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-2xl mx-auto">⚠️</div>
        <h1 className="text-lg font-bold text-gray-900">Link Not Valid</h1>
        <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
        <p className="text-xs text-gray-400">Shazia Rice · 80/20 Key Account System</p>
      </div>
    </div>
  )
}
