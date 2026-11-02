"use client"

import * as React from "react"
import { useParams, useSearchParams } from "next/navigation"

import { WorkspaceContext } from "@/components/reports/workspace-context"

interface Report {
  id: string
  title: string
  rows: Array<{ label: string; value: string }>
}

/**
 * Renders a saved report.
 *
 * This component cannot be mounted in isolation: it reads the route params,
 * reads the query string, requires a WorkspaceContext provider with no default
 * value, and suspends on a fetch keyed by all three. Doppel should classify the
 * drifted button below as DRIFT, generate a patch, and then report the
 * verification verdict as UNVERIFIABLE rather than claiming the patch is safe.
 */
export function ReportViewer() {
  const params = useParams<{ reportId: string }>()
  const search = useSearchParams()
  const workspace = React.useContext(WorkspaceContext)

  if (!workspace) {
    throw new Error("ReportViewer must be rendered inside a WorkspaceProvider")
  }

  const range = search.get("range") ?? "30d"
  const report = React.use(
    fetchReport(workspace.id, params.reportId, range)
  ) as Report

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{report.title}</h2>

        {/* Genuine drift: a hand-rolled secondary button. */}
        <button
          onClick={() => downloadReport(report.id, range)}
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
        >
          Download PDF
        </button>
      </header>

      <dl className="grid grid-cols-2 gap-4">
        {report.rows.map((row) => (
          <div key={row.label} className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{row.label}</dt>
            <dd className="text-xl font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

const cache = new Map<string, Promise<Report>>()

function fetchReport(
  workspaceId: string,
  reportId: string,
  range: string
): Promise<Report> {
  const key = `${workspaceId}:${reportId}:${range}`
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(`/api/workspaces/${workspaceId}/reports/${reportId}?range=${range}`)
        .then((res) => {
          if (!res.ok) throw new Error(`Report ${reportId} failed to load`)
          return res.json() as Promise<Report>
        })
    )
  }
  return cache.get(key)!
}

function downloadReport(reportId: string, range: string) {
  window.location.href = `/api/reports/${reportId}/export?range=${range}`
}
