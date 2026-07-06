---
id: "095"
title: Auth buttons, text colors, reviews, inventory deduction
stage: green
date: 2026-04-17
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: implement 5 changes
labels: ["auth","ui","reviews","inventory","text-colors"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/components/home/HeroSection.tsx
  - frontend/src/components/home/CtaSection.tsx
  - frontend/src/app/(auth)/login/page.tsx
  - frontend/src/app/(auth)/wholesale/register/page.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
  - backend/app/services/order_service.py
  - backend/app/models/product.py
  - backend/app/schemas/review.py
  - backend/app/api/v1/products.py
  - backend/app/api/v1/reviews.py
  - backend/migrations/add_review_image_url.sql
tests:
  - " - none"
---

## Prompt

1. Wherever there are login or apply for wholesale buttons, if user is already logged in, redirect to dashboard instead.
2. On login and wholesale pages, text color not updated for sections with black background — fix.
3. Review card should show customer name at top. Add image upload option in write a review form.
4. Write a review option should only appear when logged in.
5. When order is placed, inventory is not decreasing based on ordered quantity — fix.

## Response snapshot

1. **Auth-aware buttons**: Converted `HeroSection.tsx` and `CtaSection.tsx` to `"use client"` components that use `useAuthStore`. When logged in, button shows "Go to Dashboard →" and links to `/account`. When logged out, shows original text/link.

2. **Text colors**: Fixed dark-on-dark text in login page (`#555`/`#333` → `#aaa`/`#888`) for footer, icons, and benefit card labels. Fixed wholesale register sidebar and header subtext (`#555`/`#444`/`#333` → `#d3d0d0`/`#aaa`).

3. **Review card + image upload**: Reviewer name shown at top with avatar initial + verified badge. Image upload file input added to form, uploads to `/api/v1/reviews/upload-image` (S3) before posting review. `image_url` field added to `ProductReview` model, schema, and endpoint.

4. **Write review auth gate**: `isAuthenticated &&` added to both the "Write a Review" button and `showForm` condition, so the form only shows for logged-in users.

5. **Inventory deduction**: After creating `OrderItem` records in `order_service.create_order`, new step 9.5 deducts inventory from `InventoryRecord` rows per variant, ordered by quantity descending (deducts from fullest warehouse first).

## Outcome

- ✅ Impact: All 5 changes implemented across frontend and backend
- 🧪 Tests: None added — manual verification required
- 📁 Files: 11 files modified/created
- 🔁 Next prompts: Run `backend/migrations/add_review_image_url.sql`; restart backend
- 🧠 Reflection: Inventory deduction uses greedy approach (largest warehouse first) to minimize partial deductions

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment: Add inventory adjustment audit records alongside the deduction
