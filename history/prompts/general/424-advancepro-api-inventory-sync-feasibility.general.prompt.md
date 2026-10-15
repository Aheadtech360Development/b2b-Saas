---
id: 424
title: AdvancePro API inventory sync feasibility
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: Research whether a brand can sync its inventory with the platform through the AdvancePro (advanceware.net) REST API
labels: ["integrations", "inventory", "advancepro", "research", "feasibility"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/424-advancepro-api-inventory-sync-feasibility.general.prompt.md
tests:
 - none (research only, no code changed)
---

## Prompt

https://advanceware.net/restapibeta/documentation/ui/index.html meri jan jo mera platform hana ye wala ek brand aya ha wo mjhse ye poochra ke mjhy ye api use krni ha apni iventory management sync ke lie to research kro kia ye possible ha kia meri jan

## Response snapshot

Verdict: yes, it is possible. The link is the Swagger UI for the AdvancePro REST API (beta), sold by
AdvanceWare/AdvancePro Technologies, which is an inventory and order management system for distributors.
The vendor documents a REST API for products, inventory, customers, and creating and shipping orders.
It uses POST /api/Authenticate/login to get a token and a refreshToken, then sends `Authorization: Bearer <token>`.
API access is per customer. The brand opens a support ticket with AdvancePro, which issues an API username
and password. Calls made from the docs page hit the production company, so testing should use a test company.

The host advanceware.net is blocked by this cloud environment's network policy, so the exact endpoint list
(inventory per warehouse, pagination, rate limits, webhooks) could not be read. It must be confirmed from the
swagger.json before building.

The platform already has everything a sync needs, built for S&S Activewear:
- per-brand credential registry with masking and verify (`backend/app/services/integrations_service.py`)
- supplier config, CATALOG entry and settings (`backend/app/services/suppliers/config.py`)
- in-process scheduled sync jobs with Redis lock and progress (`backend/app/services/suppliers/jobs.py`)
- stock writer into Warehouse/InventoryRecord matched by SKU (`backend/app/services/suppliers/ss_products.py: set_stock`)
- local stock deduction on order placement (`backend/app/services/order_service.py` step 9.5)

Recommended v1: one-way pull. AdvancePro is the source of truth, and each SKU's quantity is mirrored into a mapped
store location every 5 to 15 minutes. An optional v2 pushes platform orders into AdvancePro as sales orders, so its stock
drops too. Effort for v1 is roughly 3 to 5 dev days once the endpoint spec and test credentials are in hand.

## Outcome

- ✅ Impact: Feasibility confirmed with conditions. The brand must obtain API credentials and the swagger spec must be checked.
- 🧪 Tests: none (research only)
- 📁 Files: this PHR only
- 🔁 Next prompts: get the brand's API credentials and swagger.json, then spec and build the "advancepro" supplier/provider
- 🧠 Reflection: The docs host was blocked by egress policy. Vendor help-center snippets were used instead of guessing endpoints.

## Evaluation notes (flywheel)

- Failure modes observed: advanceware.net, help.advanceprotech.com and the KB mirror were all blocked (proxy 403 / DNS)
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): allow advanceware.net in the environment network settings and read swagger.json directly
