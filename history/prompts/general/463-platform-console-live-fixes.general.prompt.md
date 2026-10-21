---
id: 463
title: Platform Console live faults fixed
stage: general
date: 2026-10-21
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Fix every live fault found in the super admin review, payments first, then build the new console
labels: ["platform-console", "billing", "stripe", "suspend", "impersonation", "audit-log", "trial"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/platform/tenants.py
 - backend/app/services/billing_service.py (switch_plan; hold respected by _reconcile_access)
 - backend/app/services/brand_status.py (new)
 - backend/app/services/trial_notices.py (new), backend/app/tasks/trial_tasks.py, backend/app/main.py
 - backend/app/services/trial.py (extend), commission.py, backend/app/core/billing_plans.py (effective_plan, known)
 - backend/app/core/security.py, tenant_settings.py
 - backend/app/middleware/auth_middleware.py, audit_middleware.py
 - backend/app/services/tenant_auth_service.py, backend/app/api/v1/admin/users.py
 - backend/tests/test_platform_console_fixes.py (new)
 - frontend/src/lib/api-client.ts, frontend/src/components/admin/SupportSessionBanner.tsx (new)
 - frontend/src/app/(admin)/layout.tsx, frontend/src/app/(platform)/platform/page.tsx
tests:
 - test_platform_console_fixes.py 18 passed; backend unit suite 437 passed (95 need the conftest client fixture, unrelated)
 - frontend tsc clean; signin-design, onboarding-wizard, ai-busy 24 passed
 - the two new SQL statements run on the local Postgres (5440) and rolled back
---

## Prompt

bhae tum proper shru kro aur jo masle tumne batae wo plz handle krlena saiha jaldi se ab shru kro kam proper saiha koi gap na rhe khas tor pr payment wise  ye jo live par masle hain ye plz theek krdena bhai ye properly hona chayie

continue now plz

## Response snapshot

- Plan change: a paying brand's Stripe subscription is switched in place with proration (BillingService.switch_plan) and the plan follows from Stripe; a brand paying nothing is just moved. Unknown plans refused.
- "standard" and other non-plans pay the rate of the plan they are treated as (effective_plan), never 0%; console create makes a real shop (plan, trial, setup steps, platform notice), no redundant feature rows, validated slug/password/commission/time zone.
- Stripe test/live routes moved above /{slug}.
- Platform hold (brand_status): Suspend and Cancel hold the shop; Stripe events no longer reopen or close a held shop; sign-in, refresh and every signed-in request refuse a closed shop (SHOP_CLOSED); staff of a lapsed shop still get in to pay; support always does.
- Open console: 15 to 240 minutes (default 60), reason, marked claims, audit row against the brand; work inside logged against support; never refreshed in the browser; banner in the brand admin.
- Trial reminders hourly in-process (no Celery beat on live); an ending older than 48 hours is marked, not mailed.
- Every console action audited with its brand; staff password reset targets the brand's own account.

## Outcome

- ✅ Impact: the live payment and access faults in the super admin are closed.
- 🔁 Next prompts: review result; then the new console screens.
- 🧠 Reflection: a shop closed for non-payment must stay reachable for paying, or it can never reopen; the two closures need different rules.
