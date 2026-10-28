# Tasks: Retail launch

**Input**: [spec.md](spec.md), [plan.md](plan.md)
**Format**: `[ID] [P?] Description` (P = can run beside the task before it). Each package ends with
its checks; a package goes live only on the owner's word, and money packages only after T000.

## Phase 0: Prerequisites

- [ ] T000 Owner: Railway Pro; Postgres Backups tab: Daily, Weekly, Monthly on; Enable PITR; one manual backup.
- [ ] T001 Off-site nightly dump (Railway "Postgres S3 backups" template to Cloudflare R2, private bucket, 30 day lifecycle); one restore into the local database to prove it.
- [ ] T002 Stripe test keys in the local `.env` (owner, never in chat) so every launch check runs in test mode.

## Phase 1: Package 1, Retail plan and billing

- [x] T101 `core/billing_plans.py`: `retail` plan ($79, `printcopilot_retail_monthly`, commission 0, limits 200 orders / 2 staff incl. owner / 1 domain, `enforce_limits: True`, `public: False` until launch); print plans `public: True`; `PLAN_ORDER` gains `retail` first; `public_pricing_table` lists public plans only.
- [x] T102 `core/features.py`: `PLAN_FEATURES["retail"]` = base minus `gang_sheet`, `supplier_catalog` (wholesale toolset, `gang_sheet_ai`, `mobile_app` already outside the base). The new feature keys join the catalogue with their own packages, so the console never shows a switch for something not built.
- [x] T103 `services/plan_usage.py`: orders this UTC month (every status), staff (non-buyer users, owner included); notices at 80% / 100% once per month (`plan_limit_notice` tenant setting), owner email (`mails.order_limit_notice`) from an hourly loop with a Redis lock; never on the checkout path.
- [x] T104 Staff limit on adding a user and on switching a user back on (`403 staff_limit`, message names the plan); Retail only.
- [x] T105 Signup already takes `plan` (`/api/v1/signup`, `is_valid_plan`), so `/signup?plan=retail` makes a Retail shop; the plan name shows on the sign-up page once Retail is public.
- [x] T106 Admin: Billing shows this month's orders and staff against the plan where limits bind; Home shows the 80% / 100% notice (`GET /api/v1/admin/billing/usage`). The Retail card on Billing appears when the plan turns public.
- [x] T107 [P] Package 7 part: `commissionable_plans` defaults include `retail` (a saved setting needs Retail ticked in the console); `ledger.invoice_earning` skips proration lines in both Stripe shapes. Plan names show on the partner portal's and the console's referral lists (Retail included); console filters by plan on Referrals (Retail added), Ledger (`plan`, the plan stored on each line) and Affiliates (`shop_plan`, partners with a referred shop on it).
- [ ] T108a Local Stripe TEST mode: `backend/.stripe-test.env` (git-ignored) holds `STRIPE_SECRET_KEY_TEST=sk_test_...`; `run_local.py` reads only test keys from it and refuses a live key. Waiting on the owner's test key.
- [ ] T108 Checks: pytest for plan gating (every `PATH_FEATURES` path for Retail), limits (160, 200, 201 orders; checkout never blocked), staff limit, signup plan, partner ledger (Retail $79 -> $15.80 at 20%, replay -> 0, proration line -> 0, refund -> clawback); Stripe test mode switch Retail <-> Starter with proration.

## Phase 2: Package 2, order tracking

- [x] T201 Migration `0068_retail_shipments` (+ RLS, backfill from `orders.tracking_number`, comma lists split). Local: 33 of 33 orders with numbers backfilled.
- [x] T202 `services/shipments.py`: `record_safely` (savepoint) from both label purchases, the status route's typed number (Copilot goes through it), and both S&S paths; `set_status` with events; a shipped order turns delivered when every parcel is; marking an order delivered by hand delivers its parcels. Callers keep writing `orders.tracking_*`.
- [ ] T203 `tracking_poll` loop (brand Shippo key, backoff, rate cap) mapping Shippo statuses.
- [ ] T204 Public `/storefront/track` (order number + email, rate limited, no enumeration) and signed link; account tracking route.
- [ ] T205 Mails: shipped, delivered (brand identity) with the signed link.
- [ ] T206 Storefront `/track` page, portal order tracking, admin shipments panel; settings (on/off, message).
- [ ] T207 Checks: guest lookup wrong email = unknown order; rate limit; masked address; multi shipment; manual status shows in order list; delivered sets `delivered_at`.

