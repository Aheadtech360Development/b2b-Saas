# Feature Specification: Retail launch

**Feature branch**: `retail-plan`
**Created**: 2026-10-28
**Status**: Draft, for the manager's review
**Sources**:
- "Dev Plan Retail.pdf" (PrintCoPilot Dev Plan: Retail Launch and Affiliate Updates, Ikrash Maniya, 2026-10-25), 13 pages
- "PrintCoPilot Retail Page and Site Changes.html" (design, 4 boards: /retail page, Pricing "Retail brands" tab, Home changes, other pages)
- Owner's decisions, 2026-10-28 (section "Decisions taken")

## What this is

One new subscription plan, **Retail** ($79 a month), for brands that sell their own products
(streetwear, pet apparel, merch). It ships with four buyer-facing features the platform does not
have today (order tracking page, gift cards, returns and exchanges portal, loyalty and referral
rewards), the marketing site changes that sell it, and the affiliate rules that pay partners for it.
Print plans (Starter, Wholesale, Scale) are unchanged.

## User Scenarios & Testing

### User Story 1: A brand starts and runs a Retail store (Priority: P1)

A brand owner arrives from /retail or the Pricing page's Retail tab, signs up with `plan=retail`,
gets a 14 day trial with no card, and a store without the Gang Sheet Builder, wholesale tools or
supplier catalogs. The owner can move between Retail and a print plan from Billing, keeping the
store, customers, orders and settings. Near the plan's order limit the owner is warned; buyers are
never stopped at checkout.

**Independent test**: sign up through `/signup?plan=retail` (Stripe test mode), see Retail in
Billing, confirm the hidden tools 404/403 in the admin API and are absent from the sidebar, switch
to Starter and back, place 160 and 200 orders and see the 80% and 100% warnings while checkout
still works.

**Acceptance scenarios**
1. Given a visitor on `/retail?ref=CODE`, when they sign up from it, then the shop is on Retail with
   a 14 day trial and the partner referral is saved against CODE.
2. Given a Retail shop, when the owner opens the admin, then Gang Sheet Builder, wholesale accounts,
   pricing tiers, net terms, matrix ordering, Quick Buy, invoices for net terms and supplier catalogs
   are not shown and their admin routes answer "not on your plan".
3. Given a Retail shop with 2 users (owner included), when the owner invites a third, then it is
   refused with an upgrade prompt.
4. Given a Retail shop at 160 orders this month, then the admin shows an 80% notice and the owner
   gets one email; at 200, a 100% notice and one email; the 201st buyer checks out normally.
5. Given a Retail shop, when the owner switches to Starter, then Stripe prorates, the plan's tools
   switch on, and nothing in the store is lost; switching back hides them again.

### User Story 2: A buyer follows an order without emailing the store (Priority: P2)

From the order email, the shipping email or their account, a buyer opens the order's tracking
page: a timeline (Paid, Packed, Shipped, Out for delivery, Delivered), the courier, tracking
number and courier link, one timeline per shipment. A guest opens it with order number and email.

**Acceptance scenarios**
1. Given an order shipped with a Shippo label, when the courier reports it delivered, then the page
   shows Delivered with the date and the buyer gets the delivered email.
2. Given a courier that reports nothing, when the owner sets "Delivered" by hand on the order, then
   the page and the order list show the same status.
3. Given a guest, when they enter an order number with the wrong email, then they see the same
   "not found" as for a number that does not exist, and repeated tries are rate limited.
4. The page never shows the full address (city and postcode only), phone or payment details.

### User Story 3: Gift cards (Priority: P3)

A buyer picks an amount, enters the recipient's name, email and a message, and pays. The recipient
gets a code by email; the buyer gets a receipt. At checkout the code pays for all or part of an
order; what is left stays on the card. The owner lists, issues, adjusts and disables cards, each
with a reason, and sees total sold, redeemed and outstanding.

**Acceptance scenarios**
1. A $50 card used on a $30 order leaves $20; used on an $80 order, the buyer pays $30 by card.
2. A gift card cannot pay for a gift card.
3. Ten wrong codes from one visitor are refused before the code is even looked up (rate limit).
4. Two checkouts racing for the same $50 card cannot spend more than $50 between them.
5. Refunding an unused card's order voids the code; a used or part used card is not refundable.

### User Story 4: Returns and exchanges portal (Priority: P4)

