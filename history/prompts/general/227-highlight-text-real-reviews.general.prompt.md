---
id: 227
title: Highlight box editable, real review count and rating
stage: general
date: 2026-05-29
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: "feat: highlight box text editable from admin, real product reviews count and rating"
labels: ["admin","products","highlight_text","reviews","avg_rating","review_count","customer-page"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/product.py
  - backend/app/main.py
  - backend/app/schemas/product.py
  - backend/app/services/product_service.py
  - backend/app/api/v1/admin/products.py
  - frontend/src/types/product.types.ts
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
tests:
  - npx tsc --noEmit (PASS — only 2 pre-existing test file errors)
  - git push PASS
---

## Prompt

Two fixes on product page:

Fix 1: Blue highlight box text — editable from admin (highlight_text column). 
Fix 2: Reviews — show real count and rating per product (replace static "4.8 (124 reviews)").

## Response snapshot

**Fix 1 — highlight_text field (full stack):**

- `backend/app/models/product.py`: Added `highlight_text: Mapped[str | None] = mapped_column(Text, nullable=True)`
- `backend/app/main.py` (`_ensure_content_tables`): Added idempotent `DO $$ IF NOT EXISTS ... ALTER TABLE products ADD COLUMN highlight_text TEXT $$` migration
- `backend/app/schemas/product.py`: Added `highlight_text: str | None = None` to `ProductDetail` and `ProductUpdate`
- `backend/app/services/product_service.py` (`_product_to_dict`): Added `"highlight_text": getattr(product, "highlight_text", None)`
- `frontend/src/types/product.types.ts`: Added `highlight_text?: string | null` to `ProductDetail` interface
- Admin edit page: Added `<textarea>` for Highlight Box Text between Title and Description inputs; included in `handleSave` call as `highlight_text: (product as any).highlight_text ?? null`
- Customer product page: Replaced hardcoded `✅ Print-optimized {fabric}. Tested for...` with `{(product as any).highlight_text ? <div>✅ {highlight_text}</div> : null}` — box hidden when empty

**Fix 2 — real review count and rating:**

- `backend/app/schemas/product.py`: Added `review_count: int = 0` and `avg_rating: float = 0.0` to `ProductDetail` (with defaults so admin-only endpoints still work)
- `backend/app/services/product_service.py` (`get_by_slug_with_variants`): After pricing+stock attach, queries `func.count(ProductReview.id)` and `func.avg(ProductReview.rating)` filtered by `is_approved == True`; sets `product.review_count` and `product.avg_rating` before Redis cache write
- `backend/app/api/v1/admin/products.py` (`get_admin_product`): Same review stats query before return; also added `ProductReview` to model imports
- `frontend/src/types/product.types.ts`: Added `review_count?: number` and `avg_rating?: number`
- Customer product page: Static stars (filled to 4, "4.8 (124 reviews)") replaced with:
  - When review_count > 0: SVG stars filled to `round(avg_rating)`, text shows real avg and count
  - When review_count == 0: "No reviews yet" in grey

**Key note:** `short_description` (String(500)) already existed and was unused in the frontend. Added `highlight_text` (TEXT) as a separate field for the blue box since it's a marketing-specific copy distinct from a product summary.

## Outcome

- ✅ Impact: Admin can set custom highlight text per product that appears in the blue box on the product page (hidden when empty); product pages now show real approved review count and average rating instead of hardcoded "4.8 (124 reviews)"
- 🧪 Tests: TypeScript PASS (0 new errors); git push PASS (94afb96)
- 📁 Files: 8 files modified, +83/-14 lines
- 🔁 Next prompts: Test admin saving highlight_text for a product; visit product page and confirm blue box shows; check product with 0 reviews shows "No reviews yet"; check product with reviews shows real count
- 🧠 Reflection: ProductReview uses `is_approved: bool` (not a status string). `_product_to_dict` is the Redis serialization path — any new fields added to the schema must also be added there or the cached response will miss them.

## Evaluation notes (flywheel)

- Failure modes observed: _product_to_dict missed initially — new schema fields must be added to both schema AND _product_to_dict for Redis cache to include them; ProductReview uses is_approved bool not status string
- Graders run and results (PASS/FAIL): TypeScript PASS
- Prompt variant (if applicable): null
- Next experiment: null