## Phase 3: Package 3, gift cards

- [ ] T301 Migration `0069_gift_cards` (+ RLS, check constraints).
- [ ] T302 Code generator (Crockford base32, 80 bits) and SHA-256 lookup per tenant; masked display.
- [ ] T303 Ledger service: issue, hold, release, capture, refund, adjust, void, expire; row locks; idempotency keys.
- [ ] T304 Cart line `gift_card` (no shipping, no tax, cannot be paid with a gift card); fulfilment on payment: issue card, mail recipient and buyer.
- [ ] T305 Checkout: apply/remove code; holds with the payment intent; capture on success; release on failure; full gift card payment without Stripe; `gift_card_holds` loop.
- [ ] T306 Refund path: card part first, then back to the gift card; unused gift card order refund voids the code.
- [ ] T307 Admin Gift cards page (list, issue, adjust, disable with reason, report) + settings; storefront gift card page + builder block; balance page.
- [ ] T308 Checks: $50 card on $30 and $80 orders; two concurrent checkouts on one card never overspend; rate limit on wrong codes; gift card cannot buy a gift card; refunds; ledger sum = balance after a randomized run.

## Phase 4: Package 4, returns and exchanges

- [ ] T401 Migration `0070_returns_portal` (enum values outside the transaction, new columns, `rma_events`).
- [ ] T402 Settings (window, reasons, final sale, shipping payer, instructions, refund methods).
- [ ] T403 Buyer and guest start: delivered + window + not final sale; exchange variant with stock check.
- [ ] T404 Admin decisions: approve, decline, receive (restock or not), refund (capped, billing permission), exchange order (difference charged or refunded), store credit as gift card; events + mails for each status.
- [ ] T405 Loyalty reversal hook on refunds (no-op until package 5).
- [ ] T406 Checks: window and delivery rules; never refund more than paid; exchange adjusts stock; guest token scope and expiry.

## Phase 5: Package 5, loyalty and referrals

- [ ] T501 Migration `0071_loyalty` (+ RLS).
- [ ] T502 Settings (on/off, points per dollar, eligible orders: paid only excl. shipping and tax, tiers, referral rewards, expiry, wording).
- [ ] T503 Ledger service: earn on paid (savepoint, idempotent), reverse on refund (proportional), redeem (single use discount code), adjust, expire (FIFO), retry loop.
- [ ] T504 Buyer referrals: `?bref=` capture, qualify on first paid order, self referral checks (email, card fingerprint, address), owner flag.
- [ ] T505 Portal Rewards page, cart points line, mails (earned, expiring, referral), admin Loyalty (accounts, adjust, referrals).
- [ ] T506 Checks: paid / cancelled / unpaid / partial refund cases; self referral blocked; ledger sum = balance.

## Phase 6: Package 6, website (publish gate)

- [ ] T601 `/retail` route (platform host only, shop page on brand hosts) and `components/marketing/pages/Retail.tsx` from board 1; meta + sitemap.
- [ ] T602 Pricing: Print and wholesale / Retail brands toggle (Print default, `?tab=retail` opens Retail), one Retail card, full comparison; Retail tab hides gang sheet commission, calculator, Wholesale and Gang Sheet Builder compare sections.
- [ ] T603 Home (link under hero, 7th card, link under plan cards, FAQ answer), Features (top line, sections 09 to 12), About, Demo (business type), Contact, Affiliate (shop -> business), Sign up title, footer tagline on every page.
- [ ] T604 `ReferralCapture` in `MarketingShell`; signup links carry `plan=retail`.
- [ ] T605 Remove or keep, per the manager: every unbuilt feature the boards call live; "SanMar catalog" on the live Pricing page; competitor prices checked and dated.
- [ ] T606 Checks: page tests for each change; mobile layout; every claim on the pages maps to a working feature (spec SC-2).
