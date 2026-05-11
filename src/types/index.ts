// ─── Financial Year Helpers ───────────────────────────────────────────────────

export type FYWeek = number   // 1–52
export type FYMonth = number  // 1–12
export type FYQuarter = 1 | 2 | 3 | 4
export type FYCycle = 1 | 2 | 3 | 4   // 12-week cycles

export type FinancialYear = `${number}-${number}`  // e.g. "2026-27"

// ─── Enums ────────────────────────────────────────────────────────────────────

export type Variety = "BASMATI" | "NON BASMATI"

export type PerformanceStatus =
  | "ACHIEVED"
  | "MISSED"
  | "NO_TARGET"
  | "ON_TRACK"

export type BuyerTier = "TIER1" | "TIER2" | "TIER3"

export type BuyerSegment =
  | "VIP"             // Top 20 by target containers — Shazia's most valuable accounts
  | "STRATEGIC"       // Next strategic tier (rank 21–50 by target)
  | "STRONG_HOLD"     // Strategic anchor — high volume, high loyalty
  | "KEY_ACCOUNT"     // Top buyers, need active nurturing
  | "GROWTH"          // Growing trajectory, invest in relationship
  | "EXISTING"        // Active but not yet strategically classified
  | "RISK"            // Declining or at risk of churning
  | "NEW_OPP"         // New opportunity, no orders yet

// Default segments used as auto-classification fallback when no canonical record exists
export const AUTO_SEGMENT_TOP_VIP_LIMIT      = 20
export const AUTO_SEGMENT_STRATEGIC_LIMIT    = 50  // ranks 21–50

export type BrandCategory = "OUR_BRAND" | "PRIVATE_BRAND" | "UNCLASSIFIED"

export type HealthLabel = "STRONG" | "HEALTHY" | "AT_RISK" | "CRITICAL" | "DORMANT"

export type UserRole = "SALES_PERSON" | "MANAGER" | "DIRECTOR"

export type RemarkType = "GENERAL" | "MISSED_TARGET" | "WEEKLY_REVIEW" | "ALERT"

export type ReminderStatus = "OPEN" | "RESOLVED" | "PENDING"

// ─── PI Backend Master ────────────────────────────────────────────────────────

export interface PIRecord {
  piNumber: string
  piDate: string             // ISO date string
  crmEmail: string
  buyerCompanyName: string
  buyerCode: string
  countries: string
  portOfDischarge: string
  loadingPort: string
  salesPerson: string
  salesCoordinator: string
  buyerEmail: string
  brand: string
  varieties: Variety
  description: string
  packagingType: string
  packSize: string
  totalContainers: number
  totalQty: number
  qtyMTs: number
  rate: number
  totalAmount: number
  currency: string
  approvalStatus: string
  financialYear: FinancialYear
  fyWeekNo: FYWeek
  fyMonthNo: FYMonth
  fyMonthName: string
  fyQuarter: FYQuarter

  // Enriched fields (added in API layer)
  segment?: BuyerSegment
  isKeyAccount?: boolean
  canonicalCode?: string
  isNewBuyer?: boolean
}

// ─── Target Master ────────────────────────────────────────────────────────────

export interface TargetRecord {
  buyerCompanyName: string
  countries: string
  salesPerson: string
  financialYear: FinancialYear
  previousYearContainers: number
  currentYearTargetContainers: number
  targetType: "Manual" | "Auto"
  remarks?: string
}

// ─── Buyer Master ─────────────────────────────────────────────────────────────

export interface BuyerRecord {
  buyerCode: string
  buyerCompanyName: string
  countries: string
  salesPerson: string
  salesCoordinator?: string
  tier?: BuyerTier
  contactPerson?: string
  email?: string
  phone?: string
  paymentTerms?: string
  lastOrderDate?: string
  lifetimeContainers?: number
}

// ─── Country Target ───────────────────────────────────────────────────────────

export interface CountryTarget {
  country: string
  planned2024: number
  actual2024: number
  planned2025: number
  actual2025: number
  planned2026: number
  performanceStatus2025: string
  marketGrowth: number
  totalClients2025: number
}

// ─── Business Plan Backend ────────────────────────────────────────────────────

