---
id: 322
title: Accounts per shop and card discount
stage: green
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: sign-up says the email exists when it does not; no address autocomplete; a 90% discount order charged the full amount to the card
labels: ["auth", "multi-tenant", "users", "checkout", "stripe", "discounts"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0058_user_email_per_brand.py (users.email unique per brand, not platform-wide)
 - backend/app/models/user.py (the same, in the model)
 - backend/app/services/auth_service.py (sign-up checks this shop; reset token on one account, chosen by shop)
 - backend/app/services/tenant_auth_service.py (root sign-in picks the account whose password it is)
 - backend/app/core/database.py (email_owner asks about one shop; email_taken_here)
 - backend/app/api/v1/auth.py (forgot-password and resend-activation by shop)
 - backend/app/api/v1/admin/users.py, admin/customers.py, account.py, guest.py, services/wholesale_service.py (this shop's account, named in the query)
 - backend/app/main.py (platform admin seed without ON CONFLICT (email); a shop user with the address is left alone)
 - backend/app/api/v1/checkout.py (intent records its coupon; confirm uses it; charged_coupon(); _check_charge() writes any gap on the order)
 - frontend/src/app/(customer)/checkout/review/page.tsx (card form waits for the coupon and guest cart; new intent when what it charges changes)
 - backend/tests/test_accounts_per_shop.py, frontend/src/__tests__/checkout-card-discount.test.tsx (new)
tests:
 - backend test_accounts_per_shop 29/29 (new)
 - backend builder integration 158/159, security 35/35, schema 79/79 (the 1 failure is the same as before)
 - frontend checkout-card-discount 2/2 (new; fails on the old review page with "expected undefined to be 'SAVE90'"); full suite 357/359 (the 2 api-client failures are the same as before); tsc no new errors
 - pytest suites with conftest seeding not run: the local database lacks defaults their seed needs (unrelated)
---

## Prompt

With two pictures: the Innterflow admin's Users list (five users, none of them maniyaikrash@gmail.com), and a checkout address form with no address suggestions.

abhi ek bhut bara blunder horha ha yar meri jan wo ye horha ha ke mere bhai gang sheet builder khola ha mene saiha jesi hi fill kri na mene sheet to bhai save and add to cart kia to pop up aya saiha create account kia maniyaikrash@gmail.com dali pass dalda create accunt kia to kehta ha user already exist with this mail  halake yaha koi esi cheez nh ha meri jan plz isey dekho yar ye bhut important ha meri jan aur iske ilawa jo major ek blunder hua  yaha auto completion address ka koi systrem nh ya american based platform ha poora saiha aur ek sbse bari cheez ek order place kia 7.35 ka original order ekdiscount bnaya mene to 90 percent off mila to 0.77 bill bna tax lag ke 1.6 ki payment katni chayie thi customer admin panel pe to sb sai rha yahi dikhara but jb account statement pr jaha payment ki to original payment katgyi asal amount katli yar discount wali katni thi na ye proper dekho yar proper plz bhai

Answers given to two questions: same email at another shop → a separate account at each shop; address autocomplete → not now.

## Response snapshot

1. "Already exists": users.email was unique across the whole platform, and the sign-up check (on a session where row-level security also shows accounts with no shop) saw accounts of other shops; sign-in at this shop could then not find the account either. Now one account per address per shop: migration 0058, every check names the shop, password reset writes one account's token, the root sign-in page picks the account whose password it is, the platform admin seed no longer matches by address alone.
2. Address autocomplete: deferred by the user's choice (needs a provider and key).
3. The discount: the card form raised its PaymentIntent on the review page's first render, before the page read the coupon from the browser — every card order with a coupon was charged full price while the order recorded the discount. Fixed in the page (waits for the coupon, new intent when the amount changes) and on the server (the intent records its coupon and the order uses that one; any remaining gap between charge and order total is written on the order for the shop).

## Outcome

- ✅ Impact: buyers can open an account at each shop; card orders are charged what the order says.
- 🧪 Tests: see above.
- 📁 Files: see above.
- 🔁 Next prompts: go-ahead to push to main (includes a migration); refund the overcharged order's difference in Stripe; address autocomplete provider later.
- 🧠 Reflection: the money bug was deterministic — child effects run before the parent's, so the intent always preceded the coupon.

## Evaluation notes (flywheel)

- Failure modes observed: a uniqueness rule from a one-shop past; a payment raised before the state it depends on was read.
- Graders run and results (PASS/FAIL): PASS.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
