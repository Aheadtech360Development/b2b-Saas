---
id: 557
title: Retail walkthrough from the start
stage: general
date: 2026-11-04
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks how to check the Retail functionality from the beginning
labels: ["retail-launch", "signup", "admin", "storefront", "explainer"]
links:
  spec: specs/003-retail-launch/tasks.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/557-retail-walkthrough-from-start.general.prompt.md
tests:
 - none (read the code: signup ?plan=retail + 14-day trial, PLAN_FEATURES retail, Settings menu names, sidebar locks, gang sheet/supplier pages on a 403, returns_portal delivered rule, cash on delivery panel)
---

## Prompt

shru se btao retail ki functionality dekhun kese

## Response snapshot

Step by step in Roman Urdu: (1) the website: Retail in the printcopilot.co menu, Pricing's Retail tab, the partner portal's Retail link; (2) a Retail test shop: "Start free trial" on the Retail page goes to /signup?plan=retail, a new email, the setup steps, 14 days free with no card; (3) what Retail changes in the admin: Settings → Payments and billing shows orders out of 200 and staff out of 2, Team and roles refuses a third person, the Home notice at 160 and 200 orders (checkout never stops), no Suppliers, Gang sheet setup or wholesale tools; (4) the four switches; (5) checking as a buyer: a new shop's own address needs Vercel + Namecheap first, or use a test shop that already answers (the four features are on every plan, never a real brand's shop), cash on delivery for a test order, a gift card given from admin, a parcel for tracking, Delivered for a return (30 days), Rewards after a paid order. Noted: on a Retail shop Gang sheet setup opens with no clear message and Suppliers shows the plan error (UpgradeNotice exists but no screen uses it); offered to add the clear "in Starter" message.

## Outcome

- ✅ Impact: owner can walk the whole Retail flow and show it to the manager.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: maybe the upgrade message on the two print-only tabs.
- 🧠 Reflection: the four Retail features are in every plan's base, so they can be shown on any working test shop.
