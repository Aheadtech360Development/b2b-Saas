---
id: 500
title: Retail plan status and the owner's four decisions
stage: misc
date: 2026-10-28
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: admin-ui-redesign
user: Aheadtech360Development
command: Where the Retail plan stands, and the decisions package 1 needs
labels: ["retail-plan", "billing", "plans", "decisions"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/003-retail-launch/500-retail-plan-scene-and-decisions.misc.prompt.md
tests:
 - none
---

## Prompt

saiha ab retail wale plan pe ao kia scene ha jani

## Response snapshot

- Package 1 is mostly there: plans live in code in one place (core/billing_plans.py, core/features.py) with per plan features, Stripe finds or creates a plan's price by lookup key at checkout, signup already takes ?plan=, switching prorates. New: the Retail entry, hiding print and wholesale tools, monthly order count with 80% / 100% warnings that never block checkout, the staff limit, affiliate on Retail. Separate branch, each package live on the owner's word. Mobile app stays Scale only by default. Reminder: live database has no backups.
- Asked four decisions; answers: every order counts toward 200 a month (any status); 2 staff accounts include the owner; S&S / SanMar hidden on Retail; limits enforced on Retail only for now.

## Outcome

- ✅ Impact: package 1's open choices are settled.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: the website design file and the full architecture (PHR 501).
- 🧠 Reflection: the limits existed for every plan but bound none; switching them on for live brands is a separate decision from adding Retail.
