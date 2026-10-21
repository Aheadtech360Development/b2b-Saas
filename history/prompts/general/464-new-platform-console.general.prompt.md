---
id: 464
title: New Platform Console and the review's payment fixes
stage: general
date: 2026-10-21
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Build the new super admin from the owner's design on what is live, and close the payment faults the review found
labels: ["platform-console", "super-admin", "redesign", "billing", "stripe"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/platform/console.py (new), backend/app/main.py
 - backend/app/services/billing_service.py, brand_status.py, tenant_auth_service.py
 - backend/app/api/v1/platform/tenants.py, backend/app/api/v1/tenant_auth.py
 - backend/migrations/versions/0065_platform_hold_backfill.py (new)
 - backend/tests/test_platform_console_fixes.py
 - frontend/src/app/(platform)/layout.tsx and platform/* (14 routes)
 - frontend/src/components/platform/console/* (new), frontend/src/services/platform.service.ts
 - frontend/src/lib/api-client.ts, components/admin/SupportSessionBanner.tsx, AdminTopbar.tsx
 - removed: components/platform/ConsoleBar.tsx, InsightTabs.tsx, PlanAndTrial.tsx
tests:
 - test_platform_console_fixes.py 40 passed; backend unit suite 459 passed (95 need the conftest client fixture)
 - local Postgres: console endpoints all 200; end to end flow 20 of 21 (the one left needs Redis, not on this machine)
 - frontend tsc clean; next build compiled, all 14 console routes built
---

## Prompt

continue plzzzz?????
jani chalo continue kro aur yar itne agents nh chalao yar bina fazool meri limit zaya hori ha bhai plz yar mere bhai isko fix kro yar bhai

## Response snapshot

- Review fixes (payments): a closed shop is not billed (Stripe collection paused on suspend and cancel, resumed on restore; refused if Stripe refuses); a lapsed shop's staff are never locked out of paying (the hold alone decides, mark_past_due leaves dead states, 0065 backfills holds for shops closed by hand before); unpaid and incomplete subscriptions are switched in Stripe too, prorated only when paid up, plan metadata always written, the plan line found beside any add-on; a second checkout is refused while an invoice is unpaid; a trial with a card on file moves in Stripe; purge cancels the subscription first and clears the brand's settings; card-on-file start uses effective_plan; platform sign-in prefers an open shop; End session revokes the support token; a support tab never renews itself as the platform admin.
- New console: navy sidebar (Tenants, Money, Growth, Platform), Ctrl K search, Brands list with filters, a page per brand (Overview, Plan and billing, Features, Users, Domain, Activity, Danger zone), Create brand and its checklist, Users, Support, Revenue, Plans, Taxes, Health, Activity, Settings, Affiliates, Leads.
- Not built (new features waiting for a yes): enforced limits and alerts, editable plans, admin roles and invites, feature statuses, owner invite email, platform emails and banner, DNS per record, commission totals, VAT/GST.
- No more subagents, at the owner's word.

## Outcome

- ✅ Impact: the super admin is the designed console on live data, and the payment faults are closed.
- 🔁 Next prompts: the owner's look live; the manager's answer on the new features.
- 🧠 Reflection: closing a shop and billing it are one decision; any hold must act on Stripe too.
