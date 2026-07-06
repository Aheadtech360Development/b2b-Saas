---
id: 205
title: Grams weight input display Shippo oz conversion
stage: general
date: 2026-05-20
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Remove oz completely - use grams everywhere for weight
labels: ["weight","grams","shippo","conversion","admin","product"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/shippo_service.py
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
  - frontend/src/app/(admin)/admin/products/new/page.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
tests:
  - none
---

## Prompt

Remove oz completely - use grams everywhere for weight.

Frontend changes:
1. All weight displays: show grams only, remove oz completely
2. Any weight input fields (admin product create/edit):
   - Change label from "oz" to "g"
   - Change placeholder to grams
   - Remove any oz reference

Backend changes:
In product model and shipping service, weight is stored/used in oz for Shippo.
Shippo API needs oz for shipping calculations.

So add a conversion helper:
- Admin inputs weight in grams
- Before saving: convert grams → oz for storage (grams / 28.3495)
- Before displaying: convert oz → grams for display (oz * 28.3495)
- Before Shippo API call: use stored oz value directly (already in oz)

OR alternatively store in grams and convert to oz only when calling Shippo.

Pick whichever approach is cleaner for the existing code.

## Response snapshot

Chose "store in grams, convert to oz for Shippo" — cleanest since weight is already a String field (no DB migration needed), no conversion on save/display, only convert when Shippo needs it.

Backend (shippo_service.py):
- Added GRAMS_PER_OZ = 28.3495 constant
- Added grams_to_oz(grams: float) -> float helper
- Updated create_label() to accept weight_oz: float = 16.0 parameter (was hardcoded "16")
- Updated create_shippo_label() to compute total weight from order items: sum item.product.weight * item.quantity, convert via grams_to_oz(); falls back to 16 oz (~453g) if products have no weight set

Frontend (admin forms):
- edit/page.tsx: label "Weight" → "Weight (g)", placeholder → "e.g. 150, 175"
- new/page.tsx: same changes

Frontend (product display):
- Added formatWeightGrams(raw) helper function at module level in ProductDetailClient.tsx:
  - "5.3 oz" → "150g" (auto-converts legacy oz values)
  - "150" → "150g" (numeric → add g suffix)
  - "150g" → "150g" (already correct)
- Applied to both weight display locations (product meta strip line 700 and product specs table line 1097)

## Outcome

- ✅ Impact: All weight UI shows grams; no "oz" text visible on frontend; Shippo receives oz via grams_to_oz conversion; legacy "oz" stored values auto-display correctly
- 🧪 Tests: none
- 📁 Files: 4 files modified
- 🔁 Next prompts: update any existing product weight values in admin to grams (existing "5.3 oz" values will auto-convert on display, but should be updated at source)
- 🧠 Reflection: Store-in-grams approach required no DB migration since weight is String(100); auto-convert helper handles backward compatibility with old "oz" data

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): wire product weight into Shippo parcel via order items (currently uses DB-loaded items + product relationship)
