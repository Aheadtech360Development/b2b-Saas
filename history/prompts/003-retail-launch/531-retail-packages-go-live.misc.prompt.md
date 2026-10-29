---
id: 531
title: Retail packages go live with the launch switch off
stage: misc
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: chalo isko live kro meri jan jaldi se live kro isko retail wala part saiha bhai mer
labels: ["retail-plan", "deploy", "live", "migrations", "order-tracking"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0068_retail_shipments.py (backfill chases parcels shipped in the last 7 days, not 30)
 - history/prompts/003-retail-launch/526 to 531 (explainers and this push)
tests:
 - before the push: live main had only 3b38315 since the branch point, no shared files, no new migrations; migrations 0067 to 0071 on a fresh database; backend and frontend suites, type check and production build on the rebased branch
---

## Prompt

chalo isko live kro meri jan jaldi se live kro isko retail wala part saiha bhai mer

## Response snapshot

Pushed the Retail work (packages 1 to 6 and the partner part) to live main, rebased on 3b38315, fast-forward. What changes on live by itself: the order tracking loop and page (every shop; the buyer gets the delivered email when the courier says so), return and reprint emails now really send (they waited on a Celery worker live does not run), new admin screens. Gift cards, returns portal and loyalty stay off until each shop turns them on. The Retail plan stays hidden and the marketing pages stay behind NEXT_PUBLIC_RETAIL_LAUNCH, waiting on the manager's answers (T605). One change before the push: the shipment backfill chases only parcels shipped in the last 7 days, so buyers of older orders do not get a late delivered email.

## Outcome

- ✅ Impact: Retail features available on live; public launch still waits on the manager.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: the manager's answers (T605), then the launch switch and Retail public together; the Media library sidebar fix on the owner's yes.
- 🧠 Reflection: before a push, list what starts on its own on live (loops, emails) and narrow anything that reaches real buyers.
