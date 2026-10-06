---
id: 312
title: Change super admin login
stage: explainer
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: can the super admin email and password be changed — just tell me
labels: ["super-admin", "platform", "railway", "env-vars", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (read only: backend/app/main.py _ensure_platform_admin)
tests:
 - none (no code changed)
---

## Prompt

With a screenshot of the Railway service's Variables tab (Stripe, Shippo, Ziptax, Gemini keys and `SEED_PLATFORM_ADMIN_EMAIL = admin@b2bsaas.com` visible).

Both passwords are redacted below so this record does not put a working credential in the repository.

dekho wo sb saiha but abhi jo cheez krni hana abhi jo hana superadmin ki mail ha admin@b2bsaas.com aur password ha [old password redacted] ye badal ke hamein isko  printcopilot@gmail.com aur password [new password redacted] ye rkhna ha  to sirf batao ye tumhare lie possible ha kia super admin ki bat krrha hn saiha

## Response snapshot

Yes, and no code change is needed: `_ensure_platform_admin()` in `backend/app/main.py` already handles it from Railway variables. Set `SEED_PLATFORM_ADMIN_EMAIL` to the new address, `SEED_PLATFORM_ADMIN_PASSWORD` to the new password, `SEED_PLATFORM_ADMIN_RETIRE` to the old address (deactivates it, does not delete it), and redeploy. `SEED_PLATFORM_ADMIN_RESET=true` is only needed if the new address already exists as a user, and must be removed after one deploy. Claude has no access to Railway, so the user sets the variables. Caveats: if the new address is already a brand owner or customer, that account becomes the super admin; and the chosen password is short for a key to every brand.

## Outcome

- ✅ Impact: user knows the change is four Railway variables and a redeploy.
- 🧪 Tests: none; nothing changed.
- 📁 Files: this record only.
- 🔁 Next prompts: confirm login with the new address after the redeploy.
- 🧠 Reflection: passwords kept out of the record on purpose.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
