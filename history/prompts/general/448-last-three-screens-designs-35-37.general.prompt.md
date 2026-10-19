---
id: 448
title: Last three screens designs 35-37
stage: general
date: 2026-10-19
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Build designs 35 (Connect a carrier), 36 (Collection editor) and 37 (Purchase order) end to end on the local redesign branch
labels: ["admin-redesign", "shipping", "collections", "purchase-orders"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/admin/shipping/ConnectCarrierDialog.tsx (new)
 - frontend/src/app/(admin)/admin/orders/page.tsx, frontend/src/app/(admin)/admin/standard-shipping/page.tsx
 - frontend/src/app/(admin)/admin/products/collections/page.tsx, frontend/src/app/(admin)/admin/products/collections/[id]/page.tsx (new)
 - backend/app/api/v1/admin/purchase_orders.py (GET /variants, PUT /{po_id} for drafts)
 - frontend/src/components/admin/purchase-orders/PurchaseOrderEditor.tsx (new)
 - frontend/src/app/(admin)/admin/purchase-orders/page.tsx, new/page.tsx, [id]/page.tsx, [id]/receive/page.tsx, create/page.tsx
 - backend/tests/test_purchase_order_editor.py, frontend/src/__tests__/last-three-designs.test.tsx
tests:
 - last-three-designs.test.tsx 4/4, test_purchase_order_editor.py 2/2
 - vitest 58 files 638/638, tsc clean, next build exit 0 (after a first try ran out of memory on this machine)
 - local API walk 16/16, browser pass 14/14 against the designs
---

## Prompt

(Images of design 35 Connect a carrier, design 36 Collection editor, design 37 Purchase order.)

nh bs ab ye last 3 screens rehtin hain bs ye krke poora admin panel view ha wo is new ui jo poori bnai isse replace kregy saiha ye dekho ye bs krdo phir done kro phir hum ui shift krdety poori ye bs last screens hain jaldi se krdo

## Response snapshot

All three are built on what live already has, committed locally as a31c5d6, 26c1ef7 and f509c25, and not pushed.

- **Connect a carrier (design 35):** a dialog with each carrier's real fields, Test connection and Connect. It opens from the Orders ship queue, and from a new carrier list on the Shipping page.
- **Collection editor (design 36):** an editor page per collection.
  - Products get in either by hand or by conditions, and the matching count is shown before saving.
  - The editor holds the storefront switch, the sort order and the page design.
- **Purchase order (design 37):** an editor page per order.
  - Lines are found by SKU.
  - Buttons: Save draft, Send (emails the supplier) and Receive stock (stock goes into Inventory).
  - New routes: a SKU search and draft editing.

The push still waits for the manager's answer on the 8 held features.

## Outcome

- ✅ Impact: every design the owner sent is built: 32 design numbers in all. The whole new admin is ready to switch over.
- 🧪 Tests: see above.
- 📁 Files: see above.
- 🔁 Next prompts: the manager's yes or no on the 8 held features; take out what is refused; push the branch to main (a fast-forward while main does not move); verify Vercel and Railway.
- 🧠 Reflection:
  - The design's placeholder fields ("Account number", "API key or login") stood for the carrier's real credential fields. Driving the form from the server's provider list kept each carrier honest.
  - The PO's "Save draft" needed a draft to be editable, a small route that live lacked.

## Evaluation notes (flywheel)

- Failure modes observed:
  - the first build ran out of memory on this machine while the dev server ran;
  - a browser check matched an early preview count.
- Next experiment: stop the dev server before a production build here, and wait on the final value, not on any value.
