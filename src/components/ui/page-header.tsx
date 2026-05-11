import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title:      string
  subtitle?:  string
  onBack?:    () => void
  children?:  React.ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, onBack, children, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8", className)}>
      <div className="flex items-center gap-4">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2.5 hover:bg-gray-100 rounded-2xl transition-all text-gray-400 hover:text-blue-600 border border-transparent hover:border-gray-200 shadow-sm hover:shadow-md bg-white"
            title="Go back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        )}
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {children && <div className="flex items-center gap-3 flex-wrap">{children}</div>}
    </div>
  )
}

export function SummaryCard({
  label, value, sub, color,
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className={cn(
      "rounded-3xl border px-5 py-4 transition-all hover:shadow-lg hover:-translate-y-0.5", 
      color ?? "bg-white border-slate-200 shadow-sm"
    )}>
      <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.1em] truncate mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <p className="text-2xl font-black text-slate-900 tabular-nums">{value}</p>
        {sub && <span className="text-[10px] text-slate-400 font-bold lowercase">{sub}</span>}
      </div>
      {sub && !sub.includes(" ") && <div className="mt-2 h-1 w-8 rounded-full bg-slate-100" />}
    </div>
  )
}
