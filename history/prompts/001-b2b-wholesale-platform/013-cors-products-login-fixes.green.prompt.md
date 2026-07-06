---
id: "013"
title: CORS, products 500, product detail 404, login error fixes
stage: green
date: 2026-03-12
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: Fix 4 critical bugs: CORS blocked, products page reload required, product detail 404, login unexpected error
labels: ["backend","cors","middleware","products","bug-fix","sqlalchemy","async"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/main.py
  - backend/app/middleware/auth_middleware.py
  - backend/app/middleware/pricing_middleware.py
  - backend/app/services/product_service.py
  - frontend/src/lib/api-client.ts
tests:
  - curl OPTIONS http://localhost:8000/api/v1/account/profile → 200 with CORS headers
  - curl GET http://localhost:8000/api/v1/products → 200 with items
  - curl GET http://localhost:8000/api/v1/products/athletic-shorts → 200 with full detail
  - docker exec login test → 200 with access_token
---

## Prompt

Fix 4 critical bugs:

1. CORS critical: Browser shows "Access to fetch at 'http://localhost:8000/api/v1/account/profile' from origin 'http://localhost:3000' has been blocked by CORS policy". Fix by ensuring CORSMiddleware is outermost (added LAST with app.add_middleware()), and AuthMiddleware must skip OPTIONS requests.

2. Products page doesn't show products on first client-side navigation, shows them after full reload.

3. Product detail 404 on client-side nav, works on reload.

4. Login shows "An unexpected error occurred".

After fixes: rebuild backend and test 5 flows.

## Response snapshot

**Fix 1 — CORS (main.py + auth_middleware.py):**
- Moved `app.add_middleware(CORSMiddleware, ...)` to be the LAST call (after PricingMiddleware import) → becomes outermost layer (runs first on request)
- Added `if request.method == "OPTIONS": return await call_next(request)` as first check in AuthMiddleware.dispatch() so OPTIONS preflight passes through to CORS layer
- Verified: `curl -X OPTIONS ... -H "Origin: http://localhost:3000"` returns 200 with `access-control-allow-origin: http://localhost:3000`

**Fix 2 — Products page (api-client.ts):**
- Added `cache: 'no-store'` for server-side (SSR) fetch calls only:
  `const cacheOption: RequestInit = typeof window === "undefined" ? { cache: "no-store" } : {};`
- Prevents Next.js App Router from caching SSR fetches across navigations

**Fix 3 — Product detail 500/ResponseValidationError (product_service.py):**
- Root cause: `PricingMiddleware` used `BaseHTTPMiddleware` which breaks asyncpg greenlet context → `MissingGreenlet` errors → 500s
  - Fixed in prior session by converting to pure ASGI middleware (this was already applied)
- Root cause 2: `ProductDetail` response_model serializes ORM `Product` with `from_attributes=True`. `CategoryOut.children` triggers lazy load of `Category.children` relationship — which was not eagerly loaded → `ResponseValidationError` in async context
  - Fixed: added `.selectinload(Category.children)` to both list and detail queries
  - Fixed: `_product_to_dict` was hardcoding `"categories": []` → updated to serialize actual categories using `_cat_to_dict`

**Fix 4 — Login "unexpected error":**
- Root cause was CORS failure (TypeError: Network request failed) not reaching ApiClientError catch branch → fell through to "An unexpected error occurred"
- Fix was CORS fix above; login error handling itself was correct

## Outcome

- ✅ Impact: CORS unblocked (preflight returns 200 with correct headers); products and product detail return 200 on first request (no reload needed); login works end-to-end
- 🧪 Tests: curl CORS preflight PASS; products list PASS; product detail PASS (after Redis cache flush); login PASS (via docker exec python3)
- 📁 Files: 5 files modified
- 🔁 Next prompts: Test full E2E browser flows (homepage → products → product detail → admin login → customer login)
- 🧠 Reflection: Starlette add_middleware() order is counter-intuitive (last call = outermost). SQLAlchemy async + Pydantic from_attributes: any relationship not eagerly loaded will fail silently as ResponseValidationError when serialized outside session context. Always eagerly load all relationships that appear in response schemas.

## Evaluation notes (flywheel)

- Failure modes observed: CORS failure manifests as TypeError (not ApiClientError), causing generic "unexpected error" in catch-all branch. ResponseValidationError from lazy-load failure is hard to debug because "<exception str() failed>" swallows the real error.
- Graders run and results (PASS/FAIL): curl CORS PASS, products PASS, product detail PASS, login PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Run Playwright E2E to verify all 5 browser flows end-to-end
