import Link from "next/link"
import { PageHeader } from "@/components/ui/page-header"

export const metadata = { title: "Admin | Shazia Rice" }

const ADMIN_TOOLS = [
  {
    title:       "🎛️ Control Panel",
    description: "One place to edit targets, buyer tiers/VIP, and meeting schedules — saves to sheet, reflects everywhere",
    href:        "/admin/control-panel",
    icon:        "🎛️",
  },
  {
    title:       "📊 Daily Buyer Report",
    description: "Critical-first buyer performance (month + till-week) · preview & email to yourself or the director",
    href:        "/admin/daily-report",
    icon:        "📊",
  },
  {
    title:       "Buyer Ownership",
    description: "Reassign primary or backup owners · view reassignment history",
    href:        "/admin/ownership",
    icon:        "👥",
  },
  {
    title:       "Target Editor",
    description: "Edit buyer-level FY targets · all changes audit-logged",
    href:        "/admin/targets",
    icon:        "🎯",
  },
  {
    title:       "Canonical Buyer Map",
    description: "Map name variants → canonical buyer · create new canonical records",
    href:        "/admin/canonical-buyers",
    icon:        "🗂️",
  },
  {
    title:       "Run Trigger Check",
    description: "Manually fire alert engine · sends emails for missed pace, dormant, overdue",
    href:        "/alerts",
    icon:        "🔔",
  },
  {
    title:       "Email Reminders",
    description: "80/20 meeting reminders · auto-send every 2 h · test SMTP · manual trigger",
    href:        "/admin/email-reminders",
    icon:        "📧",
  },
]

export default function AdminPage() {
  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Admin"
        subtitle="Manage ownership, targets, and system configuration"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ADMIN_TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:border-green-300 hover:shadow-sm transition-all group"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{tool.icon}</span>
              <div>
                <p className="font-semibold text-gray-800 group-hover:text-green-700 transition-colors">
                  {tool.title}
                </p>
                <p className="text-xs text-gray-500 mt-1">{tool.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
