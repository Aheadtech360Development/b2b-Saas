# Implementation Plan: Retail launch

**Branch**: `retail-plan` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)

## Summary

Retail is a fourth plan in the plan catalogue the platform already has, not a second product:
the same stores, checkout, Stripe Connect and admin, with print and wholesale tools switched off by
plan flags. Four buyer features are new (tracking page, gift cards, returns and exchanges portal,
loyalty and referrals); each is a feature key any plan can carry, each has its own tables with
tenant isolation in Postgres, and every money or points movement is an append-only ledger row
written under a row lock with an idempotency key. The marketing site changes go out last, behind
a publish gate: nothing is called live on a page until it works for a real test store.

## Technical context

| | |
|---|---|
| Backend | FastAPI, SQLAlchemy 2 async, Postgres (Railway), Alembic; Redis; uvicorn only on live (no Celery worker: timed work runs as in-process loops in `main.py` lifespan behind a Redis lock) |
| Frontend | Next.js app router on Vercel; admin `.pc-*` kit, buyer portal `.cp` kit, storefront classic pages + website builder (`render.tsx` / `ThemeProductBuy`), marketing site `components/marketing/*` |
| Tenancy | `TenantMixin` + ORM auto scoping (`core/tenant_scope.py`) + Postgres RLS (`app_rls` role, policy `tenant_isolation`, FORCE) on every tenant table |
| Plans | `core/billing_plans.py` (price, limits, commission), `core/features.py` (feature keys, plan defaults, `PATH_FEATURES` gating); Stripe prices found or created by lookup key at checkout; switch with proration (`BillingService.switch_plan`) |
| Payments | Stripe Connect direct charges on the brand's account; refunds via `payment_service.create_refund` / `refund_service.record_refund` |
| Shipping | Shippo with the brand's own key; `shippo_service.track_package` (poll) exists; orders carry one `tracking_number` / `tracking_url` |
| Returns | `rma_requests` / `rma_items` (pending, approved, rejected, completed), admin Returns and reprints (`services/returns.py`), buyer portal request (`/account/rma`) |
| Discounts | `discount_codes` (usage limits total and per customer, eligibility, dates); one code per order |
| Mail | mail builders + `mail_layout`, in the brand's name (`use_brand_identity`) |
| Per shop settings | `core/tenant_settings.py` (`get_setting` / `set_setting`, tenant namespaced keys, no migration) |
| Partners | `services/partners/*`: `commissionable_plans` setting filtered by `PLAN_ORDER`; `ledger.invoice_earning` |
| Rate limits | `core/rate_limit.enforce_rate_limit(request, scope, limit, window, extra)` (Redis) |

## House rules this must keep (constitution check)

