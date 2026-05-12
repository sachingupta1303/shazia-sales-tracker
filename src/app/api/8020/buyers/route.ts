import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { get8020Buyers } from "@/lib/data"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const buyers = await get8020Buyers()
  const monitored = buyers.filter((b) => b.tier !== "OTHERS")

  const counts = {
    tier1: buyers.filter((b) => b.tier === "TIER1").length,
    tier2: buyers.filter((b) => b.tier === "TIER2").length,
    tier3: buyers.filter((b) => b.tier === "TIER3").length,
    others: buyers.filter((b) => b.tier === "OTHERS").length,
  }

  return NextResponse.json({ buyers: monitored, counts, total: buyers.length })
}
