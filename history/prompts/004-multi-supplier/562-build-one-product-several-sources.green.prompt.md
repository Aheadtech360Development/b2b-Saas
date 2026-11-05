---
id: 562
title: Build one product several sources
stage: green
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: 004-multi-supplier
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner says to apply the most proper multi-vendor use case and report back
labels: ["suppliers", "multi-supplier", "inventory", "checkout", "ss-activewear", "sanmar"]
links:
  spec: specs/004-multi-supplier/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0073_variant_sources.py
 - backend/app/models/supplier.py
 - backend/app/models/inventory.py
 - backend/app/models/__init__.py
 - backend/app/services/suppliers/sourcing.py
 - backend/app/services/suppliers/jobs.py
 - backend/app/services/suppliers/orders.py
 - backend/app/services/suppliers/ss_products.py
 - backend/app/services/order_service.py
 - backend/app/api/v1/guest.py
 - backend/app/services/returns.py
 - backend/app/services/returns_portal.py
 - backend/app/services/inventory_service.py
 - backend/app/api/v1/admin/suppliers.py
 - backend/app/api/v1/admin/products.py
 - backend/app/api/v1/admin/purchase_orders.py
 - backend/app/api/v1/admin/orders.py
 - backend/app/api/v1/account.py
 - backend/app/schemas/order.py
 - backend/tests/test_sourcing.py
 - frontend/src/services/productSources.service.ts
 - frontend/src/components/admin/products/ProductSources.tsx
 - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
 - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
 - frontend/src/__tests__/product-sources.test.tsx
 - specs/004-multi-supplier/spec.md
 - specs/004-multi-supplier/plan.md
 - specs/004-multi-supplier/tasks.md
tests:
 - backend tests/test_sourcing.py: 9 passed
 - frontend product-sources + order page + product page tests: 31 passed
 - local database walk (scratchpad sourcing_local_check.py): 28/28
 - full backend suite on the local test database: 743 passed, 0 failed, 81 errors (known conftest seed issue)
 - tsc: no errors in src
---

## Prompt

bhae tumhein is ke according jo use case ziada proper lagra ha wo proper apply krdo yar aur phir mjhy batao yar meri jan jaldi se yar plz proper

## Response snapshot

Built phase 1 of "one product, several sources" with the recommended rules (own stock first, then cheapest supplier; split allowed; one price; supplier safety stock; own SKUs). Supplier stock for linked variants lives in one location per supplier (warehouses.supplier), so every existing stock read counts it and no sync overwrites own stock. Sources card on the product page (find style, preview matches, link, remove), checkout and reprints record each supplier's share, S&S is sent only its share, the order page shows each line's split (SanMar's part ordered by hand), syncs refresh linked stock/cost, importing a linked style is refused, own-stock paths never write into supplier locations, buyers see "Partner warehouse". Committed locally; push waits for the owner's yes (migration 0073 runs on deploy).

## Outcome

- ✅ Impact: the same blank from own stock, S&S and SanMar sells as one product.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push on the owner's yes; phase 2 (convert imported products, manual match, SanMar orders).
- 🧠 Reflection: without a relationship() the session does not insert a parent row before a child pointing at it; flush first.
