---
id: 540
title: T-shirt designs table and ImageKit outputs
stage: general
date: 2026-11-06
surface: agent
model: claude-opus-5-5
feature: none
branch: tshirt-builder
user: mhassamzahid
command: Backend for the t-shirt designer, built like the gang sheet builder
labels: ["tshirt-designer", "backend", "imagekit", "migration"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/tshirt_designs.py (new: TShirtDesign + TShirtDesignOutput models, buyer and shop routes)
 - backend/migrations/versions/0073_tshirt_designs.py (new, written but NOT applied)
 - backend/app/services/imagekit_service.py (upload_bytes takes an optional subfolder)
 - backend/app/main.py, backend/app/middleware/auth_middleware.py, backend/app/core/permissions.py (route wiring, public paths, production permission)
 - backend/tests/test_tshirt_designs.py (new, 9 tests)
 - frontend/src/services/tshirtDesigns.service.ts (new)
 - frontend/src/components/designer/render.ts (withDpi, renderPrintArt)
 - frontend/src/components/designer/send.ts (new), frontend/src/components/designer/Designer.tsx (send flow and progress modal)
 - frontend/src/__tests__/designer-print-dpi.test.ts (new)
 - history/prompts/general/540-tshirt-designs-table-imagekit.general.prompt.md
tests:
 - backend test_tshirt_designs 9 passed
 - frontend designer tests 20 passed, type check clean
 - browser: Add to cart with the API down shows "The design was not sent" with Try again, no page errors
---

## Prompt

Create a new table for t-shirts. and store final output in ImageKit. UI is fine. The backend should be similar to the Gang Sheet Builder

## Response snapshot

Two new tables: tshirt_designs (one buyer's design as a job, with a reference, the gang sheet status flow, the full design document and version snapshots) and tshirt_design_outputs (one row per shirt, side and kind). On Add to cart the browser sends the design, then uploads a preview PNG and a 300 DPI print PNG for every ordered shirt and printed side into ImageKit at /tenants/{slug}/tshirt-designs/{reference}/. Migration 0073 is written but not applied, per the no-DB-changes rule.

## Outcome

- ✅ Impact: designs are stored as jobs the shop can review, with print-ready files in ImageKit.
- 🧪 Tests: listed above. End to end against a real database not yet run (migration not applied).
