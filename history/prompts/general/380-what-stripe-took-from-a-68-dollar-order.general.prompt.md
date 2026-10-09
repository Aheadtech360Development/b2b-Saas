---
id: 380
title: What Stripe took from a 68 dollar order
stage: general
date: 2026-10-09
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: a client says Stripe takes too much; explain what was taken from this 68 dollar order and what can lower it
labels: ["payments", "stripe", "connect", "commission", "fees"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none changed
tests:
 - the two fee lines recomputed from the screenshot — 2.9% of 68.00 plus 0.30 is 2.27; 2.8% of 68.00 is 1.90; 68.00 less both is 63.83, the net shown
 - read in the code — services/commission.py and core/billing_plans.py (2.8% Starter, 1.9% Wholesale, 1.3% Scale, a per-brand rate from 0 to 10% set in the platform console), api/v1/guest.py (the fee is worked out on the gang sheet lines only), services/payment_service.py (card is the only payment method asked for), the convenience fee (carried through the totals, set to 0.00 in all three places)
 - read on Stripe's own pages that day — stripe.com/pricing (2.9% + 30¢ domestic card, +1.5% international, +1% currency conversion, ACH Direct Debit 0.8% with a 5 dollar cap, 3D Secure included), the direct charges guide (Stripe's fee comes from the connected account, the application fee goes to the platform, no Stripe fee on the application fee, it is not returned on a refund unless asked), the support page on refunds (Stripe keeps its fee)
 - NOT done — the order itself was not looked up (it is live data); card surcharge law by state was not verified
---

## Prompt

(a screenshot of one payment on the connected account "innterflow" in the Stripe dashboard: payment amount $68.00, Fees −$4.17 made of "Stripe processing fees −$2.27" and "AheadTech360 fee −$1.90", net amount $63.83; paid by a guest with a Visa card through Link)

ab ek sb se main issue pe bat krni ha mjhy wo ye bhae abhi ek cliient ki shikayat ai thi bhai ke ye to stripe bhut paise katra ha  ye dekho 68 ka order tha kat kat ke kaha legya is cheez ko wo to kuch kia ham krskty hain ke bhai ye cheez kam hojae dekho per transcation fee aur jo hamare charges hain wo to alag hain lekin ye jo extra katra ye smjh nh arha ha plz isey zara thorugohly dekho yar

## Response snapshot

- Nothing extra was taken. The "Fees" row is the total of the two rows under it: Stripe's card fee, $2.27 (2.9% + 30¢), and the platform's own gang sheet commission, $1.90 (2.8%, the Starter plan's rate), which Stripe shows as "AheadTech360 fee".
- The platform's share can be lowered today with no code: a rate for that one brand in the platform console, or a plan with a lower rate.
- Stripe's share is its public price and code cannot change it. What can: payment by bank (0.8%, capped at $5; needs real work, the checkout is card-only), a card fee paid by the customer (the plumbing exists, the amount is set to zero; the law on it varies by state), or prices that carry the fee.
- On a refund the shop loses both fees today. Stripe never returns its own; the platform's could be returned.

## Outcome

- ✅ Impact: the owner can tell the client exactly what each cent was, and has the choices with their costs.
- 🧪 Tests: none run; arithmetic and sources as listed.
- 📁 Files: none.
- 🔁 Next prompts: which of the choices to build, if any.
- 🧠 Reflection: in a shop's Stripe dashboard the platform's commission sits under "Fees" beside Stripe's, so a shop reads all of it as Stripe's. The product nowhere tells the shop what the platform took on an order.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): the arithmetic matches the screenshot to the cent.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): show the shop its own commission per order in the admin, so it is not first met in Stripe.
