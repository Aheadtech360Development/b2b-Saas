---
id: "032"
title: Resend Email + Test Suite Stabilization
stage: green
date: 2026-03-25
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Switch SendGrid→Resend, fix recurring errors, write critical endpoint tests
labels: ["email","resend","testing","pytest","bugfix"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/requirements.txt
  - backend/app/core/config.py
  - backend/app/services/email_service.py
  - backend/app/services/order_service.py
  - backend/tests/conftest.py
  - backend/tests/test_critical_endpoints.py
  - .env.example
tests:
  - backend/tests/test_critical_endpoints.py (8 new tests)
  - backend/tests/ all 33 tests passing
---

## Prompt

Do these tasks in order:
1. Switch email from SendGrid to Resend
2. Fix all recurring errors permanently + write tests
3. Write tests (test_critical_endpoints.py)
4. Final verification — all tests pass, send test email

## Response snapshot

**Task 1 — Resend email:**
- `requirements.txt`: replaced `sendgrid==6.11.0` with `resend==2.10.0`
- `config.py`: added `RESEND_API_KEY`, `ADMIN_NOTIFICATION_EMAIL`; kept `SENDGRID_API_KEY` for backward compat
- `email_service.py`: rewrote `_send_via_sendgrid` → `_send_via_resend`; dev/test redirects to `ADMIN_NOTIFICATION_EMAIL`; all method signatures preserved
- `.env.example`: updated email section to show Resend vars
- Docker image rebuilt (`docker compose build backend`) so resend is baked in
- Test email sent successfully: id `b603d836-58ee-4fc1-9fcd-cd8770bb98bc`
- Note: domain `karauxbaia.resend.app` must be verified in Resend dashboard; tested with `onboarding@resend.dev`

**Task 2 — Existing fixes verified in place:**
- Auth guards already on all 6 account pages (from prior session)
- `payment_status` CAPTURED→"paid" mapping already fixed; cleaned up redundant ternary
- selectinload for Order.items already in `list_orders_for_company`

**Task 3 — test_critical_endpoints.py:**
- 8 smoke tests: orders list, cart, address field mapping, admin orders, admin companies, products list, tokenize exists, payment_status enum values
- Added `customer_headers` fixture alias to conftest.py
- `test_checkout_tokenize_exists`: accepts 200/422/503 (422=schema validation, 503=QB unavailable)

**Task 4 — All 33 tests pass.**

## Outcome

- ✅ Impact: Email switched to Resend; 33/33 tests passing; 8 new critical endpoint smoke tests
- 🧪 Tests: 33 passed (pytest)
- 📁 Files: requirements.txt, config.py, email_service.py, order_service.py, conftest.py, test_critical_endpoints.py, .env.example
- 🔁 Next prompts: verify karauxbaia.resend.app domain in Resend dashboard; Playwright E2E tests
- 🧠 Reflection: Docker image must be rebuilt (not just restarted) when requirements.txt changes; Resend requires domain verification before sending from custom domains

## Evaluation notes (flywheel)

- Failure modes observed: pip install lost on container recreate (need image rebuild); unverified Resend domain
- Graders run and results (PASS/FAIL): pytest 33/33 PASS
- Prompt variant (if applicable): null
- Next experiment: verify karauxbaia.resend.app domain, update EMAIL_FROM_ADDRESS in .env
