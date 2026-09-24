---
id: 271
title: Welcome mail and a password you can see
stage: general
date: 2026-09-24
surface: agent
model: claude-opus-5
feature: none
branch: main
user: Aheadtech360Development
command: continuation of signup work
labels: ["email","signup","auth","accessibility","ui"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/email_service.py
 - backend/app/api/v1/signup.py
 - frontend/src/components/ui/PasswordField.tsx
 - frontend/src/app/(auth)/login/page.tsx
 - frontend/src/app/(auth)/signup/page.tsx
 - frontend/src/app/(auth)/activate-account/page.tsx
 - frontend/src/app/(admin)/admin/settings/security/page.tsx
 - frontend/src/__tests__/password-field.test.tsx
tests:
 - frontend/src/__tests__/password-field.test.tsx (4 passed)
 - frontend/src/__tests__/middleware.test.ts (9 passed)
 - scratchpad/t_brand_mail.py (ALL PASSED — 24 checks)
 - scratchpad/t_signup.py (ALL PASSED)
 - npx tsc --noEmit (clean), npx next build (clean)
---

## Prompt

hn ye bhi krdo aur login aur sign up jo page ha thora change kro usme wo password box mei eye icon bhi nh arha ha jani to isko zara set kro saiha meri jan ye zara dekhlo proper saiha mere bhai

## Response snapshot

**Welcome mail.** `email_service.send_as_platform()` split out of
`notify_platform()` — the few messages that are ours rather than a shop's, so
their links are not bent towards a brand. `signup._welcome()` queues a second
background task: shop address, admin link, the email they sign in with, and
four first steps (add a product, brand the shop, turn payments on, bring a
domain).

**Password eye.** New `PasswordField` — props pass straight through to the
input so each page keeps its own styling; the component only adds the toggle,
44px of right padding, `aria-pressed`, and a screen-reader line saying whether
the password is visible. Used on login, signup, activate-account and the 2FA
disable confirm.

**Login page.** On the platform's own host it now offers "Start your own shop"
→ `/signup` instead of a wholesale application to a store that isn't there;
host read after mount so nothing hydrates wrong. Signup form gained autofill
hints (`organization`, `given-name`, `email`, `tel`, `new-password`) and a
password hint that only scolds once something is typed.

## Outcome

- ✅ Impact: a new owner is told where their shop is; nobody has to type a
  password blind.
- 🧪 Tests: 13 frontend + 24 backend checks, all green; typecheck and build clean.
- 📁 Files: 8 files, +270/-28.
- 🔁 Next prompts: set PLATFORM_NAME=PrintCopilot on Railway (the welcome mail
  signs itself with it); verify the Resend domain.
- 🧠 Reflection: passing props straight through is what let one field serve
  four pages that share no styling at all.

## Evaluation notes (flywheel)

- Failure modes observed: a toggle without `type="button"` submits the form it
  sits in — the test pins that.
- Graders run and results (PASS/FAIL): PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a strength meter on the signup
  password, only once 8 characters are in.
