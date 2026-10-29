---
id: 519
title: Package 3 done, gift cards end to end
stage: green
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: hn shru kro aur poora retail wala jo document lagaya tha na end to end wire chayie koi garbar nh chayie mjy har cheez har test dekhlena bhai
labels: ["retail-plan", "gift-cards", "checkout", "refunds", "security", "package-3"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0069_gift_cards.py (new), backend/app/models/gift_card.py (new), backend/app/models/__init__.py
 - backend/app/services/gift_cards.py (new), backend/app/services/gift_card_checkout.py (new), backend/app/api/v1/gift_cards.py (new)
 - backend/app/api/v1/checkout.py (gift card tender, gift-only confirm, card setup asked only when a card is charged, _check_charge less gift cards, whole refund on a shortfall)
 - backend/app/api/v1/guest.py (gift card lines, tender, gift-only checkout, one card payment one order)
 - backend/app/services/cart_service.py, backend/app/api/v1/cart.py (POST /cart/gift-card), backend/app/services/order_service.py (gift card lines, no shipping on them)
 - backend/app/api/v1/admin/orders.py (refund split, gift card payments and sold cards on the order page), backend/app/services/refund_service.py (gift card refunds counted)
 - backend/app/schemas/order.py, backend/app/services/mails.py (gift_card_received, gift_card_sent)
 - backend/app/core/features.py, backend/app/core/permissions.py, backend/app/core/tenant_settings.py, backend/app/main.py, backend/app/services/builder/schema.py
 - backend/tests/test_gift_cards.py (52)
 - frontend/src/app/(admin)/admin/gift-cards/page.tsx (new), frontend/src/components/admin/marketing/MarketingFrame.tsx, frontend/src/components/layout/AdminSidebar.tsx
 - frontend/src/components/admin/OrderRefunds.tsx, frontend/src/app/(admin)/admin/orders/[id]/page.tsx
 - frontend/src/components/storefront/GiftCards.tsx (new), frontend/src/app/(customer)/gift-cards/page.tsx (new), frontend/src/app/(customer)/gift-cards/balance/page.tsx (new)
 - frontend/src/app/(customer)/checkout/review/page.tsx, frontend/src/components/checkout/StripePaymentForm.tsx, frontend/src/components/storefront/CartView.tsx
 - frontend/src/lib/guestCart.ts, frontend/src/lib/tracking.ts, frontend/src/lib/builder/doc.ts, frontend/src/services/orders.service.ts, frontend/src/types/order.types.ts
 - frontend/src/app/(customer)/checkout/thank-you/[number]/page.tsx
 - frontend/src/__tests__/gift-cards.test.tsx (6), frontend/src/__tests__/gift-cards-admin.test.tsx (4)
 - specs/003-retail-launch/tasks.md (T301 to T308), specs/003-retail-launch/spec.md (defaults taken)
tests:
 - backend tests/test_gift_cards.py 52 passed; full suite on a separate local test database 644 passed (81 old integration tests cannot seed: conftest misses company_users.user_group, not this work)
 - local DB end to end through the API, 52 checks, all passed (scratchpad gift_cards_local_check.py)
 - random run: 6 checkouts at once, 245 moves, every ledger adds up, no hold both spent and given back
 - migration 0069 up, down, up on the local DB; a fresh database migrates 0001 to 0069
 - frontend vitest 704 passed, 1 failed (order-money-and-print-files "on the buyer's own order page too", failing before this work); tsc clean; next build compiles with /admin/gift-cards, /gift-cards, /gift-cards/balance
---

## Prompt

hn shru kro aur poora retail wala jo document lagaya tha na end to end wire chayie koi garbar nh chayie mjy har cheez har test dekhlena bhai

## Response snapshot

Package 3 (gift cards) built and wired end to end on `retail-plan`. A gift card is a tender with holds: the payment step holds what each card pays (row locked, in id order), the card is charged the rest (never under $0.50), confirm captures the holds (or takes again, refusing and refunding the card if the money is gone), and a gift card covering everything places the order with no card at all. Codes are 80 random bits, stored only as SHA-256 per shop, shown once. Wrong codes: 10 per 15 minutes per visitor and shop, then refused before any lookup. Refunds: card first, then back onto the gift card; sold cards only whole and unused. Admin page under Marketing, storefront buy and balance pages, checkout box. The race check found a real fault (a card read before its lock kept its old balance, so two $40 checkouts both took $40 from a $50 card); fixed with populate_existing, and the random run of 6 checkouts at once now adds up. Also kept recipients' names out of analytics. The card part with Stripe waits for the test key sitting.

## Outcome

- ✅ Impact: Retail's gift cards work end to end, safe against races, guessing and double spending.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: package 4 (returns and exchanges), then 5 (loyalty), 6 (website); Stripe test sitting at the end.
- 🧠 Reflection: SQLAlchemy's identity map keeps a row's old values through SELECT ... FOR UPDATE; a lock must also re-read (populate_existing). Only a real two-session race showed it.
