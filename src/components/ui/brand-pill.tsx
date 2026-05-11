"use client"

import { useState, useEffect } from "react"
import { brandCategoryBg, brandCategoryLabel, guessBrandCategory } from "@/lib/utils"
import type { BrandCategory } from "@/types"

// ── Module-level singleton cache for the brand → category map ──────────────
// Fetched once per page-load; shared across all <BrandPill> instances.

let cachedMap:     Map<string, BrandCategory> | null = null
let inflight:      Promise<Map<string, BrandCategory>> | null = null
const subscribers: ((m: Map<string, BrandCategory>) => void)[] = []

export function loadBrandMap(): Promise<Map<string, BrandCategory>> {
  if (cachedMap) return Promise.resolve(cachedMap)
  if (inflight)  return inflight
  inflight = fetch("/api/admin/brands")
    .then((r) => r.ok ? r.json() : { map: {} })
    .then((d) => {
      const m = new Map<string, BrandCategory>(Object.entries((d.map ?? {}) as Record<string, BrandCategory>))
      cachedMap = m
      // Notify any waiting hooks
      subscribers.splice(0).forEach((s) => s(m))
      return m
    })
    .catch(() => {
      const m = new Map<string, BrandCategory>()
      cachedMap = m
      return m
    })
    .finally(() => { inflight = null })
  return inflight
}

/**
 * Force-refresh the cached map (used after admin saves a category change).
 */
export function invalidateBrandMap(): void {
  cachedMap = null
  inflight  = null
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useBrandCategory(brand: string | undefined): BrandCategory {
  const [category, setCategory] = useState<BrandCategory>(() => {
    if (!brand) return "UNCLASSIFIED"
    if (cachedMap) {
      return cachedMap.get(brand.toLowerCase().trim()) ?? guessBrandCategory(brand)
    }
    return guessBrandCategory(brand)
  })

  useEffect(() => {
    if (!brand) return
    let mounted = true
    loadBrandMap().then((m) => {
      if (!mounted) return
      const c = m.get(brand.toLowerCase().trim()) ?? guessBrandCategory(brand)
      setCategory(c)
    })
    return () => { mounted = false }
  }, [brand])

  return category
}

// ── Component ───────────────────────────────────────────────────────────────

interface BrandPillProps {
  brand: string
  className?: string
}

export function BrandPill({ brand, className = "" }: BrandPillProps) {
  const category = useBrandCategory(brand)
  if (!brand) return null
  return (
    <span
      title={`Brand category: ${category.replace("_", " ")}`}
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${brandCategoryBg(category)} ${className}`}
    >
      {brandCategoryLabel(category)}
    </span>
  )
}

/**
 * Variant that shows the brand text + the category pill side-by-side.
 * Useful for cells that previously rendered just the brand string.
 */
export function BrandWithCategory({ brand }: { brand: string }) {
  if (!brand) return <span className="text-gray-400">–</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <BrandPill brand={brand} />
      <span className="text-xs text-gray-600 truncate">{brand}</span>
    </span>
  )
}
