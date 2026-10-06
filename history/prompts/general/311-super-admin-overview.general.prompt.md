---
id: 311
title: Super admin overview
stage: explainer
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: look at the project — there is a super admin in it too
labels: ["super-admin", "platform", "multi-tenant", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (read only: frontend/src/app/(platform)/, frontend/src/components/platform/, frontend/src/services/platform.service.ts, backend/app/api/v1/platform/, backend/app/main.py, backend/app/middleware/auth_middleware.py)
tests:
 - none (no code changed)
---

## Prompt

sb mei pehle abhi dekho tum jo mera ye project hana meri jan isme ek super admin bhi ha jaldi se dekho zara

## Response snapshot

Read through the super admin ("platform admin") part of the project and summarised it:

- Who: a user with `is_platform_admin = true` / role `platform_admin`, no tenant. Seeded on startup by `_ensure_platform_admin()` in `backend/app/main.py` when `SEED_PLATFORM_ADMIN_PASSWORD` is set (email from `SEED_PLATFORM_ADMIN_EMAIL`, default `admin@b2bsaas.com`).
- Where: the `/platform` page (`frontend/src/app/(platform)/platform/page.tsx`); its layout sends anyone who is not a platform admin to `/admin/dashboard` or `/account`.
- Guard: `auth_middleware.py` blocks `/api/v1/platform/*` for non-platform-admins, and every handler checks again.
- UI tabs: Brands (list, stats, create brand, enter brand dashboard, manage brand: name/handle/domain, plan and trial, feature flags, commission, owner login reset, suspend, purge), Analytics, Activity, Search, Health; Stripe live/test switch.
- Backend endpoints with no screen yet: `GET /platform/disputes` (all brands' chargebacks), `GET /platform/audit` and `POST /platform/audit/prune`, and the per-brand billing checkout/portal calls.

## Outcome

- ✅ Impact: user has a map of the super admin before asking for changes to it.
- 🧪 Tests: none; nothing changed.
- 📁 Files: this record only.
- 🔁 Next prompts: whatever the user wants changed or added in the super admin.
- 🧠 Reflection: the disputes and audit APIs are built but unreachable from the UI — likely the first gap to raise.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
