---
id: 506
title: Package 2 done, the order tracking page end to end
stage: green
date: 2026-10-28
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: continue (package 2, the rest)
labels: ["retail-plan", "order-tracking", "security", "shippo", "package-2"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/tracking_poll.py (new), backend/app/services/tracking_page.py (new), backend/app/api/v1/tracking.py (new)
 - backend/app/services/shippo_service.py (shippo_carrier, tracking_status), backend/app/services/mails.py (track_url on shipped / delivered)
 - backend/app/api/v1/admin/orders.py (tracking link in the status emails), backend/app/api/v1/guest.py (old lookup rate limited, email out of the log)
 - backend/app/core/features.py (order_tracking), backend/app/core/permissions.py, backend/app/core/tenant_settings.py, backend/app/main.py
 - backend/tests/test_tracking_page.py (11)
 - frontend/src/components/storefront/OrderTracking.tsx (new), frontend/src/app/(customer)/track-order/page.tsx (rebuilt), frontend/src/app/(customer)/track/[number]/ (new)
 - frontend/src/app/(customer)/account/orders/[id]/page.tsx (parcels), frontend/src/components/admin/OrderShipments.tsx (new), frontend/src/app/(admin)/admin/orders/[id]/page.tsx
 - frontend/src/components/admin/shipping/TrackingPageCard.tsx (new), frontend/src/app/(admin)/admin/standard-shipping/page.tsx
 - frontend/src/__tests__/order-tracking.test.tsx (3)
 - specs/003-retail-launch/tasks.md (T203 to T207)
tests:
 - backend full suite without the 11 script-style files: 584 passed, 0 failed (89 need a database or Redis)
 - frontend order-tracking 3, checkout-thank-you, order-artwork-open pass; order-money-and-print-files "on the buyer's own order page too" fails with or without this change (known, since the portal redesign); tsc clean
 - local DB + Redis (scratchpad tracking_local_check.py): ALL PASSED; a first run let the stand-in courier deliver 3 other local parcels, put back by scratchpad tracking_local_undo.py
---

## Prompt

continue

## Response snapshot

- Tracking loop every 30 minutes with the shop's own Shippo key; the delivered email in the shop's name.
- Buyer lookup by number + email in a POST body, rate limited, one 404 wording; the email link opens with the order's view key; the signed-in buyer sees it on their order page; city / state / postcode only.
- Shipped / delivered emails point at the shop's tracking page when it is on.
- Admin: Parcels panel on the order page; Settings on/off and message.
- Found and closed on the way: the old /guest/orders lookup had no rate limit and wrote buyers' emails to the log.

## Outcome

- ✅ Impact: package 2 is complete on the branch.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: package 3 (gift cards) waits for backups before it can go live; it can be built meanwhile.
- 🧠 Reflection: a stand-in for an outside service in a local check must answer only for the check's own rows; the first run touched three other local parcels.