export interface BusinessPlanBuyer {
  sNo: number
  country: string
  buyerName: string
  containers2025: number
  growthPercent: number
  containers2024: number
  monthlyAvgVolume2025: number
  targetContainer2026: number
  remarks?: string
}

// ─── Dashboard KPIs ───────────────────────────────────────────────────────────

export interface DashboardKPIs {
  previousYearContainers: number
  targetContainers: number
  targetDueTillWeek: number
  actualTillWeek: number
  gaping: number
  currentFYWeek: FYWeek
  status: PerformanceStatus
  achievementPercent: number
}

// ─── Performance Views ────────────────────────────────────────────────────────

export interface BuyerPerformance {
  buyerCode: string
  buyerName: string
  country: string
  salesPerson: string
  tier: BuyerTier
  segment: BuyerSegment
  isKeyAccount: boolean
  previousYear: number
  target: number
  targetDue: number
  actual: number
  gap: number
  status: PerformanceStatus
  achievementPercent: number
  lastOrderDate?: string
}

export interface CountryPerformance {
  country: string
  previousYear: number
  target: number
  targetDue: number
  actual: number
  gap: number
  status: PerformanceStatus
  achievementPercent: number
  activeBuyers: number
  totalBuyers: number
  isDreamMarket?: boolean
}

export interface SalesPersonPerformance {
  salesPerson: string
  previousYear: number
  target: number
  targetDue: number
  actual: number
  gap: number
  status: PerformanceStatus
  achievementPercent: number
  activeBuyers: number
}

// ─── 12-Week Execution ────────────────────────────────────────────────────────

export interface WeeklyTarget {
  fyWeek: FYWeek
  cycle: FYCycle
  weekInCycle: number   // 1–12
  targetContainers: number
  actualContainers: number
  gap: number
  status: PerformanceStatus
}

export interface CycleProgress {
  cycle: FYCycle
  cycleName: string
  startWeek: FYWeek
  endWeek: FYWeek
  startDate: string
  endDate: string
  targetContainers: number
  actualContainers: number
  gap: number
  achievementPercent: number
  score: "GREEN" | "AMBER" | "RED" | "IN_PROGRESS"
  weeks: WeeklyTarget[]
}

// ─── Weekly Review ────────────────────────────────────────────────────────────

export interface WeeklyReview {
  id?: string
  fyWeek: FYWeek
  financialYear: FinancialYear
  reviewDate: string
  salesPerson: string
  targetContainers: number
  actualContainers: number
  openPIs: number
  blockers?: string
  wins?: string
  nextWeekFocus?: string
  recordedBy: string
  recordedAt: string
}

// ─── Remarks & Reminders ─────────────────────────────────────────────────────

export interface Remark {
  id?: string
  buyerCode?: string
  buyerName: string
  country?: string
  salesPerson?: string
  remarkType: RemarkType
  remark: string
  remarkBy: string
  remarkDate: string
  fyWeek?: FYWeek
  financialYear?: FinancialYear
  status: ReminderStatus
}

export interface ReminderLog {
  id?: string
  buyerName: string
  country?: string
  salesPerson?: string
  reminderType: string
  message: string
  createdBy: string
  createdAt: string
  dueDate?: string
  status: ReminderStatus
  resolvedBy?: string
  resolvedAt?: string
}

// ─── API Filters ──────────────────────────────────────────────────────────────

export interface DashboardFilters {
  country?: string
  buyerCode?: string
  salesPerson?: string
  variety?: Variety
  fyWeek?: FYWeek
  fyMonth?: FYMonth
  fyQuarter?: FYQuarter
  financialYear?: FinancialYear
}

// ─── Execution Layer ──────────────────────────────────────────────────────────

export interface WeeklyBar {
  fyWeek:   number
  cycle:    number
  label:    string   // "W1", "W2" …
  target:   number   // weekly slice of annual target
  actual:   number
  status:   PerformanceStatus
}

// ─── Ownership Records ────────────────────────────────────────────────────────

export interface OwnershipRecord {
  id:                  string
  canonicalBuyerCode:  string
  buyerName:           string
  fromOwner:           string
  toOwner:             string
  effectiveDate:       string   // ISO date
  transferredBy:       string   // user who did the transfer
  reason:              string
  historicalActual:    number   // containers sold by fromOwner up to effectiveDate
  inheritedTarget:     number   // remaining target moved to toOwner
}

