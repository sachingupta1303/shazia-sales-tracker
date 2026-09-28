/**
 * /coord-review/[token]
 *
 * PUBLIC page — no login. Sales coordinators land here from the weekly review
 * email. The token (HMAC-signed) authorizes the coordinator's identity; the form
 * lists their "risk" buyers (no / low orders) to fill reasons for.
 */
import { verifyReviewToken, getRiskForCoordinator } from "@/lib/coordinator-review"
import { getCurrentFY, getCurrentFYWeek } from "@/lib/fy-utils"
import { getCoordinatorReviews } from "@/lib/data"
import { CoordReviewClient } from "./coord-review-client"

export const dynamic = "force-dynamic"

export default async function CoordReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const t = verifyReviewToken(token)
  if (!t) return <ErrorPage message="This link is not valid. Please use the button in the latest reminder email." />

  const fy   = getCurrentFY()
  const week = getCurrentFYWeek()
  const [group, weekReviews] = await Promise.all([
    getRiskForCoordinator(fy, t.coordinator),
    getCoordinatorReviews(fy, week),
  ])
  const mine = weekReviews.filter((r) => r.salesCoordinator.toLowerCase() === t.coordinator.toLowerCase())

  return (
    <CoordReviewClient
      token={token}
      coordinator={t.coordinator}
      fy={fy}
      week={week}
      buyers={group?.buyers ?? []}
      alreadySubmitted={mine.length > 0}
    />
  )
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-red-200 p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-2xl mx-auto">⚠️</div>
        <h1 className="text-lg font-bold text-gray-900">Link Not Valid</h1>
        <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
        <p className="text-xs text-gray-400">Shazia Rice · Weekly Coordinator Review</p>
      </div>
    </div>
  )
}