- A new product or plan needs no per product code: everything here is data (plan catalogue, feature keys, settings).
- Never plan-gate a shared buyer path (cart, checkout, sign in). Only feature-specific buyer routes are gated.
- Every tenant table: `tenant_id`, RLS policy as in 0056/0067, indexes leading with `tenant_id`; Redis keys namespaced.
- Buyer mail goes out in the brand's name only.
- No browser dialogs (`lib/dialog.tsx`); no `window.confirm`.
- Alembic revision ids at most 32 characters; each package carries its own migration.
- Money is `Numeric(12,2)` / `Decimal`, as everywhere else in this codebase (the PDF's "integer cents" is met by exact decimals; one representation across orders, refunds and ledgers).
- Never send thousands of long keys to Postgres as one array parameter (learned 2026-10-28 on price tables).
- Nothing is called live on a published page until it works (spec SC-2).

## Scope

**In**: packages 1 to 7 of the PDF; the design boards' page changes; the owner's decisions of 2026-10-28.

**Out (until the manager decides, spec "Open questions" 1)**: automatic discounts, abandoned cart
emails, back in stock and pre-orders, free shipping bar, cart upsells and bundles, wishlist, email
and SMS signup popup. The pages must not call them live; see "Publish gate".

**Dependencies**: Stripe (test mode for every launch check, then live), Shippo (brand keys), the mail
provider, Railway Postgres backups (prerequisite, see Risks), Vercel.

## Key decisions

| # | Decision | Alternatives considered | Why |
|---|---|---|---|
| D1 | Retail is a 4th entry in `BILLING_PLANS` / `PLAN_FEATURES` with `enforce_limits: true`; print plans keep `false` | A separate "retail mode" flag on shops; a separate app | Feature access, Stripe, switching, partner commission and the console already key off the plan; one more entry reuses all of it |
| D2 | The four new features are feature keys (`order_tracking`, `gift_cards`, `returns_portal`, `loyalty`) in the base set of every plan | Retail only | The Features page (all plans) calls them live; a print shop asking for gift cards should not need Retail. Manager can narrow it to Retail in one line |
| D3 | Returns extend `rma_requests` / `rma_items` (type, statuses, refund method, replacement variant, event log); no `return_requests` tables | New tables per the PDF | Two returns systems would split the admin list, the refund path and reports. The PDF's fields map onto the existing rows |
| D4 | Shipments become their own table (many per order), status from Shippo by polling with the brand's key; manual status by the owner | Shippo webhooks | Each brand has its own Shippo account: webhooks would need registering per brand and per tracking number; polling a few hundred shipments a day per brand is cheap and needs nothing from the brand |
| D5 | A gift card is a tender, not a discount: it pays part or all of the order after tax and shipping | Treat as a discount code | Tax and shipping must apply to the order (PDF); a discount would cut the taxable amount and mix with the one-code rule |
| D6 | Gift card spend uses holds: at payment intent creation the amount is debited under `SELECT ... FOR UPDATE` into a hold; captured on payment success, released on failure or after 30 minutes | Debit after payment | Debiting after the card is charged allows two checkouts to overspend one card and leaves no way out but a refund |
| D7 | Gift card codes: 16 random characters (Crockford base32, 80 bits), shown as XXXX-XXXX-XXXX-XXXX, stored as SHA-256 of the normalized code (unique per tenant) plus the last 4 | Store the code; keyed HMAC | Plain storage leaks every balance with a database copy; an HMAC key would break every card on a key rotation (keys were rotated after the Railway incident). 80 random bits need no key |
| D8 | Loyalty: points are integers; ledger rows carry `expires_at` and `remaining` (FIFO consumption); the account keeps `balance` updated in the same transaction | Balance computed on read | Constant-time balance in the cart; FIFO makes expiry exact; ledger stays the audit trail |
| D9 | Redeeming a reward creates a single use `discount_codes` row (`usage_limit_total = 1`, tied to the buyer, random code) | A new reward type in checkout | PDF asks for the existing engine; checkout already knows codes |
| D10 | Order limit counts every order created in the UTC calendar month (owner: every status); notices at 80% and 100%, once each per month, recorded in tenant settings (`plan_limit_notice`); the admin notice is read live, the owner's email goes from an hourly in-process loop (`services/plan_usage`) | A check inside order creation | Nothing touches the checkout path, so a limit can never fail or slow an order; an hour's delay on an email is harmless |
| D11 | Per shop settings (tracking, gift cards, returns, loyalty, limit notices) live in `tenant_settings` as validated JSON | One settings table each | The codebase's pattern for per brand settings; no migration per setting |
| D12 | `/retail` is a platform route like `/pricing`: on a brand's host it draws the shop's own page at `/retail`; `ReferralCapture` moves into `MarketingShell` so every marketing page keeps `?ref=` | A page only on the home host | Same pattern as every marketing page; the partner cookie must survive /retail and /pricing (PDF) |
| D13 | Affiliate ledger skips Stripe lines with `proration: true`; commission follows the new plan from the next full invoice | Keep netting proration lines (today) | PDF test "a plan switch creates no commission on the proration line" |

## Data model and migrations

Every new table: `id uuid pk`, `tenant_id uuid not null`, `created_at`, `updated_at`, RLS enabled and
forced, policy `tenant_isolation`, grants to `app_rls`. Indexes lead with `tenant_id`.

**0068_retail_shipments** (package 2)
- `shipments`: `order_id` FK orders (cascade), `carrier`, `service`, `tracking_number`, `tracking_url`,
  `status` (`label_created`, `in_transit`, `out_for_delivery`, `delivered`, `returned`, `failure`, `unknown`),
  `status_source` (`courier` | `manual`), `shipped_at`, `delivered_at`, `last_checked_at`, `next_check_at`.
  Indexes: `(tenant_id, order_id)`; partial `(next_check_at) where status not in ('delivered','returned')`.
- `shipment_events`: `shipment_id` FK cascade, `status`, `source`, `note`, `occurred_at`.
- Backfill: one shipment per order that has a `tracking_number`, status from `orders.status`.
  `orders.tracking_number` / `tracking_url` stay, written from the first shipment, so nothing that reads them breaks.

**0069_gift_cards** (package 3)
- `gift_cards`: `code_hash` (unique with tenant), `code_last4`, `initial_amount`, `balance` (check >= 0),
  `currency`, `status` (`active` | `disabled` | `voided` | `expired`), `expires_at`, `source`
  (`purchase` | `manual` | `store_credit`), `purchase_order_id`, `buyer_user_id`, `buyer_email`,
  `recipient_name`, `recipient_email`, `message` (max 500), `delivered_at`, `created_by_user_id`.
- `gift_card_holds`: `gift_card_id`, `order_id` or checkout reference, `payment_intent_id`, `amount`,
  `status` (`held` | `captured` | `released`), `expires_at`.
- `gift_card_ledger`: `gift_card_id`, `kind` (`issue`, `hold`, `release`, `capture`, `refund`, `adjust`,
  `void`, `expire`), `amount` (signed), `balance_after`, `order_id`, `hold_id`, `actor_user_id`,
  `reason`, `idempotency_key` (unique with tenant).

**0070_returns_portal** (package 4)
- `rma_status` enum: add `received`, `refunded`, `exchanged`, `closed` (`pending` reads as Requested,
  `rejected` as Declined). `ALTER TYPE ... ADD VALUE` runs outside the migration's transaction block.
- `rma_requests`: add `kind` (`return` | `exchange`), `refund_method` (`original` | `store_credit` | `exchange`),
  `channel` (`account` | `guest` | `admin`), `guest_email`; `submitted_by_id` becomes nullable (guests).
- `rma_items`: add `replacement_variant_id`, `received_quantity`, `restock` (bool).
- `rma_events`: `rma_id`, `status`, `actor_kind` (`buyer` | `staff` | `system`), `actor_user_id`, `note`.

**0071_loyalty** (package 5)
- `loyalty_accounts`: `user_id` (unique with tenant), `balance` int (check >= 0), `lifetime_earned`,
  `referral_code` (unique with tenant).
- `loyalty_ledger`: `account_id`, `points` (signed), `kind` (`earn`, `reverse`, `redeem`, `referral`,
  `adjust`, `expire`, `restore`), `remaining` (earn rows), `expires_at`, `order_id`, `discount_code_id`,
  `refund_id`, `actor_user_id`, `reason`, `idempotency_key` (unique with tenant).
- `buyer_referrals`: `referrer_account_id`, `referred_user_id`, `referred_email`, `status`
  (`pending` | `qualified` | `rewarded` | `blocked`), `block_reason`, `first_order_id`, `rewarded_at`.

Package 1 needs no migration (plan catalogue and settings). Package 7 needs none.

## Interfaces

All admin routes need an admin session, the feature key (`PATH_FEATURES`) and the named permission;
money routes need the billing permission (as refunds do today). All buyer routes are tenant-bound by
host. Errors: 400 bad input, 403 not on your plan / not allowed, 404 not found (also for "not yours"),
409 conflict (state changed, card in use), 422 validation, 429 rate limited.

**Package 1: plan and billing**
- `GET /api/v1/admin/billing` (exists): plans now include Retail; `usage: {orders_this_month, orders_limit, percent, staff, staff_limit}`.
- `POST /api/v1/admin/billing/switch` (exists): Retail allowed.
- Onboarding: the plan from `?plan=` is the shop's plan from creation (validated with `is_valid_plan`).
- Staff creation and invites: refused at the limit with `403 {"code": "staff_limit", "plan": ...}`.

**Package 2: tracking**
- Admin: `GET/POST /api/v1/admin/orders/{id}/shipments`, `PATCH /api/v1/admin/shipments/{id}` (manual status with note). Label purchase creates the shipment.
- Buyer: `GET /api/v1/account/orders/{id}/tracking`.
- Public: `POST /api/v1/storefront/track` `{order_number, email}`; `GET /api/v1/storefront/track/{token}` (token = HMAC view key with expiry, the thank-you page's scheme). Response: statuses, carrier, tracking number, courier link, city and postcode only.

**Package 3: gift cards**
- Public: `GET /api/v1/storefront/gift-cards` (settings for the page); `POST /api/v1/storefront/gift-cards/balance` `{code}`.
- Cart and checkout: a cart line of kind `gift_card` `{amount, recipient_name, recipient_email, message}`; `POST /api/v1/checkout/gift-cards` `{code}` / `DELETE .../{last4}` to apply or remove; holds are created with the payment intent, captured by the payment success path, released on failure.
- Admin: `GET /api/v1/admin/gift-cards` (masked), `POST` issue, `POST /{id}/adjust` `{amount, reason}`, `POST /{id}/disable` `{reason}`, `GET /report`; settings `GET/PUT /api/v1/admin/gift-cards/settings`.

**Package 4: returns and exchanges**
- Buyer: `GET /api/v1/account/orders/{id}/returnable`, `POST /api/v1/account/returns` (extends `/account/rma`), `GET /api/v1/account/returns/{id}`.
- Guest: `POST /api/v1/storefront/returns/lookup` `{order_number, email}` -> short lived token; `POST /api/v1/storefront/returns` with it.
- Admin (extends `/api/v1/admin/returns`): `approve`, `decline {note}`, `receive {items, restock}`, `refund {amount}` (exists, capped), `exchange` (creates the order); settings `GET/PUT /api/v1/admin/returns/settings`.

**Package 5: loyalty and referrals**
- Buyer: `GET /api/v1/account/rewards`, `POST /api/v1/account/rewards/redeem {tier}`; cart response gains `points_balance`.
- Public: referral landing keeps `?bref=CODE` (separate name from the affiliate `?ref=`).
- Admin: `GET/PUT /api/v1/admin/loyalty/settings`, `GET /accounts`, `POST /accounts/{id}/adjust {points, reason}`, `GET /referrals` (with flags).
- Internal hooks: order paid -> earn; refund recorded -> reverse; first paid order of a referred buyer -> referral reward.

**Package 7: affiliate**
- `commissionable_plans` default adds `retail`; ledger skips `proration` lines; referral lists show and filter by plan.

## Money and points: how they stay right

- One transaction per movement: lock the balance row (`SELECT ... FOR UPDATE`), check, write the ledger
  row with `balance_after`, update the balance. A check constraint keeps balances at or above zero.
- Idempotency keys on every ledger row (`earn:{order_id}`, `reverse:{refund_id}`, `capture:{hold_id}`,
  `adjust:{request id}`): replays of webhooks or retries write nothing twice.
- Stripe calls carry idempotency keys (already the pattern for orders).
- A gift card covering the whole order: no payment intent; the order is paid in the same transaction
  as the capture; no application fee (none on Retail anyway).
- Refund of a mixed order: card part first through Stripe up to what the card paid, the rest back to
  the gift card as a `refund` ledger row (manager may choose proportional instead; one function).
- Loyalty earn runs from the order's paid event inside a savepoint: a loyalty failure never fails
  the order; a retry job re-runs missed earns (idempotent).
- Reconciliation check (test and admin report): sum of ledger rows = stored balance, per card and account.

## Security

| Surface | Threat | Control |
|---|---|---|
| Gift card codes | Guessing, enumeration | 80 random bits; SHA-256 at rest; rate limit failed tries 10 per 15 min per IP and shop, 50 a day; same reply for unknown and disabled; codes shown in full only once (email, manual issue) |
| Gift card spend | Double spend, races | Holds under row lock; balance check constraint; idempotent capture |
| Guest tracking and returns | Reading others' orders (order numbers are sequential) | Order number AND email must match; identical "not found"; 10 tries per 15 min per IP and 5 per order number an hour; emailed links use signed expiring tokens; address shown as city and postcode only |
| Account routes | IDOR | Every lookup by (tenant, buyer) not by id alone; 404 for "not yours" |
| Refunds | Over refunding | Cap at paid amount per item and per tender; billing permission; audit log |
| Loyalty | Self referral, farming points | Email, Stripe card fingerprint and normalized address checks; referral rewards only after the friend's first paid order; points only on paid orders; reversal on refunds; owner flags |
| Owner actions | Silent changes to money | Every issue, adjust, disable, refund and points adjustment needs a reason and writes the append-only audit log |
| Tenancy | Cross shop reads | ORM scoping + RLS on every new table; gift cards and codes looked up with tenant; Redis keys namespaced |
| Mail | Header or HTML injection through the gift message | Length limits; builders escape all buyer text |
| Plan limits | Bypassing staff limit | Enforced in the API on create and invite, not only in the UI |

## Background work (in-process loops, Redis lock, existing pattern)

| Job | Every | Does |
|---|---|---|
| `tracking_poll` | 30 min | Shipments due (`next_check_at`), brand by brand with its Shippo key, at most 1 call a second per brand; backoff 2 h, then 6 h after 3 days; stop after 30 days |
| `gift_card_holds` | 5 min | Release holds past `expires_at` |
| `loyalty_expiry` | daily | Expire earn rows past `expires_at` (FIFO), send "about to expire" 14 days ahead |
| `loyalty_retry` | hourly | Re-run earns for paid orders without an earn row (idempotent) |

## Mail (brand identity, mail builders)

Buyer: shipped, delivered, gift card to recipient, gift card receipt, return requested / approved /
declined / received / refunded / exchanged, points earned, reward about to expire, referral reward.
Owner: order limit at 80% and 100%, new return request, self referral flagged.

## Where it shows

- Admin: Billing (Retail card, switch, usage); Home notice at 80% / 100%; order page shipments
  panel and manual status; Returns and reprints extended (requests, decisions, receive, exchange);
  Marketing -> Gift cards; Customers -> Loyalty; Settings for tracking, returns, gift cards, loyalty.
- Storefront (classic and website builder): gift card page and builder block; checkout gift card
  field; cart points line; public `/track`, `/returns`, `/gift-cards/balance`.
- Buyer portal (`.cp`): order tracking, Returns flow, Rewards page with referral link.
- Marketing: `/retail` (new), Pricing toggle + Retail card + full comparison, Home, Features, About,
  Demo, Contact, Affiliate, Sign up title, footer tagline, `ReferralCapture` in `MarketingShell`,
  sitemap and meta for `/retail`.

## Non-functional budgets

- Tracking lookup, gift card apply, balance check: p95 under 300 ms.
- Order paid path: loyalty and limit checks add under 20 ms, never fail the order.
- Shippo: at most 1 request a second per brand key; a shipment checked at most every 2 hours.
- Mail: one message per event, deduplicated by idempotency key.

## Operations

- Logs carry tenant, order, card or account ids, never full codes or card data.
- Alerts (logs / console): gift card hold releases spiking, failed code tries spiking, tracking poll errors per brand, loyalty retry backlog.
- Runbooks: void and reissue a gift card; re-run points for an order; mark a shipment delivered; refund a mixed tender order; restore the database (needs backups, below).
- Rollout: each package behind its feature key, tested end to end in Stripe test mode locally, then
  live with the feature on for a test store only; the Retail plan is not offered on signup or
  pricing until package 6 publishes.
- Rollback: feature keys off (instant); migrations are additive (new tables and columns, enum values),
  so code can roll back without a down migration.

## Publish gate (package 6)

The /retail page, Pricing Retail tab and Features additions go live only when:
1. Every item on spec "Launch checks" passes on a real test store.
2. Every feature the pages call live exists; the manager has either built or removed the items in
   spec "Open questions" 1 (and the live "SanMar catalog" line).
3. Competitor prices are checked on each vendor's page and dated.

## Risks

1. **No database backups today** (Railway Hobby: "Upgrade to Pro to create new backups"). Money
   features (gift cards, refunds, points) must not go live until Pro backups, PITR and an off-site
   nightly dump exist and one restore has been tried.
2. **Pages promising what does not exist**: the /retail design calls about eight unbuilt features
   live. Publish gate above.
3. **Money correctness**: holds, locks, idempotency, reconciliation test, audit log; Stripe test mode first.
4. **Scope**: the open features are each the size of a package; they do not enter this plan without
   the manager's decision.

## Delivery order

0. Prerequisites: Railway Pro + backups + PITR + off-site dump; Stripe test keys in a local `.env` (never in chat).
1. Package 1, plan and billing (and package 7's two changes, which are small and touch the same plan list).
2. Package 2, tracking (feeds delivered status to returns).
3. Package 3, gift cards (returns' store credit needs it).
4. Package 4, returns and exchanges.
5. Package 5, loyalty and referrals.
6. Package 6, website, behind the publish gate.

## ADR candidates

- Retail as a plan in the existing catalogue, new features as plan-agnostic feature keys (D1, D2).
- Money and points ledgers: holds, row locks, idempotency, hashed gift card codes (D5 to D9).
- Shipment tracking by polling the brand's Shippo key (D4).
- Returns portal on the existing RMA tables (D3).