// ─── Lead / Lag Activities ────────────────────────────────────────────────────

export type ActivityType =
  | "CALL"
  | "WHATSAPP"
  | "EMAIL"
  | "SAMPLE_SENT"
  | "VISIT"
  | "MEETING"
  | "FOLLOW_UP"
  | "ORDER_PLACED"
  | "DEMO"
  | "OTHER"

export type ActivityOutcome = "POSITIVE" | "NEUTRAL" | "NEGATIVE"

export interface LeadActivity {
  id:           string
  date:         string
  buyerCode:    string
  buyerName:    string
  country:      string
  activityType: ActivityType
  notes:        string
  salesPerson:  string
  fyWeek:       number
  outcome:      ActivityOutcome
}

// ─── Country Strategy (Dream Markets) ────────────────────────────────────────

export const DREAM_MARKET_TOP_N = 10  // top 10 countries by target = auto Dream Markets

export interface CountryStrategy {
  country:         string
  isDreamMarket:   boolean
  priority?:       number    // 1=highest, used for manual ranking
  strategicNotes?: string
  updatedBy?:      string
  updatedAt?:      string
}

export type TravelStatus = "PLANNED" | "IN_PROGRESS" | "DONE" | "CANCELLED"

export interface TravelPlan {
  id:              string
  country:         string
  purpose:         string
  assignedTo:      string
  plannedMonth:    string    // ISO "YYYY-MM" or human "April 2026"
  days:            number
  keyBuyers:       string    // comma- or newline-separated text
  expectedOutcome: string
  status:          TravelStatus
  remarks:         string
  createdBy:       string
  createdAt:       string
  updatedBy?:      string
  updatedAt?:      string
}

// ─── Tasks (Key Account Execution) ────────────────────────────────────────────

export type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "OVERDUE"

export type TaskType =
  | "MEETING_FIX"           // Sales Coordinator: schedule meeting 5–6 days ahead
  | "PITCH_PREP"            // Sales Coordinator: prepare pitch deck
  | "MARKET_RESEARCH"       // Coordinator: identify buyer's other products
  | "MARKET_PRODUCTS"       // Coordinator: research products in buyer market
  | "PRODUCT_MATCH"         // Coordinator: match market products to our portfolio
  | "PRODUCT_AVAILABILITY"  // Coordinator: send product availability update
  | "MEETING"               // Generic: hold a meeting
  | "FOLLOW_UP"             // Generic follow-up
  | "CUSTOM"

export type AssignedRole = "SALES_PERSON" | "SALES_COORDINATOR" | "BACKUP_OWNER"

export interface BuyerTask {
  id:             string
  buyerCode:      string
  buyerName:      string
  country:        string
  title:          string
  description:    string
  taskType:       TaskType
  assignedTo:     string        // person name
  assignedRole:   AssignedRole
  dueDate:        string        // ISO date
  status:         TaskStatus
  recurringDays:  number        // 0 = non-recurring; >0 = auto-renew on DONE
  createdBy:      string
  createdAt:      string
  completedBy?:   string
  completedAt?:   string
  daysToDue?:     number        // computed at read time, NOT stored
}

export interface MeetingCompliance {
  buyerCode:        string
  buyerName:        string
  segment:          BuyerSegment
  monthlyTarget:    number   // 2 for VIP, 1 for Strategic, 0 for others
  monthActual:      number   // meetings logged in current month
  isCompliant:      boolean
  remaining:        number   // monthlyTarget - monthActual (clamped at 0)
}

// ─── Trigger / Alert System ───────────────────────────────────────────────────

export type TriggerType =
  | "BUYER_BEHIND_PACE"
  | "BUYER_DORMANT"
  | "COUNTRY_BEHIND"
  | "MILESTONE_ACHIEVED"
  | "KEY_BUYER_AGING"
  | "USER_REMARK"             // user-entered remark
  | "ACTION_PLAN"             // user-entered action plan with due date
  | "ACTION_OVERDUE"          // action plan past due
  | "WEEKLY_REVIEW_PENDING"   // sales person hasn't logged weekly review
  | "TASK_OVERDUE"            // assigned buyer task past due
  | "MEETING_GAP"             // VIP/Strategic buyer below monthly meeting target

