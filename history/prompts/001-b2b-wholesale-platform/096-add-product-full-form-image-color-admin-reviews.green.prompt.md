---
id: "096"
title: Add product full form, image color management, admin reviews
stage: green
date: 2026-04-20
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: implement 3 changes
labels: ["admin","products","images","reviews","variants"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/products/new/page.tsx
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
  - frontend/src/app/(admin)/admin/products/reviews/page.tsx
  - frontend/src/components/layout/AdminSidebar.tsx
  - backend/app/api/v1/admin/reviews.py
  - backend/app/api/v1/admin/products.py
  - backend/app/main.py
tests:
  - " - none"
---

## Prompt

1. In All Products, when I click on + Add Product, only 5 fields are appearing, but I need all the fields — everything including images, variant sizes, etc. So fix this.
2. In All Products, when we open any product, I want to add something to images. First, we should be able to set any image as the primary image. Second, and more importantly, if we add media, how will we set which image belongs to which color? We can do it during import, but if we want to do it from here, how can we do that? So fix this.
3. We added the reviews functionality, but we missed one important thing: how will the admin manage reviews? If the admin wants to delete a review or do anything else, how will they do it? Make all these changes, then I will tell further changes. Do not break anything that is already built.

## Response snapshot

1. **Add Product full form**: Rewrote `/admin/products/new` from 5-field form to full 2-column layout matching the edit page. Left column: product name, URL slug, description, media upload (with preview grid showing images before creation), and variants table (add multiple color/size/price/SKU rows). Right column: status, full organization fields (type, vendor, gender, fabric, product code, weight, category, MOQ, tags). On submit: creates product with all fields, uploads images, creates variant rows, then redirects to edit page.

2. **Image management**: Updated Media section in edit page from a simple grid to a list view per image showing: thumbnail, primary badge / "Set Primary" button, and a color dropdown (populated from variant colors, or freeform input if no variants). "Set Primary" calls `reorderImages` to move the image to position 0. Color assignment calls new `PATCH /api/v1/admin/products/{product_id}/images/{image_id}` endpoint which updates `alt_text` (the field the product detail page uses to link images to color tabs).

3. **Admin reviews page**: Created `GET/PATCH/DELETE /api/v1/admin/reviews` backend endpoints (list with filters for search/approval status, approve/reject toggle, delete). Created `/admin/products/reviews` frontend page with table showing reviewer, product link, star rating, review text, date, status badge, and Approve/Reject/Delete action buttons. Added "Reviews" sub-link in AdminSidebar under the Products dropdown.

## Outcome

- ✅ Impact: All 3 changes implemented
- 🧪 Tests: None added — manual verification required
- 📁 Files: 7 files modified/created
- 🔁 Next prompts: Restart backend to load new admin reviews router

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
