---
id: 456
title: Sign-up blocked a shop buyer's email
stage: general
date: 2026-10-20
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Find why the manager's test email was told it already has an account at sign-up step 1, with no store made for it
labels: ["signup", "onboarding", "accounts", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/signup.py
 - backend/tests/test_onboarding.py
tests:
 - test_onboarding.py (14, new test_a_shops_buyer_can_open_a_shop_with_the_same_email) and test_leads.py (8): passed
 - live, read-only before the fix: the shop address was still free (no store made); /signup/check said yes to the email (no owner or staff account)
---

## Prompt

acha ek issue ye arha ha bhae jb abhi sign up krne ke lie jese abhi mera manager test krrha ha bhae saiha to wo ek mail ikrashmaniya@gmail.com ye kia issue ha yar check kro halake is email se to kch bna hi nh ha store check kro zara yar plz

## Response snapshot

- No store was made with that email. It has a buyer account at one of the shops.
- The first sign-up screen (/signup/check) asks only about owners and staff, so it let the email through; step 1 (POST /signup) refused any account at all, buyers included, and the screen said "already has an account".
- Fix: step 1 now refuses only owner and staff accounts too. Accounts are per shop since migration 0058, and the platform's sign-in and password reset try the owner's account first, so a buyer can open a shop with the same email.
- The other address the manager tried already belongs to an owner or staff account, so "sign in instead" is right there.

## Outcome

- ✅ Impact: a shop's customer can open their own shop with the same email.
- 🔁 Next prompts: the manager signs up again after the deploy.
- 🧠 Reflection: two checks for the same question must ask it the same way; the screen before step 1 had already been narrowed, step 1 had not.
