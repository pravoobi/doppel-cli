"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const members = [
  { id: "1", name: "Ananya Rao", email: "ananya@acme.com", role: "Owner" },
  { id: "2", name: "Marcus Webb", email: "marcus@acme.com", role: "Admin" },
  { id: "3", name: "Devon Park", email: "devon@acme.com", role: "Member" },
]

export default function TeamPage() {
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Team</h1>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {members.map((member) => (
            // A card inside a card. The outer one is real, this one is not.
            <div
              key={member.id}
              className="flex items-center justify-between rounded-lg border bg-white p-4 shadow-sm"
            >
              <div>
                <p className="text-sm font-medium">{member.name}</p>
                <p className="text-xs text-muted-foreground">{member.email}</p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {member.role}
                </span>

                {/* A div pretending to be a button. No keyboard handler at all. */}
                <div
                  role="button"
                  onClick={() => setPendingRemoval(member.id)}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-red-600"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Hand-rolled modal. No Escape handling, no focus trap, no aria-modal. */}
      {pendingRemoval ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            onClick={() => setPendingRemoval(null)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-lg rounded-lg border bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold leading-none">
              Remove member?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              They will lose access immediately. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPendingRemoval(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => setPendingRemoval(null)}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
