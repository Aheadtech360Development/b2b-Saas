---
id: 669
title: One app release prep
stage: general
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner picks option 1 (one PrintCoPilot app for every shop) and says do it that way
labels: ["mobile", "app-store", "account-deletion", "release"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/account_deletion.py
 - backend/app/api/v1/account.py
 - backend/tests/test_mobile_app_routes.py
 - mobile/src/api/account.ts
 - mobile/src/screens/AccountScreen.tsx
 - mobile/src/admin/MoreScreen.tsx
 - mobile/app.json
 - mobile/package.json
 - mobile/eas.json
 - mobile/README.md
tests:
 - mobile tsc --noEmit: clean
 - backend test_mobile_app_routes.py: 45 passed
 - local demo shop, real routes: a throwaway buyer registers, signs in, a wrong password is refused (400), deletion succeeds, signing in again and the old token both fail (401), the user and their one-person company are anonymised; a shop owner is sent to the request route (409) and the request answers
---

## Prompt

1 ias best option asa kro

## Response snapshot

Went with one app, "PrintCoPilot", for every shop. Built what the stores need that the app lacked: account deletion inside the app (App Store guideline 5.1.1(v)). A buyer deletes their own account from Account after typing the password again: name, email, phone, password, two-factor and pending codes are removed, they are signed out everywhere, a company left with nobody on it loses its contact details, saved addresses and cart, and the shop keeps its orders. A shop's own people ask from More, which emails the platform team (and says so plainly if the email could not go). Build setup: eas.json (preview and production), version 1.0.0, the name spelt PrintCoPilot, iPhone only so no iPad screenshots are needed, the encryption question answered in app.json. Release steps written in mobile/README.md. Still needed from the owner: the original icon file (the repository has only a 180 px icon), the company's Expo account, Apple and Google organisation developer accounts, store text and screenshots, demo logins for review.

## Outcome

- ✅ Impact: the app now meets the account deletion rule and is set up to build for the stores.
- 🧪 Tests: mobile type check, 45 route checks, local deletion run.
- 📁 Files: see list above.
- 🔁 Next prompts: owner's yes to push (the deletion routes must be live for the app); icon files; the accounts.
- 🧠 Reflection: none.
