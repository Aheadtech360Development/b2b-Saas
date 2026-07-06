---
id: "075"
title: Fix Gender Filter and Save
stage: green
date: 2026-04-14
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: Fix gender filter not working in AF Apparels project.
labels: ["product","gender","filter","migration","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/product.py
  - backend/app/schemas/product.py
  - backend/app/services/product_service.py
  - backend/migrations/versions/h1i2j3k4l5m6_add_gender_to_products.py
tests:
  - none added
---

## Prompt

Fix gender filter not working in AF Apparels project.

Issues:
1. Gender field not saving when product is updated via admin panel
2. Gender filter not filtering products correctly on /products page

Files to check and fix:
- backend/app/services/product_service.py — add gender filter in list_with_filters_and_search, and make sure gender is saved in update_product
- backend/app/models/product.py — verify gender column exists
- backend/app/schemas/product.py — verify gender in ProductUpdate and ProductDetail
- frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx — verify gender is being sent in handleSave

## Response snapshot

Root cause: `Product` SQLAlchemy model was missing the `gender` mapped column entirely.

Although `ProductUpdate`, `ProductDetail`, and `FilterParams` all had `gender`, and `update_product` correctly uses `setattr(product, field, value)` with `model_dump(exclude_unset=True)`, and `list_with_filters_and_search` had the correct `Product.gender == params.gender` filter — none of it worked because the `gender` attribute didn't exist on the ORM model. SQLAlchemy `setattr` on a non-mapped attribute silently stores a Python instance attribute (not persisted to DB), and `Product.gender` in a WHERE clause raises `AttributeError`.

Fixes applied:
1. **`product.py`** — added `gender: Mapped[str | None] = mapped_column(String(50), nullable=True)` to the `Product` model
2. **`schemas/product.py`** — added `gender: str | None = None` to `ProductCreate` and `ProductListItem` (was already in `ProductUpdate`, `ProductDetail`, `FilterParams`)
3. **`product_service.py`** — added `gender=data.gender` to `create_product` constructor
4. **Migration `h1i2j3k4l5m6`** — merge migration combining `c4d5e6f7a8b9` and `g7f6e5d4c3b2` branch heads + `ALTER TABLE products ADD COLUMN gender VARCHAR(50)`

Frontend (`edit/page.tsx`) was already correctly reading/setting/sending `gender` — no changes needed there.

## Outcome

- ✅ Impact: Gender saves on product update; gender filter correctly applies WHERE clause on DB column; create_product also sets gender
- 🧪 Tests: none added
- 📁 Files: 4 files modified/created
- 🔁 Next prompts: Run `alembic upgrade head` on Railway to apply migration; verify gender select in admin edit page saves correctly
- 🧠 Reflection: Missing ORM column is a subtle bug — service/schema layers looked complete so the model was the last place to check

## Evaluation notes (flywheel)

- Failure modes observed: ORM model missing column; SQLAlchemy setattr silently creates instance attr instead of persisting
- Graders run and results (PASS/FAIL): manual review
- Prompt variant (if applicable): null
- Next experiment: add model-schema consistency check to CI