export type AlertSeverity = "HIGH" | "MEDIUM" | "LOW"

export interface Alert {
  id:           string
  triggerType:  TriggerType
  severity:     AlertSeverity
  title:        string
  message:      string
  buyerCode?:   string
  buyerName?:   string
  country?:     string
  salesPerson?: string
  createdAt:    string
  fyWeek:       number
  status:       "OPEN" | "READ" | "RESOLVED" | "DONE" | "OVERDUE"
  actionUrl?:   string
  dueDate?:     string         // ISO date for ACTION_PLAN follow-up
  followUpOwner?: string       // who is responsible for the action
}

export interface PendingReview {
  salesPerson: string
  fyWeek:      number
  fyMonthName: string
  weeksOverdue: number
  email?:       string
}

export interface TargetAudit {
  id:            string
  buyerName:     string
  buyerCode:     string
  financialYear: FinancialYear
  oldTarget:     number
  newTarget:     number
  changedBy:     string
  changedAt:     string
  reason:        string
}

// ─── Canonical Buyer Map ──────────────────────────────────────────────────────

export interface CanonicalBuyer {
  canonicalBuyerCode: string   // stable slug e.g. "CB_elezz_company_..."
  canonicalBuyerName: string
  buyerCode:          string   // HRB code from BUYER_MASTER
  country:            string
  segment:            BuyerSegment
  strategicRank:      number
  isKeyAccount:       boolean
  primaryOwner:       string
  backupOwner:        string
  targetFY2026:       number
  notes:              string
  salesCoordinator?:  string
}

export interface BuyerAlias {
  aliasName:          string   // exact name as it appears in PI data
  canonicalBuyerCode: string
  buyerCode:          string
  matchConfidence:    "HIGH" | "MEDIUM" | "UNMATCHED"
}

export interface BrandMapping {
  brand:    string         // exact brand string from PI data
  category: BrandCategory  // OUR_BRAND / PRIVATE_BRAND / UNCLASSIFIED
  notes?:   string
  updatedBy?: string
  updatedAt?: string
}

// ─── Buyer Health Score ───────────────────────────────────────────────────────

export interface BuyerHealthScore {
  total:              number   // 0–100
  targetAchievement:  number   // 0–40 pts
  growthVsLastYear:   number   // 0–25 pts
  orderFrequency:     number   // 0–20 pts
  recentTrend:        number   // 0–10 pts
  engagementActivity: number   // 0–5 pts (placeholder)
  label:              HealthLabel
}

// ─── Resolved Buyer (canonical identity + live performance) ──────────────────

export interface ResolvedBuyer {
  // Identity
  canonicalBuyerCode: string
  canonicalBuyerName: string
  buyerCode:          string
  country:            string
  segment:            BuyerSegment
  tier:               BuyerTier
  strategicRank:      number
  isKeyAccount:       boolean
  // Ownership
  primaryOwner:       string
  backupOwner:        string
  // Performance (current FY)
  target:             number
  prevYearActual:     number
  actual:             number
  targetDue:          number
  gap:                number
  achievementPct:     number
  status:             PerformanceStatus
  // Health
  healthScore:        BuyerHealthScore
  // Activity
  lastOrderDate:      string
  orderCount:         number
  weeksSinceLastOrder: number
  // Flags & Metadata
  isNewBuyer:         boolean    // NBD label
  isDreamMarket:      boolean    // Star/Badge
  salesCoordinator:   string
  segmentLabel?:      string     // Helper for UI
}

// ─── Buyer Workspace (detail view) ───────────────────────────────────────────

export interface BuyerWeeklyBar {
  fyWeek:     number
  label:      string   // "W1", "W2" …
  containers: number
}

export interface BuyerWorkspace {
  buyer:         ResolvedBuyer
  piHistory:     PIRecord[]     // most recent first, limited
  weeklyBars:    BuyerWeeklyBar[]   // last 12 FY weeks
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string
  name: string
  email: string
  role: UserRole
  salesPersonName?: string  // matches Sales Person column in PI data
}
