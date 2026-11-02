"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const invoices = [
  { id: "INV-2291", date: "2026-09-01", amount: "$249.00", status: "Paid" },
  { id: "INV-2264", date: "2026-08-01", amount: "$249.00", status: "Paid" },
  { id: "INV-2230", date: "2026-07-01", amount: "$249.00", status: "Failed" },
]

export default function BillingPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>

      {/* Payment failure banner. Someone remembered role="alert" here. */}
      <div
        role="alert"
        className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
      >
        <p className="mb-1 font-medium">Your last payment failed</p>
        <p>Update your card before 30 September to avoid interruption.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-medium">Growth</span>
            <span className="inline-flex items-center rounded-full border border-transparent bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800">
              Annual
            </span>
          </div>

          {/* Marketing asked for a gradient. The design system has no gradient variant. */}
          <button
            onClick={() => alert("upgrade")}
            className="inline-flex h-10 items-center justify-center rounded-md bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-8 text-sm font-medium text-white shadow-lg transition hover:opacity-90"
          >
            Upgrade to Scale
          </button>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Invoice history</h2>

        {/* Hand-rolled table. No caption, no scope on headers. */}
        <div className="relative w-full overflow-auto">
          <table className="w-full text-sm">
            <thead className="[&_tr]:border-b">
              <tr>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">
                  Invoice
                </th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">
                  Date
                </th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">
                  Amount
                </th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b last:border-0">
                  <td className="p-2 align-middle font-mono text-xs">
                    {invoice.id}
                  </td>
                  <td className="p-2 align-middle">{invoice.date}</td>
                  <td className="p-2 align-middle">{invoice.amount}</td>
                  <td className="p-2 align-middle">{invoice.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
