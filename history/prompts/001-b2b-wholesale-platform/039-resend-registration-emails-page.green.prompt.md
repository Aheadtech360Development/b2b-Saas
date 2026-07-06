---
id: "039"
title: Resend Registration Emails Page
stage: green
date: 2026-03-25
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Build Resend Registration Emails page for AF Apparels customer dashboard
labels: ["email","recaptcha","frontend","account"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/package.json
  - frontend/src/app/(customer)/account/resend-emails/page.tsx
  - frontend/src/app/(customer)/account/layout.tsx
  - backend/app/core/config.py
  - backend/app/services/email_service.py
  - backend/app/api/v1/account.py
tests:
  - backend/tests/ (33 passing, no regressions)
---

## Prompt

Build Resend Registration Emails page for AF Apparels customer dashboard.

## Response snapshot

**npm:** Installed `react-google-recaptcha@^3.1.0` and `@types/react-google-recaptcha@^2.1.9`.

**Config:** Added `RECAPTCHA_SECRET_KEY: str = ""` to `Settings` in `config.py`. When blank, reCAPTCHA verification is skipped (dev convenience).

**EmailService:** Updated `send_raw` signature to add `body_text`, `cc`, `bcc` params (all optional). Updated `_send_via_resend` to include `cc`/`bcc` in Resend params when provided. Existing call sites unchanged (they use keyword args so forward-compatible).

**Endpoint `POST /account/resend-registration-emails`:**
- Owner-only
- Verifies reCAPTCHA via `https://www.google.com/recaptcha/api/siteverify` using `httpx.AsyncClient` (httpx already in requirements)
- Skips reCAPTCHA check if `RECAPTCHA_SECRET_KEY` is blank (dev mode)
- Accepts `groups[]`, `to`, `cc`, `bcc`, `recaptcha_token`
- Queries `CompanyUser` filtered by `user_group.in_(selected_groups)` to collect group member emails
- Merges with explicit `to` addresses (deduplicates with `set()`)
- Sends welcome email to each recipient via `email_svc.send_raw()` with optional cc/bcc
- Returns `{message, sent_count}`

**Frontend (`resend-emails/page.tsx`):**
- Checkbox list for 5 user groups (Admin, Accounting, Purchasing, Promo Standards, Users)
- TO / CC / BCC text inputs (comma-separated)
- `react-google-recaptcha` widget (v2 checkbox) — Send button disabled until verified
- On submit: POST to endpoint, show success/error banner, reset form + recaptcha on success
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` env var for site key

**Sidebar:** Added `{ href: "/account/resend-emails", label: "Resend Registration Emails" }` after Manage Users.

## Outcome

- ✅ Impact: Owner can resend welcome emails to user groups or explicit addresses with reCAPTCHA protection
- ✅ Dev mode: works without real reCAPTCHA keys (secret key check skipped when blank)
- 🧪 Tests: 33/33 backend tests passing
- 📁 Files: package.json, resend-emails/page.tsx, layout.tsx, config.py, email_service.py, account.py
