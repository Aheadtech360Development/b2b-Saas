---
id: 118
title: Admin Sees Wholesale Prices on Product Pages
stage: general
date: 2026-04-27
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: manual
labels: ["pricing","admin","is_guest","wholesale","products"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/products.py
tests:
  - none
---

## Prompt

In the admin dashboard, when an admin user is logged in and views the customer-facing product pages, they should see wholesale prices (retail_price from DB) not MSRP.

In the auth middleware, check if the logged-in user has is_staff=True or is_admin=True, and if so, treat them as a wholesale user (is_guest=False) with full pricing access, not as a guest.

## Response snapshot

**Root cause:** `is_guest` in `products.py` was computed as `company_id is None`. Admin users have no `company_id` in their JWT (they're not a company member), so they were incorrectly flagged as guests and served MSRP prices.

**Why middleware didn't need changes:** The `AuthMiddleware` already injects `request.state.is_admin = True` for admin users on public (product) paths — the token-injection branch at the top of `_is_public` handling already runs for any valid Bearer token. The JWT only carries `is_admin` (no `is_staff`); `_build_access_token_claims` in `auth_service.py` confirms this.

**Change made** — `backend/app/api/v1/products.py` — 2 lines:

Both `list_products` (line 61) and `get_product` (line 81) updated from:
```python
is_guest = getattr(request.state, "company_id", None) is None
```
to:
```python
is_guest = getattr(request.state, "company_id", None) is None and not getattr(request.state, "is_admin", False)
```

## Outcome

- ✅ Impact: Admin users browsing `/products` or `/products/{slug}` now receive wholesale `retail_price` pricing, not MSRP. No discount tier applied (admins have no `pricing_tier_id`), so they see base wholesale prices.
- 🧪 Tests: None automated; verify by logging in as admin and browsing a product that has MSRP set — price shown should be `retail_price` not `msrp`
- 📁 Files: 1 file modified
- 🔁 Next prompts: None
- 🧠 Reflection: Smallest possible fix — one boolean condition in two places. The middleware was correctly designed; the bug was entirely in how products.py interpreted the absence of company_id.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results: none
- Prompt variant: null
- Next experiment: null
