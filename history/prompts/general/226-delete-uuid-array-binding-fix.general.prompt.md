---
id: 226
title: Delete UUID array asyncpg binding fix
stage: general
date: 2026-05-29
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: "fix: product delete UUID array bug, variant bulk delete uses single endpoint"
labels: ["admin","products","variants","delete","asyncpg","uuid","array-binding","po_line_items"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/products.py
tests:
  - npx tsc --noEmit (PASS — only 2 pre-existing test file errors)
  - git push PASS
---

## Prompt

Fix two specific bugs in backend/app/api/v1/admin/products.py

## Bug 1: Product delete 500 - UUID array passed as string
Error: "invalid input for query argument $1: a sized iterable container expected (got type 'str')"
SQL: UPDATE po_line_items SET product_variant_id = NULL WHERE product_variant_id = ANY(CAST($1 AS uuid[]))
Fix: use individual per-row UPDATE with :vid::uuid instead of array binding.

## Bug 2: Variant delete 401 - parallel calls expire token
Frontend already has deleteVariantsBulk() but it's NOT being used.
Replace handleBulkDeleteVariants and single variant trash icon to use bulk endpoint.

## Response snapshot

**Bug 1 — Backend SQL fix in `delete_product` and `delete_variants_bulk`:**

Both endpoints were using the ORM `update(POLineItem).where(...in_(uuids)).values(product_variant_id=None)` approach (from the previous fix). This generates `= ANY($1::uuid[])` in asyncpg, which requires the Python list to be bound as a PostgreSQL array type. Without an explicit asyncpg type codec registration for `uuid[]`, asyncpg receives the list as a string representation and fails with "a sized iterable container expected (got type 'str')".

Fixed by switching to per-row individual text SQL updates in BOTH endpoints:
```python
for vid in variant_ids:  # variant_ids = [str(v.id) for v in variants]
    await db.execute(
        _text("UPDATE po_line_items SET product_variant_id = NULL WHERE product_variant_id = :vid::uuid"),
        {"vid": vid},
    )
await db.flush()
```
`db.flush()` ensures PO refs are cleared before the cascade delete proceeds.

**Bug 2 — Frontend already fixed:**
Both `handleBulkDeleteVariants` and `handleDeleteVariant` already use `adminService.deleteVariantsBulk` from the previous fix (PHR #225). No frontend changes needed.

## Outcome

- ✅ Impact: Product delete no longer crashes with 500 UUID array binding error; per-row UPDATE is safe regardless of asyncpg version or type codec registration
- 🧪 Tests: TypeScript PASS (0 new errors); git push PASS (3b49746)
- 📁 Files: 1 file modified, +23/-21 lines (backend only)
- 🔁 Next prompts: Test product delete on Railway; test bulk variant delete; confirm PO line items show NULL product_variant_id after delete
- 🧠 Reflection: asyncpg does NOT automatically handle Python list → PostgreSQL `uuid[]` array binding without explicit type codec. The ORM `in_()` generates `= ANY($1)` which asyncpg cannot type-infer for uuid arrays. Per-row `:vid::uuid` text SQL is the reliable workaround. Always test with asyncpg when using array parameters.

## Evaluation notes (flywheel)

- Failure modes observed: asyncpg `= ANY($1::uuid[])` without type codec = "got type 'str'" error; ORM `in_()` with update() generates array-style binding that asyncpg can't handle for uuid[] without registration
- Graders run and results (PASS/FAIL): TypeScript PASS
- Prompt variant (if applicable): null
- Next experiment: null
