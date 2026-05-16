"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { signOut } from "next-auth/react"
import type { AppUser } from "@/types"

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "📊",
    roles: ["SALES_PERSON", "MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN", "USER"],
  },
  {
    label: "Live Data",
    href: "/sales",
    icon: "📋",
    roles: ["SALES_PERSON", "MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN", "USER"],
  },
  {
    label: "Target vs Actual",
    href: "/targets",
    icon: "🎯",
    roles: ["SALES_PERSON", "MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN", "USER"],
  },
  {
    label: "Buyers (80/20)",
    href: "/buyers",
    icon: "👥",
    roles: ["SALES_PERSON", "MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN", "USER"],
  },
  {
    label: "80/20 Meeting Dashboard",
    href: "/8020",
    icon: "⭐",
    roles: ["SALES_PERSON", "MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN", "USER"],
  },
  {
    label: "Country Strategy",
    href: "/countries",
    icon: "🌍",
    roles: ["SALES_PERSON", "MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN", "USER"],
  },
  {
    label: "Performance",
    href: "/performance",
    icon: "📈",
    roles: ["SALES_PERSON", "MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN", "USER"],
  },
  {
    label: "12-Week Execution",
    href: "/execution",
    icon: "🗓️",
    roles: ["SALES_PERSON", "MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN", "USER"],
  },
  {
    label: "Lead / Lag",
    href: "/lead-lag",
    icon: "⚡",
    roles: ["SALES_PERSON", "MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN", "USER"],
  },
  {
    label: "Admin",
    href: "/admin",
    icon: "⚙️",
    roles: ["MANAGER", "DIRECTOR", "SUPER_ADMIN", "ADMIN"],
  },
]

interface SidebarProps {
  user: AppUser
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const filtered = NAV_ITEMS.filter((item) => item.roles.includes(user.role))

  return (
    <aside className="w-64 bg-white border-r border-gray-200 text-gray-800 flex flex-col h-screen overflow-y-auto flex-shrink-0">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-green-500 rounded-lg flex items-center justify-center font-bold text-white text-sm">
            SR
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight text-gray-900">Shazia Rice</p>
            <p className="text-gray-500 text-xs">Sales Tracker</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {filtered.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-green-50 text-green-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User Info */}
      <div className="px-4 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold uppercase">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate capitalize">
              {user.role.toLowerCase().replace("_", " ")}
            </p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full text-xs text-gray-500 hover:text-gray-900 py-1.5 px-3 rounded hover:bg-gray-50 transition-colors text-left font-medium"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
