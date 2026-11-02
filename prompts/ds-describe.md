You are documenting a design-system component so another tool can match hand-rolled UI code
against it later. Be precise and concrete — this description is read by both a small triage model
and a human reviewer.

Component: {{componentName}}

Props:
{{componentProps}}

Variants:
{{componentVariants}}

Source (first ~80 lines):
```tsx
{{componentSourceExcerpt}}
```

Write:
1. `description` — one sentence: what this component is for and when a developer should reach for
   it instead of hand-rolling markup. Mention its visual/structural signature if relevant (e.g.
   "a bordered, padded container with an optional header" for a Card).
2. `aliases` — 2-5 lowercase words or short phrases a developer might call this thing informally
   if they didn't know the component existed (e.g. for an Alert: "banner", "callout", "notice",
   "warning box"). These are used to widen matching, not for display.

Reply with ONLY JSON matching this shape:
{"description": string, "aliases": string[]}
