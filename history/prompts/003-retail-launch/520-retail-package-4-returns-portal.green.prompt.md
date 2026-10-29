---
id: 520
title: Package 4 returns portal, package 5 loyalty backend
stage: green
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: continue / continue plz
labels: ["retail-plan", "returns", "exchanges", "loyalty", "referrals", "package-4", "package-5"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0070_returns_portal.py (new), backend/app/models/rma.py (kind, channel, refund method, events)
 - backend/app/services/returns_portal.py (new), backend/app/api/v1/returns_portal.py (new), backend/app/services/returns.py (new statuses, emails sent in-process), backend/app/api/v1/admin/returns.py
 - backend/migrations/versions/0071_loyalty.py (new), backend/app/models/loyalty.py (new), backend/app/models/discount.py (owner_user_id)
 - backend/app/services/loyalty.py (new), backend/app/api/v1/loyalty.py (new), backend/app/api/v1/discounts.py (reward code owner check)
 - backend/app/api/v1/checkout.py, backend/app/api/v1/guest.py (points as soon as the order is saved)
 - backend/app/services/mails.py (return_update, points_earned, points_expiring), backend/app/core/features.py, backend/app/core/permissions.py, backend/app/core/tenant_settings.py, backend/app/main.py, backend/app/models/__init__.py, backend/app/services/builder/schema.py
 - backend/tests/test_returns_portal.py (13), backend/tests/test_loyalty.py (19)
 - frontend/src/components/storefront/ReturnPortal.tsx (new), frontend/src/app/(customer)/returns/page.tsx (new), frontend/src/app/(customer)/account/returns/new/page.tsx, frontend/src/app/(admin)/admin/returns/page.tsx, frontend/src/lib/builder/doc.ts
 - frontend/src/__tests__/returns-portal.test.tsx (5)
 - specs/003-retail-launch/tasks.md (T401 to T406), specs/003-retail-launch/spec.md (defaults)
tests:
 - local DB through the API: returns_local_check.py 34 passed; loyalty_local_check.py 32 passed
 - migrations 0070 and 0071 up, down, up on the local DB
 - backend unit tests 84 passed (gift cards, returns, loyalty); full suite 657 passed before loyalty (81 old integration tests cannot seed)
 - frontend vitest 709 passed, 1 failed (the old order-money-and-print-files case); tsc clean; next build compiles /returns
---

## Prompt

continue (then: continue plz)

## Response snapshot

Package 4 built and tested: buyers (account or guest by order number + email, a 30 minute signed key) start a return or an exchange for a delivered order inside the shop's window; per line limits, final sale for gift cards and made-to-order lines, exchanges only for an in-stock size or colour of the same product. The shop approves, declines, notes what came back (restock as an inventory adjustment), refunds (to the payment through the existing refund path, or as store credit on a new gift card; capped at what was paid for the items) or makes the exchange order (price difference charged by its pay link or refunded). Every step is an rma_events row, an order history line and an email in the shop's name; the old reprint/refund emails now really send (they were queued to a Celery worker live never runs). Package 5 backend built and tested: points on paid orders (checkout at once, a 10 minute loop for the rest), reversed in proportion on refunds, single use reward codes only their buyer can use, expiry oldest first with a notice, buyer referrals with self-referral blocks (account, email, delivery address) flagged to the owner.

## Outcome

- ✅ Impact: returns/exchanges portal ready; loyalty engine ready for its screens.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: package 5 screens (buyer Rewards page, cart line, referral capture, admin Loyalty), then package 6 (website).
- 🧠 Reflection: a refund helper that commits on its own decides the order of work around it: save the exchange first, refund the difference after.
