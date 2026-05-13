/**
 * /meeting-done/[id]?token=xxx
 *
 * PUBLIC page — no login required.
 * Sales coordinators land here from the email reminder button.
 * Token is validated server-side; if invalid → error message shown.
 */

import { validateDoneToken, getMeetingSchedules } from "@/lib/data"
import { MeetingDoneClient } from "./meeting-done-client"

export const dynamic = "force-dynamic"

export default async function MeetingDonePage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { id }    = await params
  const { token } = await searchParams

  // No token → expired / direct link
  if (!token) {
    return <ErrorPage message="This link is missing its security token. Please use the button in the reminder email." />
  }

  // Validate token
  const validMeetingId = await validateDoneToken(token)
  if (!validMeetingId || validMeetingId !== id) {
    return <ErrorPage message="This link has already been used or has expired (links are valid for 7 days). If the meeting hasn't been recorded yet, please contact your manager or log in to the tracker." />
  }

  // Load meeting data
  const all     = await getMeetingSchedules()
  const meeting = all.find((m) => m.id === id)
  if (!meeting) {
    return <ErrorPage message="Meeting not found. It may have been removed from the system." />
  }

  return <MeetingDoneClient meeting={meeting} token={token} />
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-red-200 p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-2xl mx-auto">
          ⚠️
        </div>
        <h1 className="text-lg font-bold text-gray-900">Link Not Valid</h1>
        <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
        <p className="text-xs text-gray-400">Shazia Rice · 80/20 Key Account System</p>
      </div>
    </div>
  )
}
