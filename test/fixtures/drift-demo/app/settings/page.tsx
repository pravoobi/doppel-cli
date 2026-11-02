"use client"

import { useState } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function SettingsPage() {
  const [name, setName] = useState("Acme Inc")
  const [domain, setDomain] = useState("acme.com")
  const [email, setEmail] = useState("billing@acme.com")

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      {/* Warning banner. No role, no aria-live — screen readers never hear it. */}
      <div className="rounded-lg border border-amber-500/50 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="mb-1 font-medium">Your trial ends in 5 days</p>
        <p>Add a payment method to keep your workspace active.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organisation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* Hand-rolled field. The label is not associated with the input. */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium leading-none">
              Organisation name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          {/* Same again, three weeks later, by someone else. */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium leading-none">
              Primary domain
            </label>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          {/* This one was done properly. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="billing-email" required>
              Billing email
            </Label>
            <Input
              id="billing-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        {/* Save button, hand-rolled, with a disabled state that isn't wired up. */}
        <button
          onClick={() => console.log("saved")}
          className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800"
        >
          Save changes
        </button>
      </div>
    </div>
  )
}
