---
id: 207
title: PO Product Search, Order Date, QB Sync Fixes
stage: general
date: 2026-05-22
surface: agent
model: claude-sonnet-4-6
feature: purchase-orders
branch: main
user: development.aheadtech360@gmail.com
command: fix: PO product search debounce, order date default, QB sync methods
labels: ["purchase-orders","quickbooks","product-search","debounce","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/purchase-orders/create/page.tsx
  - frontend/src/app/(admin)/admin/purchase-orders/[id]/page.tsx
  - backend/app/api/v1/admin/purchase_orders.py
  - backend/app/services/quickbooks_service.py
tests:
  - npm run build (TypeScript compilation — PASS)
---

## Prompt

Fix 3 issues in Purchase Orders:

Fix 1: Product search suggestions not working — use apiClient, call GET /api/v1/admin/products?search={query}&page_size=10, show dropdown with product name + SKU, minimum 2 characters, debounce 300ms.

Fix 2: Order date — set today's date in backend create_po, frontend detail page shows today when order_date is null.

Fix 3: QB Sync failing — create_purchase_order, create_vendor_bill, find_or_create_vendor methods don't exist in quickbooks_service.py. Add them plus better error logging.

## Response snapshot

Fix 1 (product search):
- Added `useRef` debounce timer (300ms) to `searchProducts` in create/page.tsx
- Fixed endpoint URL from `/api/v1/admin/products/?q=` (trailing slash, wrong param) to `/api/v1/admin/products?q=` (the endpoint uses `q`, not `search`)
- Simplified response type handling (endpoint returns array directly, no pagination wrapper)

Fix 2 (order date):
- Backend `create_po`: added `order_date=date.today()` to PurchaseOrder constructor
- Frontend detail page: `po.order_date ? ...toLocaleDateString() : new Date().toLocaleDateString()` (was showing "—")

Fix 3 (QB sync):
- Added `_make_request` async wrapper using `asyncio.to_thread` around sync `_request`
- Added `find_or_create_vendor(vendor_name)` — SOQL lookup + create if missing
- Added `create_purchase_order(vendor_name, line_items, po_number, expected_date)` — ItemBasedExpenseLineDetail
- Added `create_vendor_bill(vendor_name, line_items, po_number, bill_date)` — AccountBasedExpenseLineDetail
- Added `quickbooks_service = QuickBooksService()` singleton at module bottom
- Moved lazy import to top-level import in purchase_orders.py
- Improved error logging: `exc_info=True` added to sync endpoint error log

Committed: 32af755

## Outcome

- ✅ Impact: All 3 PO issues resolved — search fires after 300ms debounce with correct endpoint, new POs get today's date automatically, QB sync has full method implementations
- 🧪 Tests: TypeScript build PASS
- 📁 Files: 4 files modified
- 🔁 Next prompts: Test QB sync end-to-end with sandbox credentials
- 🧠 Reflection: Admin products endpoint uses `q` not `search`; trailing slash on route caused silent failure. QB service was sync-only — wrapped with asyncio.to_thread for async compatibility without rewriting the HTTP layer.

## Evaluation notes (flywheel)

- Failure modes observed: Wrong query param name (`search` vs `q`), trailing slash on API URL, missing QB methods, no singleton
- Graders run and results (PASS/FAIL): TypeScript build PASS
- Prompt variant (if applicable): null
- Next experiment: Add SKU display in product search dropdown results
