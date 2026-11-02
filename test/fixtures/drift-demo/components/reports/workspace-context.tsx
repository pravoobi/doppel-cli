"use client"

import * as React from "react"

export interface Workspace {
  id: string
  name: string
  plan: "starter" | "growth" | "scale"
}

/**
 * Intentionally has no default value. A consumer rendered outside the provider
 * throws — which is what makes ReportViewer unmountable in isolation.
 */
export const WorkspaceContext = React.createContext<Workspace | null>(null)

export function WorkspaceProvider({
  workspace,
  children,
}: {
  workspace: Workspace
  children: React.ReactNode
}) {
  return (
    <WorkspaceContext.Provider value={workspace}>
      {children}
    </WorkspaceContext.Provider>
  )
}
