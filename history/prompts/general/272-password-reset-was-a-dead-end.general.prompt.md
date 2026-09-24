---
id: 272
title: Password reset was a dead end
stage: general
date: 2026-09-24
surface: agent
model: claude-opus-5
feature: none
branch: main
user: Aheadtech360Development
command: continuation of auth polish
labels: ["auth","password-reset","rls","email","landing"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/app/(auth)/reset-password/page.tsx
 - frontend/src/app/(auth)/forgot-password/page.tsx
 - frontend/src/components/auth/AuthCard.tsx
 - frontend/src/app/(auth)/login/page.tsx
 - frontend/src/components/platform/PlatformLanding.tsx
 - backend/app/services/auth_service.py
 - backend/app/services/email_service.py
 - backend/app/tasks/email_tasks.py
tests:
 - scratchpad/t_reset.py (ALL PASSED — 16 checks, full round trip)
 - scratchpad/t_brand_mail.py, t_signup.py, t_two_brands.py (ALL PASSED)
 - password-field + middleware vitest (13 passed), tsc + next build clean
---

## Prompt

yaha bhi support wali mail lagao na jani proper aur ye line achi nh lagri uper se chipki chipki lagri jani isey bhi theek kro jani aur password reset wala bhi dekhlena proper waorking mei ho saiha meri jan aur ye hatado bhai iski abhi zarrorat nh ha hamare ko plz

## Response snapshot

Password reset was broken in three independent ways, all silent:

1. **No page.** `auth_service` has always mailed `{FRONTEND_URL}/reset-password?token=`
   and no such route existed → 404. Built it, with the token from the query,
   two password boxes, and the server's real message on a spent or expired link.
2. **RLS hid the account.** `send_password_reset` and `reset_password` ran
   `select(User)` on the request's tenant-scoped session. Asked from the
   platform's own page (no tenant → NO_TENANT), row-level security filtered the
   user out: no user, no mail, 204 anyway. Both now run on an unscoped session
   (`_claim_reset_token` + a raw UPDATE), which is correct — an email belongs to
   one account platform-wide and the page it was asked from says nothing about
   whose it is.
3. **The message depended on a seeded row.** `send("password_reset")` raises
   `NotFoundError` when the DB template is missing or inactive, and the caller
   swallowed it. `EmailService.send_password_reset_link()` tries the editable
   template first, then falls back to a built-in.

Also: `CONTACT_EMAIL` → `support@printcopilot.co` (the same inbox a sign-up
lands in); `.pc-hero p` (0,1,1) outranked `.pc-fine` (0,1,0) and flattened the
hero line onto the buttons — fixed with `.pc-hero .pc-fine`; the login page no
longer offers "Create a Wholesale Account" on a shop's storefront.

## Outcome

- ✅ Impact: somebody who forgets their password can get back in, from either
  the platform's page or a shop's.
- 🧪 Tests: t_reset.py walks ask → mail → use → reuse → expiry, 16 checks.
- 📁 Files: 8 files, +417/-100.
- 🔁 Next prompts: same unscoped treatment for activation tokens; a look at
  what else swallows a send failure.
- 🧠 Reflection: three failures stacked, and each one alone was invisible —
  the endpoint returns 204 by design, so nothing ever said no.

## Evaluation notes (flywheel)

- Failure modes observed: an except-and-log around the only way back into an
  account; RLS silently emptying a query the caller treats as "not found".
- Graders run and results (PASS/FAIL): PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): log at ERROR, not WARNING, whenever
  a reset mail does not go out.