A buyer (account or guest with order number and email) starts a return or exchange for a delivered
order inside the shop's window, picks items, quantities and a reason, and for an exchange the
replacement variant (out of stock variants blocked). The owner reviews every request in one list:
approve, decline with a message, mark received (restock or not), refund through Stripe, or create
the exchange order. Each status change emails the buyer and is logged with who made it.

**Acceptance scenarios**
1. A return can start only on a delivered order inside the window; final sale items cannot be picked.
2. A refund never exceeds what was paid for the returned items.
3. An exchange creates the replacement order and adjusts stock; a price difference is charged or refunded.
4. A refund reverses the order's loyalty points and any referral reward.

### User Story 5: Loyalty and referral rewards (Priority: P5)

Buyers earn points on paid orders and for referring friends; the owner sets every rule (on or off,
points per dollar, which orders count, reward tiers, referral rewards, expiry, wording). A buyer
sees balance, history and rewards in their account and the balance in the cart; redeeming creates
a single use discount code that applies at checkout.

**Acceptance scenarios**
1. Points post when an order is paid and reverse on a full refund; a partial refund reverses in
   proportion; cancelled and unpaid orders earn nothing.
2. A referral rewards both sides after the friend's first paid order; self referral (same email,
   card fingerprint or address) is blocked and flagged to the owner.
3. Every points change is a ledger row with a reason; the owner can adjust by hand with a reason.

### User Story 6: The marketing site sells Retail (Priority: P6)

A new `/retail` page, a Print and wholesale / Retail brands toggle on Pricing (Print stays the
default), one Retail plan card, the full comparison, and copy changes on Home, Features, About,
Demo, Contact, Affiliate and Sign up, as on the design boards. Published only when every feature
the pages call live works for a real test store.

### User Story 7: Partners earn on Retail (Priority: P7)

Retail's monthly price is commissionable: one commission line per paid invoice at the partner's
rate (20% Standard = $15.80, 30% Preferred = $23.70), 30 day hold, clawback on refund, nothing on
proration lines; signups through `/retail?ref=CODE` attributed.

### Edge cases

- A print shop with open gang sheet orders switches to Retail: existing orders stay visible and
  workable; only new gang sheet sales stop (the builder is hidden).
- A Retail shop is over its order limit: nothing is blocked for buyers; the owner sees the notice
  until the month turns or they upgrade.
- An order paid entirely by gift card: no Stripe charge, the order is paid, no platform fee.
- A gift card used on an order that is later refunded: the gift card part goes back to the card,
  the card part to the card (Stripe).
- A partial refund on an order that earned points and used a reward code.
- A multi shipment order: each shipment its own timeline; "Delivered" for the order when all are.
- A courier never reports delivery: the return window cannot open until the owner marks it delivered.
- A guest order whose buyer later makes an account with the same email.
- Time zones: limits count calendar months in UTC until the shop time zone setting is live.
- Currency: USD only (the platform sells US and Canada in USD today).

## Requirements

### Functional requirements

**Plan and billing (package 1)**
- FR-101: A plan `retail` exists beside starter, wholesale and scale: $79/month, interval month,
  lookup key `printcopilot_retail_monthly`, gang sheet commission 0, limits 200 orders a month and
  2 staff accounts (owner included), 1 custom domain.
- FR-102: Retail's feature set is the base set minus `gang_sheet`, `gang_sheet_ai`, the wholesale
  toolset and `supplier_catalog`, plus the new retail features; `mobile_app` stays Scale only.
