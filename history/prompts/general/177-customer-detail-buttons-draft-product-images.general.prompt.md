---
id: 177
title: Customer Detail Buttons + Draft Order Product Images
stage: general
date: 2026-05-12
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Fix 2 issues — remove Send Email & Create Order buttons from customer detail, add product images in draft order modal
labels: ["bug-fix","customer-detail","draft-order","ui"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/customers/[id]/page.tsx
  - frontend/src/app/(admin)/admin/orders/drafts/page.tsx
tests:
  - none
---

## Prompt

Fix 2 issues: remove Send Email & Create Order buttons from customer detail page, add product images in draft order modal.

FIX 1: Remove "Send Email" and "+ Create Order" buttons from customer detail header action area. Keep only Suspend/Reactivate button.

FIX 2: In the Create Draft Order modal (Step 2 product list), update product rows to show 48×48 thumbnail with 👕 emoji fallback when no image. Backend already returns primary_image.url_thumbnail via ProductDetail schema.

## Response snapshot

FIX 1: Removed the `✉ Send Email` button (mailto: link) and `+ Create Order` button (routes to /admin/orders/new) from the action button group in customers/[id]/page.tsx. Only the conditional Suspend/Reactivate button remains.

FIX 2: Updated product list rows in the CreateDraftModal step 2 (drafts/page.tsx lines 283-302). Changed image container from 40×40 plain grey div to 48×48 rounded container with overflow:hidden. When primary_image.url_thumbnail is available, renders the image with objectFit:cover and onError handler. Falls back to 👕 emoji centered in the grey box. Gap between image and text updated from 10px to 12px.

No backend changes needed — primary_image.url_thumbnail is already returned by the admin products list endpoint via ProductDetail → ProductImageOut schema.

## Outcome

- ✅ Impact: Customer detail page header is cleaner with only the functional Suspend/Reactivate action; draft order product picker shows real product thumbnails
- 🧪 Tests: Manual verification required
- 📁 Files: 2 frontend files modified
- 🔁 Next prompts: none
- 🧠 Reflection: Draft modal already had partial image support (40px grey fallback); change was purely cosmetic enhancement to show emoji fallback and increase size

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
