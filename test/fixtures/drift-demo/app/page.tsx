"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const metrics = [
  { label: "Monthly recurring revenue", value: "$48,220", delta: "+12.4%" },
  { label: "Active subscriptions", value: "1,284", delta: "+3.1%" },
  { label: "Churn", value: "2.2%", delta: "-0.4%" },
]

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Last synced 4 minutes ago
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Someone needed an export button on a Friday. */}
          <button
            onClick={() => window.print()}
            className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Export CSV
          </button>

          <Link href="/billing">
            <Button variant="outline">Billing</Button>
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Two of these are hand-rolled. The third is the real thing. */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">
            {metrics[0].label}
          </p>
          <p className="mt-2 text-3xl font-semibold">{metrics[0].value}</p>
          <span className="mt-3 inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            {metrics[0].delta}
          </span>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">
            {metrics[1].label}
          </p>
          <p className="mt-2 text-3xl font-semibold">{metrics[1].value}</p>
          <Badge variant="success" className="mt-3">
            {metrics[1].delta}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">
              {metrics[2].label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{metrics[2].value}</p>
            <Badge variant="secondary" className="mt-3">
              {metrics[2].delta}
            </Badge>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Recent activity</h2>
        <div className="flex flex-col gap-2">
          {["Invoice #2291 paid", "Seat added to Growth plan"].map((item) => (
            <div
              key={item}
              className="flex items-center justify-between border-b py-3 last:border-0"
            >
              <span className="text-sm">{item}</span>
              <span className="text-xs text-muted-foreground">2h ago</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
