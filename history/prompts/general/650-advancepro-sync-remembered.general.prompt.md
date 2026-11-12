---
id: 650
title: AdvancePro sync remembered
stage: general
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks whether I remember the AdvanceWare/AdvancePro API link and that brands should get an inventory sync option from it
labels: ["integrations", "inventory", "advancepro"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none in the repo (a memory note added)
tests:
 - read PHRs 424–431 (2026-10-15)
 - downloaded https://advanceware.net/restapibeta/swagger/v1/swagger.json from this machine: 200, OpenAPI 3.0.4, V2, 714 paths; login, refresh, warehouses, variants, warehouseInventory, customerOrders, products all present
---

## Prompt

https://advanceware.net/restapibeta/documentation/ui/index.html yad hana tumhein mene iska bataya tha saiha ke isse hameien brands ko inventory sync krne ka opt dena ha yad hana na ????????

## Response snapshot

Yes: on 15 Oct a brand asked to sync its AdvancePro inventory; the spec was read and the connector was confirmed possible (like S&S in Connectors), nothing built. The spec now downloads directly from this machine (714 paths, all the needed endpoints present). To build: which brand, the brand's AdvancePro test API login entered in its own Connectors (not chat), 2FA off on that user, matching SKUs, warehouse to location, and v1 (stock in) or v2 (orders out too). Recommended v1 first.

## Outcome

- ✅ Impact: the earlier decision recalled from the records and re-checked against the live spec.
- 🧪 Tests: spec download and endpoint check.
- 📁 Files: memory note only.
- 🔁 Next prompts: the owner's go-ahead and the brand's name; then spec and build the AdvancePro connector.
- 🧠 Reflection: it was in the PHRs but not in memory; now it is.
