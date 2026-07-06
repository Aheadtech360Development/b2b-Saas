---
id: 148
title: Discount Group Shipping Input + Product Image Color Groups & Sort
stage: general
date: 2026-05-05
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Add shipping input to discount group store default; color-group images with sort
labels: ["discount-groups", "product-images", "ui", "admin"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/customers/tiers/page.tsx
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
tests:
  - none
---

## Prompt

1. Discount Groups → Create Discount Group → SHIPPING RATE → Store Default: add a shipping amount input (the store has no global default defined, so the field needs to live here). Keep everything else exactly as is.

2. All Products → Edit any product → MEDIA: images currently upload in random order with no grouping. Wanted: images grouped by color (like variants), with ▲▼ sort buttons within each color group so the order within a color can be set precisely.

## Response snapshot

**Fix 1 — Discount Group shipping input:**
In `tiers/page.tsx` (Discount Groups modal), the "Store Default" radio was a bare `<label>` with no sub-panel. Wrapped it in a `<div>`, changed description text to "Flat shipping rate for this group", added an expandable sub-panel below when selected:
- `$` prefix + number input bound to `groupForm.shipping_amount`
- "FREE" green badge when value is 0
- Helper text: "Set 0.00 for free shipping"
The field was already in the form schema (`shipping_amount: 0` in `EMPTY_GROUP_FORM`) and is sent to the backend — just needed UI exposure.

**Fix 2 — Color-grouped images with sort:**
Added `moveImageInGroup(imageId, direction)` function:
- Extracts the color group for the target image
- Swaps within the group array
- Rebuilds the full flat image array preserving color-group order
- Updates `product.images` optimistically and calls `adminService.reorderImages()` to persist

Replaced the flat image list with a grouped display:
- Color order: assigned colors first (in first-appearance order), "No Color Assigned" last
- Group header: color swatch dot (from `COLOR_MAP`) + color name + image count
- Each image row: ▲▼ sort buttons (disabled at group boundaries) + thumbnail + primary badge/button + color dropdown + delete button
- Updated MEDIA section hint text to "Images grouped by color · ▲▼ to reorder · ★ to set primary"

## Outcome

- ✅ Impact: Discount groups now have a usable shipping amount field under Store Default; product images are organized by color with precise sort control
- 🧪 Tests: none added (UI-only changes)
- 📁 Files: 2 files modified
- 🔁 Next prompts: verify shipping_amount is correctly persisted by the backend PATCH endpoint
- 🧠 Reflection: The shipping_amount field already existed in the form state and backend schema — just needed to surface it in the UI

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
