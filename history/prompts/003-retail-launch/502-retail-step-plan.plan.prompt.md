---
id: 502
title: Step by step plan for starting the Retail launch
stage: plan
date: 2026-10-28
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: How do we start, and from where; give the plan properly
labels: ["retail-plan", "roadmap", "package-1"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/003-retail-launch/502-retail-step-plan.plan.prompt.md
tests:
 - none
---

## Prompt

hn to ab plan do kese shru krein kaha se plan shru krein batao zara proper

## Response snapshot

- Step 0, the owner's: Railway Pro + backups + PITR; a Stripe test key in a file (never in chat); the manager's answers (the eight unbuilt features, discount + reward stacking, guest points, mixed refund order).
- Step 1, package 1 (1 to 2 days): Retail plan in code, hidden until launch; affiliate on Retail, nothing on proration lines; monthly order count with 80% / 100% notices and the staff cap, checkout never blocked; signup with ?plan=retail and Billing. Checks: tests, Stripe test mode, then live hidden on a test shop.
- Steps 2 to 6: tracking (1-2 days), gift cards (2-3, after backups), returns (2), loyalty (3, after backups), website last behind the publish gate. Each package its own commit, local check, live on the owner's word. About 2 to 3 weeks in all.
- Started step 1 a and b in the same turn.

## Outcome

- ✅ Impact: the owner has the order of work and what each step needs from them.
- 🧪 Tests: none in this record (see PHR 503).
- 📁 Files: this record.
- 🔁 Next prompts: package 1's code (PHR 503).
- 🧠 Reflection: putting the owner's own steps (backups, keys, the manager's answers) first keeps the money packages from waiting on them later.
