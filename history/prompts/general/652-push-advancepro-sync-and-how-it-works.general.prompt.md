---
id: 652
title: Push AdvancePro sync and how it works
stage: general
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner's yes to push 8b5582f (AdvancePro inventory sync) and a request to explain how it works
labels: ["deploy", "integrations", "inventory", "advancepro"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (push only)
tests:
 - live read-only: website version and the backend's /openapi.json carrying /api/v1/admin/inventory-sync
---

## Prompt

hn push krdo aur mjhy iski working batao proper jaldi se

## Response snapshot

Pushed 0d9064b..8b5582f to main (fast-forward), watched the website and the backend (new route in /openapi.json). Explained the working in order: the platform turns the add-on on per brand (console Features); the brand gets an AdvancePro API user (test company first, two-factor off), connects it under Products → Inventory sync, chooses per store location every warehouse added up / one warehouse / not synced, safety stock, count stock, missing sizes keep or zero, the schedule, and runs Sync now; each run signs in (token kept 20 min, refreshed), reads every variant and every warehouse's available quantity, matches SKUs ignoring case and spaces, writes only changed numbers with an audit row, and reports matched / changed / AdvancePro SKUs not in the shop / shop sizes not in AdvancePro. What it does not do: write anything in AdvancePro, create products, send shop orders to AdvancePro (v2), so web orders must be entered in AdvancePro or the next sync puts AdvancePro's number back.

## Outcome

- ✅ Impact: the owner can sell and set up the connector.
- 🧪 Tests: read-only live checks.
- 📁 Files: none changed in this step.
- 🔁 Next prompts: first brand's test login; v2 orders into AdvancePro.
- 🧠 Reflection: none.
