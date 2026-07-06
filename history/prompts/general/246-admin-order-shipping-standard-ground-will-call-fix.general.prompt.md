---
id: 246
title: Admin Order Shipping Standard Ground Will Call Fix
stage: general
date: 2026-06-09
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: fix admin order detail shipping section — Standard Ground manual label, Will Call pickup display, always show section
labels: ["shippo", "admin", "orders", "shipping", "will-call", "standard-ground", "label-generation"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - backend/app/api/v1/admin/orders.py
tests:
  - manual: Will Call order → Shipping section shows pickup info box (warehouse address, hours, no label needed)
  - manual: Standard Ground order → all 3 carrier tiles clickable, weight input present, Generate button calls generate-label-manual
  - manual: Live Shippo rate order → only customer's carrier tile clickable (existing behaviour unchanged)
  - manual: Order with null shipping_method → section still shows (no longer hidden)
---

## Prompt

Fix the Shipping & Courier section in admin order detail page. Currently it only works when customer selected a live Shippo rate. Handle all three cases:

CASE 1: Live Shippo rate (already working) — keep unchanged
CASE 2: Standard Ground flat rate (broken) — all carrier buttons grayed out; make clickable + weight input + generate-label-manual backend endpoint
CASE 3: Will Call Pickup (broken/hidden) — section hidden entirely; show pickup info box instead

Always show Shipping & Courier section even if shipping_method is null.
Show "Customer selected: [method]" above carrier buttons in all cases.

## Response snapshot

**Root causes identified:**
1. Line 612: `{order.shipping_method !== "will_call" && ...}` hid entire section for will_call orders
2. Line 646: `isDisabled = !!customerCarrier && !isCustomerChoice` — Standard Ground orders sometimes have `order.carrier = "Standard"` which made `customerCarrier = "standard"` (truthy) → ALL three Shippo carriers disabled
3. No backend `generate-label-manual` endpoint existed for non-Shippo orders

**Fixes applied:**

Frontend (`page.tsx`):
- Added `isWillCallPickup`, `hasLiveRate`, `isStandardGround` computed flags after `customerCarrier`
- Replaced outer will_call gate with always-visible `<div>` containing three-case render
- CASE 3 (Will Call): info box showing warehouse address (AF Apparels, 10719 Turbeville Rd, Dallas TX 75243, Mon-Fri 9am-5pm CST) and "No shipping label required" badge
- CASE 2 (Standard Ground): `isDisabled` now gated on `hasLiveRate` so all tiles are clickable; added weight (lbs) number input; generate button calls new `handleGenerateManualLabel`
- CASE 1 (Live Rate): `isCustomerChoice = hasLiveRate && customerCarrier === carrier.id` — same grayout logic but only fires when there IS a rate ID
- Customer Selected banner shows shipping_method + flat rate cost for Standard Ground, carrier + service + cost for Live Rate
- Added `manualWeight` (number, default 1.0) and `manualLabelLoading` state
- Added `handleGenerateManualLabel` function mirroring `handleGenerateLabel` but POST to `generate-label-manual` with `{ carrier, weight_lbs }`

Backend (`orders.py`):
- Added `_ManualLabelRequest(carrier: str, weight_lbs: float = 1.0)` Pydantic model
- Added `POST /orders/{order_id}/generate-label-manual` endpoint
- Extracts shipping address from `order.shipping_address_snapshot`
- Converts `weight_lbs` to oz (× 16), maps carrier to CARRIER_TOKENS, calls `create_label()`
- On success: saves tracking_number, carrier, courier, courier_service, status=shipped, updates label_url/tracking_url via raw SQL, appends timeline entry, commits, sends shipped email

## Outcome

- ✅ Will Call: pickup info box always shown
- ✅ Standard Ground: all carriers clickable, weight input, label generation works
- ✅ Live Rate: behaviour unchanged
- ✅ build: npm run build → PASS (80 pages, 0 TypeScript errors)
- 📁 Files: 2 files, 242 insertions / 78 deletions
- 🔁 Next: verify Standard Ground label generation end-to-end on Railway with a real test order

## Evaluation notes

- The carrier disable bug came from `order.carrier` being set to a non-Shippo value (e.g. "Standard") at order creation — `customerCarrier` was truthy, disabling all tiles. Fix: gate isDisabled on hasLiveRate (shipping_rate_id present) rather than just customerCarrier truthiness.
- generate-label-manual reuses existing shippo_service.create_label() — no new Shippo abstractions needed.
