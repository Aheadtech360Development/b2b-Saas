---
id: 431
title: AdvancePro confirmation for manager
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: Confirm that the manager can be told inventory and everything else can run through the AdvancePro API
labels: ["integrations", "advancepro", "connectors", "feasibility", "stakeholder"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/431-advancepro-confirmation-for-manager.general.prompt.md
tests:
 - none (read the uploaded OpenAPI spec only)
---

## Prompt

confirm na matlab phir mei apne manager ko boldun na ye possible ha ke ham apne system mei sai inventory wagera har cheez isi ke zariye hore hon

## Response snapshot

Yes, confirmed from the brand's own API spec, with one caveat: it has not yet been tested with live credentials.
The spec has endpoints for:
- inventory: /api/warehouses, /api/warehouseInventory, /api/variants
- products: GET/POST/PUT /api/products, with updated_since
- customers: /api/customers
- sending orders: POST /api/customerOrders, and GET with updated_since for status

Gave a ready-to-paste message for the manager. Conditions: API username/password from AdvancePro, 2FA off on the API
user, and SKUs that match between the two systems.

## Outcome

- ✅ Impact: Stakeholder-ready confirmation with honest caveats
- 🧪 Tests: none
- 📁 Files: this PHR only
- 🔁 Next prompts: get test credentials, then /sp.specify the AdvancePro connector
- 🧠 Reflection: Separate "confirmed on paper" from "proven live"

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
