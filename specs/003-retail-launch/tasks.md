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
- [x] T203 `services/tracking_poll.py`: every 30 min, Redis lock, due shipments shop by shop with the shop's Shippo key (platform's as fallback), 1 call a second, `shippo_service.tracking_status` + `shippo_carrier`; no news keeps the last status; a parcel no courier name maps to is left to the shop; the order's delivered email goes in the shop's name.
- [x] T204 `api/v1/tracking.py`: `POST /storefront/track` (number + email in the body; 10 per 15 min per visitor, 5 an hour per order; one 404 wording) and `GET /storefront/track/{number}` (view key from the email link, or the signed-in buyer); `order_tracking` feature key in every plan and on the public path; city / state / postcode only.
- [x] T205 Shipped and delivered mails link to the shop's own tracking page (`tracking_page.link`, view key in the fragment) when the page is on.
- [x] T206 Storefront `/track-order` rebuilt on the new lookup, `/track/<number>` for email links; buyer's order page shows each parcel's steps; admin order page "Parcels" panel (add a parcel, set where it is by hand, history); Settings → Shipping and pickup: page on/off and message. Staff permissions: `/admin/shipments` = orders, `/admin/tracking` = settings.
- [x] T207 Checks: tests/test_shipments (13), tests/test_tracking_page (11), frontend order-tracking (3); local DB + Redis (scratchpad tracking_local_check.py): loop delivers and emails, wrong email = made-up number, no street, view key opens, off says so and drops the email button. The old `GET /guest/orders/{number}?email=` now rate limited and no longer logs the email.

## Phase 3: Package 3, gift cards

- [x] T301 Migration `0069_gift_cards`: `gift_cards`, `gift_card_holds`, `gift_card_ledger`, RLS + FORCE + `app_rls` grant on each; balance and balance_after >= 0, amounts > 0, status / source / kind checks; idempotency key unique per shop. Up, down and up again on the local DB; a fresh database migrates 0001 to 0069.
- [x] T302 Codes: 16 Crockford base32 characters (80 bits), typed any way (spaces, dashes, lower case, O for 0, I/L for 1); SHA-256 of shop + code, last 4 kept; the full code shown once (recipient email, admin issue, admin "send a new code").
- [x] T303 `services/gift_cards.py`: issue, hold, release, capture, take_now, refund, adjust, set_status (disable / on / void), rotate_code, release_due, expire_due; every move under `SELECT ... FOR UPDATE` with `populate_existing` (a card read before the lock must not keep its old balance: found by the race check); idempotency keys; settings (`gift_cards` tenant key, off by default, expiry never or 5 to 10 years); wrong-code limit 10 per 15 min / 50 a day per visitor and shop, refused before any lookup; unknown and disabled codes answer the same. 5 minute loop in main.py (lock `gift-cards:timed`).
- [x] T304 Cart line `gift_card` (account cart `POST /cart/gift-card`, guest cart `gift_card` line, carried into the account at sign-in): one card per line, the shop's amounts only, no shipping, no tax, no discount code, paid by card only, never with another gift card. Issued when the order is paid (`purchase:{order}:{line}:{n}`, idempotent), code emailed to the recipient in the shop's name, receipt without the code to the buyer.
- [x] T305 Checkout, signed in and guest: codes go with the payment step (`gift_card_codes`, `checkout_ref` = the page's attempt key); holds made in id order, card charged the rest (never under $0.50), split in the intent's metadata; confirm captures (or takes again if the hold ran out, refusing and refunding the card if the money is gone); the codes must be presented again (a payment intent id alone spends nothing); gift cards covering everything need no payment intent and no card setup (`payment_method: gift_card`). One card payment, one order (guest path now refuses a reused intent). `_check_charge` compares the card with the order less the gift cards.
- [x] T306 Refunds (`issue_refund`): card first up to what it paid, then back onto the gift cards that paid; gift-card-only orders refund with no Stripe; `remaining_refundable`, `resync_order` and the charge fallback count gift card refunds; cards the order sold go back whole, only unused (locked until the refund commits), and are voided.
- [x] T307 Admin Marketing → Gift cards (list masked, search by full code / last 4 / email, report, issue with the code shown once, history, adjust with a reason, disable / on / void with a reason, send a new code, settings); staff: Marketing to read, Billing too to issue, adjust, change status or make a new code. Order page: what gift cards paid and got back, cards sold. Storefront `/gift-cards` (buy) and `/gift-cards/balance`; checkout gift card box with the split in the summary; cart shows "emailed to"; `track` and `gift-cards` reserved in the website builder. Not built: a website builder block (the owner links /gift-cards from a menu).
- [x] T308 Checks: tests/test_gift_cards (52); frontend gift-cards (6) + gift-cards-admin (4); local DB end to end through the API (scratchpad gift_cards_local_check.py, 52 checks): $50 card on a $22 order, re-pricing gives the hold back, retry is the same order, no code no spend, a gift card cannot buy one, 10 wrong codes then refused, two $40 checkouts on one $50 card get $40 and $10, held money back after 30 minutes, refunds $10 then the rest onto the card, disabled answers like unknown, void, expiry, another shop cannot see or use it; random run (6 checkouts at once, 245 moves): every ledger adds up, no hold both spent and given back. Stripe card part (an $80 order on a $50 card) waits for the test key sitting.

## Phase 4: Package 4, returns and exchanges

- [x] T401 Migration `0070_returns_portal`: rma_status + received / refunded / exchanged / closed (autocommit block); rma_requests kind, refund_method, channel, guest_email, refunded_amount, exchange_order_id, store_credit_card_id, submitted_by_id nullable; rma_items replacement_variant_id, received_quantity, restock; `rma_events` with RLS. Up, down, up on the local DB.
- [x] T402 Settings (`returns_portal` tenant key, off by default): window 1 to 365 days, reasons, made-to-order final sale, final sale products, who pays return shipping, instructions (in the approval email), ways to put it right (original, store credit, exchange). Admin: Returns → "Returns portal".
- [x] T403 Buyer (`/account/returns`, own orders only) and guest (`/storefront/returns/lookup` number + email, 10 per 15 min per visitor, 5 an hour per order, one 404 wording; 30 minute signed key for that order): delivered + paid + inside the window; per line returnable = ordered less returns not declined; gift cards and made-to-order final sale; exchange only for an in-stock size or colour of the same product. Storefront `/returns`; account "Request a return" uses the portal when it is on (the old form otherwise).
- [x] T404 Admin (`/admin/returns/{id}/...`): approve, decline, receive (what came back, back on the shelf as an inventory adjustment "returned"), refund-items (to the payment through issue_refund: card then gift cards; or store credit as a gift card emailed to the buyer; capped at what was paid for the items, their share of discount and tax), exchange (replacement order, stock moved, dearer: difference left on the order with its pay link; cheaper: difference refunded after the exchange is saved), close; one transition each, row lock with populate_existing; `rma_events` + order history + an email in the shop's name for every step. Refund and exchange need Billing. The old reprint / refund / reject decisions now email in-process (they were queued to a Celery worker live does not run).
- [ ] T405 Loyalty reversal on refunds: with package 5.
- [x] T406 Checks: tests/test_returns_portal (13); frontend returns-portal (5); local DB through the API (scratchpad returns_local_check.py, 34 checks): portal off, not delivered, wrong email = made-up number, too many, bad reason, forged and old keys, both large tees spoken for, approve twice refused, cap $8, received + restocked (+1 stock), over cap refused, store credit card $8, exchange order at no charge (medium off stock), refund onto the gift card that paid, window closed after 30 days, history, another shop 404, lookups limited.

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