- FR-103: Limits are enforced for Retail only (owner's decision); the other plans keep their
  limits as information until the manager says otherwise.
- FR-104: Every order created in the calendar month counts toward the order limit, whatever its
  status (owner's decision). Warnings at 80% and 100%, once each per month, in the admin and by
  email to the owner. A buyer's checkout is never blocked by a limit.
- FR-105: Adding a user beyond the staff limit is refused with an upgrade prompt; existing users
  are never removed by a limit.
- FR-106: Signup keeps `plan=retail`, the partner cookie and a typed referral code.
- FR-107: Billing shows the plan, the next invoice date and the switch between Retail and the print
  plans, with Stripe proration.

**Order tracking (package 2)**
- FR-201: Shipments are records of their own (an order has zero or more), each with courier,
  tracking number, tracking URL, status, shipped_at, delivered_at, and an event history.
- FR-202: Statuses come from the brand's own Shippo connection; where a courier does not report,
  the owner sets the status by hand from the order. The order list shows the same status.
- FR-203: The tracking page is reachable from the account, from emails (signed link, no typing)
  and by guest lookup (order number + email), rate limited, with no enumeration.
- FR-204: Emails on shipped and on delivered, in the brand's name, linking to the page.
- FR-205: The owner can turn the page off and add a short message.

**Gift cards (package 3)**
- FR-301: Settings: on or off, preset amounts, optional custom range, optional expiry (off by
  default, with a note to check local law).
- FR-302: Codes are random and unguessable, shown masked in the admin, never stored in plain text.
- FR-303: A gift card is a tender at checkout (pays part or all of the order), not a discount; tax
  and shipping are computed on the order as usual.
- FR-304: Every balance change is a ledger row with a reason, the order that caused it and who did it.
- FR-305: Concurrent spends cannot overdraw a card.
- FR-306: Recipient email with code, amount and store link; buyer receipt; balance check page.

**Returns and exchanges (package 4)**
- FR-401: Built on the existing returns (rma_requests / rma_items), extended with type (return or
  exchange), the new statuses, refund method, replacement variant and an event log.
- FR-402: Settings: on or off, window in days after delivery, reasons list, final sale rules, who
  pays return shipping, instructions, refund methods (original payment, store credit as a gift
  card code, exchange only).
- FR-403: Refunds go through the existing Stripe refund path, capped at what was paid for the items.
- FR-404: An exchange creates a new order for the replacement (no charge, or the difference charged
  or refunded) and moves stock.

**Loyalty and referrals (package 5)**
- FR-501: Settings as listed in the PDF; no point values fixed in code.
- FR-502: Ledger of every change with reason, order and expiry; balance kept on the account.
- FR-503: Redeeming creates a single use discount code through the existing discount engine.
- FR-504: Buyer referrals are separate from the affiliate program in code, data and screens.
- FR-505: Emails when points are earned and before a reward expires.

**Website (package 6)** and **Affiliate (package 7)**: as on the design boards and the PDF's
affiliate table; see plan.md for what each page change touches.

### Key entities

Plan (code catalogue), Shipment, ShipmentEvent, GiftCard, GiftCardLedger, LoyaltyAccount,
LoyaltyLedger, BuyerReferral, RMARequest (extended), RMAItem (extended), RMAEvent, per-shop
settings for tracking, gift cards, returns and loyalty.

## Decisions taken (owner, 2026-10-28)

| Question | Decision |
|---|---|
| What counts toward 200 orders a month | Every order created that month, whatever its status |
| "2 staff accounts" | 2 users including the owner |
| S&S / SanMar catalogs on Retail | Hidden; print plans only |
| Limits on Starter / Wholesale / Scale | Not enforced yet; Retail only for now |
| Mobile app on Retail | Not included (stays on Scale) unless the manager says otherwise |

## Open questions for the manager

1. **The /retail page and the Retail card call these live, and they do not exist today**: automatic
   discounts, abandoned cart emails (detection exists as a background task that does not run on the
   live server; reminders are manual only), back in stock alerts, pre-orders, free shipping bar, cart
   upsells and bundles, wishlist, email and SMS signup popup (SMS has no provider). Build them, or
   take them off the pages before they publish.
2. The live Pricing page already says "SanMar catalog: Included"; SanMar is not built.
3. Competitor prices on the page must be checked on each vendor's own page and dated before publishing.
4. Stacking: can a loyalty reward code and another discount code apply to one order? (The engine
   takes one code per order today; a gift card is a tender and always combines.)
5. Loyalty for guests: earn only with an account (proposed), or by email and claimed later?
6. The affiliate rule "ignore proration lines": today's ledger adds a switch's credit and charge
   together; the manager's test "a plan switch creates no commission on the proration line" needs
   that changed.
7. Non-US stores: the copy says global; the platform sells US and Canada in USD only.

## Success criteria

- SC-1: Every "Launch checks" line in the PDF passes in Stripe test mode on a real test store.
- SC-2: No feature is called live on a published page unless it works for that test store.
- SC-3: No buyer checkout is ever blocked by a plan limit (tested at 100% and beyond).
- SC-4: Gift card balances, points and refunds reconcile to their ledgers exactly (sum of ledger
  rows = stored balance) after a randomized concurrency test.
- SC-5: Guest lookups (tracking, returns, gift card balance) are rate limited and leak nothing
  about orders or codes that do not match.
