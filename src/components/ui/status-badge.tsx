import { cn, statusBg, tierBg, tierLabel } from "@/lib/utils"
import type { PerformanceStatus, BuyerTier } from "@/types"

export function StatusBadge({ status }: { status: PerformanceStatus }) {
  const labels: Record<PerformanceStatus, string> = {
    ACHIEVED:  "✓ Achieved",
    MISSED:    "✗ Missed",
    ON_TRACK:  "~ On Track",
    NO_TARGET: "— No Target",
  }
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap",
      statusBg(status)
    )}>
      {labels[status]}
    </span>
  )
}

export function TierBadge({ tier }: { tier: BuyerTier }) {
  const short: Record<BuyerTier, string> = {
    TIER1: "T1 — Key",
    TIER2: "T2 — Growth",
    TIER3: "T3",
  }
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap",
      tierBg(tier)
    )}>
      {short[tier]}
    </span>
  )
}

export function GapCell({ gap, className }: { gap: number; className?: string }) {
  const pos = gap >= 0
  return (
    <span className={cn("font-medium tabular-nums", pos ? "text-green-600" : "text-red-600", className)}>
      {pos ? "+" : ""}{gap.toFixed(1)}
    </span>
  )
}

export function AchievementBar({ pct, status }: { pct: number; status: PerformanceStatus }) {
  const capped = Math.min(100, Math.max(0, pct))
  const color =
    status === "ACHIEVED" ? "bg-green-500"
    : status === "MISSED" ? "bg-red-400"
    : "bg-gray-300"

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[60px]">
        <div className={cn("h-1.5 rounded-full transition-all", color)} style={{ width: `${capped}%` }} />
      </div>
      <span className="text-xs tabular-nums text-gray-500 w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

export function SegmentTag({ segment, isKeyAccount, className }: { segment: string; isKeyAccount?: boolean; className?: string }) {
  const isVip = segment === "VIP" || isKeyAccount
  const isStrategic = segment === "STRATEGIC"
  
  if (!isVip && !isStrategic) return null

  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter border",
      isVip 
        ? "bg-violet-50 text-violet-600 border-violet-100" 
        : "bg-orange-50 text-orange-600 border-orange-100",
      className
    )}>
      <span className={isVip ? "text-violet-500" : "text-orange-500"}>★</span>
      {isVip ? "VIP" : "STRATEGIC"}
    </span>
  )
}
