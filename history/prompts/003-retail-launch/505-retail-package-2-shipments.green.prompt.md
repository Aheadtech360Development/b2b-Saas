---
id: 505
title: Stripe checks moved to the end; package 2 shipments
stage: green
date: 2026-10-28
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: Leave the Stripe checks for the end and start step 2 meanwhile; what do you say?
labels: ["retail-plan", "order-tracking", "shipments", "migration", "package-2"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0068_retail_shipments.py (shipments, shipment_events, RLS, backfill)
 - backend/app/models/shipment.py, backend/app/models/__init__.py
 - backend/app/services/shipments.py (record, record_safely, set_status, mark_order, from_courier, next_check, timeline, view)
 - backend/app/api/v1/admin/orders.py (both label purchases; typed tracking number; delivered by hand)
 - backend/app/services/suppliers/orders.py (both S&S shipped paths)
 - backend/tests/test_shipments.py (13)
 - specs/003-retail-launch/tasks.md (T201, T202)
tests:
 - backend tests/test_shipments.py: 13 passed
 - local database: migration 0068 applied; scratchpad shipments_local_check.py: backfill 33/33, comma list = 2 parcels, same number = same parcel, repeated courier status changes nothing, order delivered only when every parcel is, events in order, delivered stops checks; rolled back
 - backend full suite without the 11 script-style files: 578 passed, 0 failed (89 need a database or Redis)
---

## Prompt

stripe wala kam end mei krlegy jb tk qadam 2 shru kro tum jani ye choti moti chzein jo test ke lie chayie end mei niptadegy isey kia kehty ho ?

## Response snapshot

- Agreed: Stripe checks are verification, package 2 does not touch Stripe; all Stripe checks (Retail switching, gift cards) in one sitting at the end, before anything goes live. Backups are not a test and are not deferred.
- Package 2, first half: shipments as rows (0068) with events and row security, backfilled from orders' tracking numbers; services/shipments as the one writer, hooked into label purchases, typed numbers, delivered by hand and S&S shipments, each in a savepoint so a parcel row can never fail the action it rides on.

## Outcome

- ✅ Impact: every tracking number now becomes a parcel with a status and a history, ready for the tracking page.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: T203 tracking loop (brand Shippo key), T204 guest lookup and signed link, T205 shipped / delivered mails, T206 pages.
- 🧠 Reflection: four writers of one field meant one service with a safe entry point, not four copies of the logic.
