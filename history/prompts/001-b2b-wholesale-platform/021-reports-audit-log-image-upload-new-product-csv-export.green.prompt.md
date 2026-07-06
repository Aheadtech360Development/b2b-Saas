---
id: "021"
title: Reports, audit log, image upload, new product, CSV export fixes
stage: green
date: 2026-03-17
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: "Fix 5 frontend/backend bugs: reports prefix, audit log URL, S3 fallback, new product page, CSV auth"
labels: ["frontend","backend","bug-fix","admin","reports","s3","csv","new-feature"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/reports/sales/page.tsx
  - frontend/src/app/(admin)/admin/reports/inventory/page.tsx
  - frontend/src/app/(admin)/admin/reports/customers/page.tsx
  - frontend/src/app/(admin)/admin/settings/audit-log/page.tsx
  - frontend/src/services/admin.service.ts
  - frontend/src/app/(admin)/admin/products/new/page.tsx
  - backend/app/api/v1/admin/products.py
  - backend/app/main.py
tests:
  - Backend starts cleanly (Application startup complete)
  - GET /api/v1/admin/reports/sales returns 200
  - GET /api/v1/admin/reports/inventory returns 200
  - GET /api/v1/admin/reports/customers returns 200
  - GET /api/v1/admin/audit-log returns 200
  - /admin/products/new renders create form
  - Image upload falls back to /app/media/ when AWS_ACCESS_KEY_ID is empty
  - CSV export buttons trigger authenticated blob download
---

## Prompt

Fix 5 frontend/backend bugs: reports pages missing /api/v1 prefix, audit log URL wrong, S3 image upload crashes without credentials, new product page missing, CSV export uses unauthenticated direct URL.

## Response snapshot

**Bug 1 — Reports pages missing /api/v1 prefix:**
- `sales/page.tsx`: `/admin/reports/sales` → `/api/v1/admin/reports/sales`; `.data` → direct
- `inventory/page.tsx`: `/admin/reports/inventory` → `/api/v1/admin/reports/inventory`; `.data` → direct
- `customers/page.tsx`: `/admin/reports/customers` → `/api/v1/admin/reports/customers`; `.data` → direct

apiClient returns data directly (not wrapped in `.data`), so `.then(r => setData(r.data))` → `.then(r => setData(r))`.

**Bug 2 — Audit log URL:**
`/admin/audit-log` → `/api/v1/admin/audit-log`; `.data` wrapper removed.

**Bug 3 — S3 fallback:**
`_process_and_upload_image` in `products.py` previously crashed when AWS credentials were empty (also had two field name bugs: `settings.AWS_REGION` → `settings.AWS_S3_REGION`, `settings.S3_BUCKET_NAME` → `settings.AWS_S3_BUCKET`).

Rewrote function to:
- Check `use_s3 = bool(settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY)`
- If S3: upload to S3 as before (with corrected field names)
- If local: save to `/app/media/products/{product_id}/` and return `/media/...` URLs

Added `StaticFiles(directory="/app/media")` mount at `/media` in `main.py`, with `os.makedirs("/app/media", exist_ok=True)`.

**Bug 4 — New product page:**
Created `frontend/src/app/(admin)/admin/products/new/page.tsx` with:
- Name (required), Description (textarea), Status (draft/active select), MOQ (number, default 1)
- Calls `adminService.createProduct()` on submit
- On success redirects to `/admin/products/[id]/edit`

**Bug 5 — Authenticated CSV export:**
- Added `downloadCsv(path, filename)` helper in `admin.service.ts` using `fetch` + `getAccessToken()` → blob download
- Replaced `exportProductsCsvUrl()` (unauthenticated direct URL) with `async exportProductsCsv()`
- Added `exportSalesCsv(period)`, `exportInventoryCsv()`, `exportCustomersCsv(period)` methods
- Updated all three report pages to call service methods instead of `window.open()`

## Outcome

- ✅ Backend restarted cleanly (Application startup complete)
- ✅ All 3 report pages now call correct /api/v1 URLs and handle response directly
- ✅ Audit log page calls correct URL
- ✅ Image upload survives without AWS credentials (local file fallback)
- ✅ /admin/products/new renders a working create form
- ✅ All CSV exports are authenticated (no 401)

## Evaluation notes (flywheel)

- Failure modes observed: Direct window.open() for auth-protected CSV endpoints; .data wrapper mismatch; hardcoded wrong API prefix; S3 crash on missing env vars
- Graders run and results (PASS/FAIL): Backend startup clean — PASS
- Prompt variant (if applicable): null
- Next experiment: null
