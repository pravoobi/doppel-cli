import * as React from "react"

import { cn } from "@/lib/utils"

interface ShellProps {
  sidebar: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * App chrome. The bordered, rounded, padded container below is a layout
 * region — it is not a Card and must not become one. It has no header, no
 * title, no content grouping semantics; it exists to inset the scroll area
 * from the viewport edge.
 */
export function AppShell({ sidebar, children, className }: ShellProps) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-60 shrink-0 border-r bg-white">{sidebar}</aside>

      <main className="flex-1 overflow-y-auto p-4">
        <div
          className={cn(
            "min-h-full rounded-xl border bg-white p-6 shadow-sm",
            className
          )}
        >
          {children}
        </div>
      </main>
    </div>
  )
}
