---
id: 522
title: Package 6 website behind the Retail launch switch
stage: green
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: continue plz
labels: ["retail-plan", "marketing-site", "pricing", "publish-gate", "package-6"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/retailLaunch.ts (new), frontend/src/app/(customer)/retail/page.tsx (new)
 - frontend/src/components/marketing/pages/Retail.tsx (new, generated from board 1), frontend/src/components/marketing/pages/RetailPricing.tsx (new, from board 2)
 - frontend/src/components/marketing/pages/Pricing.tsx (audience toggle), Home.tsx, Features.tsx, About.tsx, Demo.tsx, Contact.tsx, Partners.tsx, frontend/src/components/marketing/meta.ts
 - frontend/src/components/marketing/MarketingShell.tsx (footer tagline, partner link capture), frontend/src/app/page.tsx, frontend/src/components/partners/ReferralCapture.tsx (one click per page load), frontend/src/app/layout.tsx (tab title)
 - frontend/src/__tests__/retail-site.test.tsx (7)
 - specs/003-retail-launch/tasks.md (T601 to T606)
tests:
 - frontend retail-site 7 passed; full vitest 723 passed, 1 failed (the old order-money-and-print-files case); tsc clean; next build compiles /retail and /pricing
 - backend full suite 676 passed (81 old integration tests cannot seed)
---

## Prompt

continue plz

## Response snapshot

Package 6 built behind one switch (NEXT_PUBLIC_RETAIL_LAUNCH=1): the /retail page generated from board 1, the Pricing page's Retail brands tab from board 2 with a working toggle (?tab=retail), and board 3 and 4's changes on Home, Features, About, Demo, Contact, Affiliate and the footer. D2C wording waits for the switch; plain word fixes ("business" for "shop", the browser tab's spelling) and the four new Features sections (now built) go in now. Held for the manager, in RETAIL_HELD: the seven sales tools the boards call included that the platform does not have, the competitor price comparison and "over $200 a month" (not checked), and the live "SanMar" claims. The partner link capture moved into MarketingShell so /retail?ref= counts, with one click per page load.

## Outcome

- ✅ Impact: the whole Retail document is built on the branch; publishing waits only on the manager's list and the Stripe test sitting.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: the manager's decisions (T605), the Stripe test sitting, then pushing on the owner's word.
- 🧠 Reflection: a design that calls unbuilt features "included" is held, not built as claimed; the switch lets the pages ship the day the claims are true.
