---
id: "053"
title: Order Status Page and PDF Generation
stage: green
date: 2026-03-27
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Build complete Order Status page with PDF generation for AF Apparels
labels: ["order-status","pdf","reportlab","comments","search"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/pdf_service.py
  - backend/app/models/order.py
  - backend/app/models/__init__.py
  - backend/migrations/versions/a1b2c3d4e5f6_add_order_comments.py
  - backend/app/api/v1/orders.py
  - backend/app/services/order_service.py
  - backend/app/tasks/email_tasks.py
  - backend/app/api/v1/admin/orders.py
  - frontend/src/app/(customer)/account/orders/[id]/page.tsx
  - frontend/src/app/(customer)/account/orders/page.tsx
  - frontend/src/services/account.service.ts
tests:
  - docker compose up --build -d (all containers started)
  - alembic upgrade head (a1b2c3d4e5f6 applied)
  - PDFService import OK
  - OrderComment import OK
---

## Prompt

Build complete Order Status page with PDF generation for AF Apparels.

## Changes

### backend/app/services/pdf_service.py (NEW)
ReportLab PDFService with 4 document generators:
- `generate_order_confirmation` — full order with pricing
- `generate_invoice` — includes QB invoice ID if synced
- `generate_ship_confirmation` — includes tracking/carrier
- `generate_pack_slip` — qty only, no pricing, "Qty Packed" checkbox column
All documents share brand blue (#1d4ed8) header, AF Apparels branding, item tables, address block.

### backend/app/models/order.py
Added `OrderComment` model (order_id, author_id, body, is_admin). Added `comments` back-reference on `Order`.

### backend/migrations/versions/a1b2c3d4e5f6_add_order_comments.py (NEW)
Creates `order_comments` table with FK cascade delete from orders.

### backend/app/api/v1/orders.py
- Added `q` and `status` query params to `list_orders`
- Added 4 PDF download endpoints: `GET /orders/{id}/pdf/{confirmation|invoice|ship-confirmation|pack-slip}`
- Added `GET /orders/{id}/comments` and `POST /orders/{id}/comments`
- All PDF endpoints use `StreamingResponse` with `Content-Disposition: attachment`

### backend/app/services/order_service.py
Updated `list_orders_for_company` to accept `q` (order number / PO search) and `status` filter params.

### backend/app/tasks/email_tasks.py
Added `send_invoice_email` (triggers on `confirmed` status) and `send_order_cancelled_email` tasks.

### backend/app/api/v1/admin/orders.py
- `update_admin_order`: now triggers `send_invoice_email` when status → confirmed (previously only `send_order_shipped_email` on shipped)
- `cancel_admin_order`: now queues `send_order_cancelled_email`

### frontend/src/app/(customer)/account/orders/[id]/page.tsx
Full rewrite — Order Status page:
- Status timeline (pending → confirmed → processing → shipped → delivered) with step circles + connector lines; cancelled shows X badge
- PDF download buttons (4 docs; ship-confirmation only shown when shipped/delivered)
- Line items table with colour/size
- Order totals
- Messages/comments section with real-time add (POST then append to list, scroll to bottom)
- Reorder button

### frontend/src/app/(customer)/account/orders/page.tsx
- Added debounced search input (350ms) for order# and PO# search
- Added "processing" status filter option
- Added `item_count` column

### frontend/src/services/account.service.ts
Added: `getOrderComments`, `addOrderComment`, `downloadOrderPdf` (returns URL string for `window.open`).

## Outcome
- ✅ PDFService imports cleanly, all 4 generators implemented
- ✅ OrderComment model + migration applied
- ✅ 4 PDF endpoints + 2 comment endpoints live
- ✅ Order list search bar with debounce
- ✅ Full Order Status page with timeline, PDFs, comments
- ✅ Docker rebuild successful, backend startup complete
- 📁 Files: 11 files modified/created
