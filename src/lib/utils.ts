import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { PerformanceStatus, BuyerTier, BuyerSegment, HealthLabel, BrandCategory } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(n: number, decimals = 1): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`
}

export function statusColor(status: PerformanceStatus): string {
  switch (status) {
    case "ACHIEVED":  return "text-green-600"
    case "MISSED":    return "text-red-600"
    case "ON_TRACK":  return "text-blue-600"
    case "NO_TARGET": return "text-gray-400"
  }
}

export function statusBg(status: PerformanceStatus): string {
  switch (status) {
    case "ACHIEVED":  return "bg-green-100 text-green-800 border-green-200"
    case "MISSED":    return "bg-red-100 text-red-800 border-red-200"
    case "ON_TRACK":  return "bg-blue-100 text-blue-800 border-blue-200"
    case "NO_TARGET": return "bg-gray-100 text-gray-500 border-gray-200"
  }
}

export function tierBg(tier: BuyerTier): string {
  switch (tier) {
    case "TIER1": return "bg-amber-100 text-amber-800 border-amber-200"
    case "TIER2": return "bg-blue-100 text-blue-800 border-blue-200"
    case "TIER3": return "bg-gray-100 text-gray-600 border-gray-200"
  }
}

export function tierLabel(tier: BuyerTier): string {
  switch (tier) {
    case "TIER1": return "Tier 1 — Key Account"
    case "TIER2": return "Tier 2 — Growth"
    case "TIER3": return "Tier 3 — Fragmented"
  }
}

export function cycleScoreColor(score: "GREEN" | "AMBER" | "RED" | "IN_PROGRESS"): string {
  switch (score) {
    case "GREEN":       return "bg-green-100 text-green-800"
    case "AMBER":       return "bg-yellow-100 text-yellow-800"
    case "RED":         return "bg-red-100 text-red-800"
    case "IN_PROGRESS": return "bg-blue-100 text-blue-800"
  }
}

export function segmentBg(segment: BuyerSegment): string {
  switch (segment) {
    case "VIP":            return "bg-yellow-100 text-yellow-800 border-yellow-300"
    case "STRATEGIC":      return "bg-orange-100 text-orange-800 border-orange-200"
    case "STRONG_HOLD":    return "bg-emerald-100 text-emerald-800 border-emerald-200"
    case "KEY_ACCOUNT":    return "bg-violet-100 text-violet-800 border-violet-200"
    case "GROWTH":         return "bg-blue-100 text-blue-800 border-blue-200"
    case "EXISTING":       return "bg-gray-100 text-gray-600 border-gray-200"
    case "RISK":           return "bg-red-100 text-red-700 border-red-200"
    case "NEW_OPP":        return "bg-amber-100 text-amber-800 border-amber-200"
  }
}

export function segmentLabel(segment: BuyerSegment): string {
  switch (segment) {
    case "VIP":            return "★ VIP"
    case "STRATEGIC":      return "Strategic"
    case "STRONG_HOLD":    return "Strong Hold"
    case "KEY_ACCOUNT":    return "Key Account"
    case "GROWTH":         return "Growth"
    case "EXISTING":       return "Existing"
    case "RISK":           return "Risk"
    case "NEW_OPP":        return "New Opp"
  }
}

export const ALL_BUYER_SEGMENTS: BuyerSegment[] = [
  "VIP", "STRATEGIC", "STRONG_HOLD", "KEY_ACCOUNT",
  "GROWTH", "EXISTING", "RISK", "NEW_OPP",
]

export function brandCategoryBg(category: BrandCategory): string {
  switch (category) {
    case "OUR_BRAND":     return "bg-green-100 text-green-800 border-green-300"
    case "PRIVATE_BRAND": return "bg-purple-100 text-purple-800 border-purple-300"
    case "UNCLASSIFIED":  return "bg-gray-100 text-gray-500 border-gray-200"
  }
}

export function brandCategoryLabel(category: BrandCategory): string {
  switch (category) {
    case "OUR_BRAND":     return "OUR"
    case "PRIVATE_BRAND": return "PVT"
    case "UNCLASSIFIED":  return "?"
  }
}

/**
 * Heuristic guess for brand category based on the brand name.
 * Brands that contain "DASH" or "SHAZIA" are likely OUR_BRAND.
 * Manager can override via the admin UI.
 */
export function guessBrandCategory(brand: string): BrandCategory {
  if (!brand) return "UNCLASSIFIED"
  const upper = brand.toUpperCase()
  if (upper.includes("DASH") || upper.includes("SHAZIA")) return "OUR_BRAND"
  return "UNCLASSIFIED"
}

export function healthBg(label: HealthLabel): string {
  switch (label) {
    case "STRONG":   return "bg-green-100 text-green-800"
    case "HEALTHY":  return "bg-teal-100 text-teal-800"
    case "AT_RISK":  return "bg-amber-100 text-amber-800"
    case "CRITICAL": return "bg-red-100 text-red-800"
    case "DORMANT":  return "bg-gray-100 text-gray-500"
  }
}

export function healthBar(label: HealthLabel): string {
  switch (label) {
    case "STRONG":   return "bg-green-500"
    case "HEALTHY":  return "bg-teal-400"
    case "AT_RISK":  return "bg-amber-400"
    case "CRITICAL": return "bg-red-500"
    case "DORMANT":  return "bg-gray-300"
  }
}
