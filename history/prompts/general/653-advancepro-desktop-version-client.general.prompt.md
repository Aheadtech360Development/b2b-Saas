---
id: 653
title: AdvancePro desktop version client
stage: general
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: The first client (EZ Mart) says it runs the desktop version of AdvancePro; what now
labels: ["integrations", "inventory", "advancepro", "research"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none in the repo (memory note updated)
tests:
 - web search (three queries) and the vendor's own pages read: aptx.ca "Key new features and enhancements in AdvancePro v11.2" (June 5, 2024) and "APConnects: Shopify integration with AdvancePro"
---

## Prompt

abhi ek msla hogya ha meri client se bat hui eztmart wale wo kehra ha mera to advanced pro ka desktop version ha ab mei kia krun jani

## Response snapshot

The desktop AdvancePro has an API from version 11.2 (June 2024): the "APConnects API Toolkit", "a set of tools you can use with any software", which also runs AdvancePro's own Shopify integration (products and inventory levels out). The REST docs the connector is built on live on advanceware.net, the desktop vendor's site (the cloud product is APTX), so it is very likely the same API; not confirmed which address a desktop company answers on. The client: check the version (Help, About), 11.2 or newer, else ask the advisor to upgrade; ask the AdvancePro advisor to turn on API access (APConnects) for the company, with an API user for a test company, two-factor off, and the API address; then enter them under Products, Inventory sync. If the API cannot be had, a file route (AdvancePro's export) would have to be built. Gave a ready-to-send English message for the client (draft only).

## Outcome

- ✅ Impact: a clear path for a desktop client, with what is confirmed and what is not.
- 🧪 Tests: none (research).
- 📁 Files: memory note.
- 🔁 Next prompts: the client's version and the advisor's answer (API address, test login).
- 🧠 Reflection: "desktop" did not rule the API out; the vendor's release notes did the deciding, not directories.
