---
id: 521
title: Package 5 loyalty screens, referral capture
stage: green
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: continue plz
labels: ["retail-plan", "loyalty", "referrals", "package-5"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/app/(customer)/account/rewards/page.tsx (new), frontend/src/app/(admin)/admin/loyalty/page.tsx (new)
 - frontend/src/lib/buyerReferral.ts (new), frontend/src/components/storefront/PointsLine.tsx (new)
 - frontend/src/components/analytics/AttributionTracker.tsx, frontend/src/components/portal/nav.ts, frontend/src/components/portal/ui.tsx, frontend/src/app/(customer)/account/layout.tsx
 - frontend/src/components/storefront/CartView.tsx, frontend/src/app/(customer)/checkout/review/page.tsx
 - frontend/src/components/admin/marketing/MarketingFrame.tsx, frontend/src/components/layout/AdminSidebar.tsx
 - frontend/src/__tests__/loyalty.test.tsx (7)
 - specs/003-retail-launch/tasks.md (T405, T501 to T506), specs/003-retail-launch/spec.md (defaults)
tests:
 - frontend loyalty 7 passed; full vitest 715 passed, 2 failed (the old order-money-and-print-files case; studio-assistant once, a test worker crash: 37/37 on two reruns)
 - next build compiles /account/rewards and /admin/loyalty; tsc clean
 - backend loyalty: local DB 32 checks, unit 19 (record 520)
---

## Prompt

continue plz

## Response snapshot

Package 5's screens: the buyer's Rewards page (points, rewards to turn into a single use code, codes, history, the referral link to copy), Rewards in the account menu only when the shop runs a program, a points line in the cart, a friend's ?bref= link kept in the browser and claimed once signed in (account pages, checkout), and Marketing → Loyalty for the owner (settings, members with history and adjust, referrals with the self-referral ones flagged).

## Outcome

- ✅ Impact: loyalty and referrals usable end to end.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: package 6 (website) behind the launch switch; the manager's decisions for the publish gate; the Stripe test sitting.
- 🧠 Reflection: a component that already sits in a grid column takes its extras inside, not beside it (the cart summary's sticky box).
