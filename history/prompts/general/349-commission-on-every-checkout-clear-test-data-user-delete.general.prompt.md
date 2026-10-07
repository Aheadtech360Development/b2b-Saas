---
id: 349
title: Commission on every checkout, clear test data, user delete
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: how to delete the shop's test orders; the Delete button on Users does nothing; explain how the Gang Sheet Builder commission reaches the platform and make sure it really is taken, not just shown
labels: ["commission", "stripe-connect", "checkout", "platform-console", "test-data", "users"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/checkout.py (a signed-in customer's payment now carries the platform's share)
 - backend/app/api/v1/orders.py (so does an invoice paid afterwards, in the proportion being paid)
 - backend/app/services/commission.py (what the share is taken on after a discount code; a part payment's part of it)
 - backend/tests/test_commission.py (new)
 - backend/app/api/v1/admin/users.py (delete says why it can't, removes what is only the person's, guards the signed-in account)
 - frontend/src/app/(admin)/admin/users/page.tsx (the dialog shows the reason)
 - backend/app/api/v1/platform/tenants.py, frontend/src/app/(platform)/platform/page.tsx, frontend/src/services/platform.service.ts (Clear test data — found unfinished in the working tree; one table taken off its list, wording made exact, shipped)
tests:
 - backend, no database — tests/test_commission.py 4 passed (the sums, and that all three places a card is charged hand the share to the charge); five files compile
 - local test database only, one rolled-back transaction — the clear tool's deletes run on the real schema for a brand with 7 orders, leave none of its orders or order lines, and leave other brands' 203 orders and the shop's ready-made designs alone
 - frontend — tsc clean
 - NOT done — a real card payment; no charge was made on Stripe to watch the fee arrive
---

## Prompt

With three pictures — the shop's order list (five orders, 1001 to 1005), the Users page with its "Delete User" box open on a customer, and the console's "Gang Sheet Builder commission" box (2.8%, this plan's rate):

acha ab suno jani ye na test orders thy saiha ye mjhy delete krne hainsaiha to batao quickly kese delete krun mei inko jani aur dusra  ye delete button bhi kam nh krrha jani saiha aur ek aur cheez end mei ye cheez proper batadena mjhy ke bhai yad hana ye gang sheets pe commision rkha tha hamne saiha bhai ye kis tarah milrha hoga hamein poora ye dekhlena ek bar proper saiha bhai matlab ye hamara commision hana brand se to ye hamein kis tarah milrha hoga zara ye dekhlen aur ye make sure krma ye commisoon gang sheet ka proper live aur work krrha ho asa nh sirf static commisi0on ho payment mei kuch fark hi na par rha ho saiha plz

## Response snapshot

**The commission was only half real.** A shop's customers pay the shop directly, on the shop's own Stripe account; the platform's share rides on that same charge as an application fee, which Stripe moves to the platform's balance the moment the card is charged. That was wired into one of three places a card is charged: the guest checkout. A signed-in customer's checkout and an invoice paid afterwards sent no fee at all, so for them the rate in the console changed nothing. All three now carry it:

- taken on the Gang Sheet Builder lines only (blanks and other products are covered by the plan);
- at the brand's own rate if the console sets one, otherwise its plan's;
- after a discount code has taken its share off those lines;
- on an invoice, in the proportion of the order that payment settles, so the fee is paid once.

It arrives in the platform's Stripe account under Connect, collected fees. Card processing fees stay with the shop.

**Test orders.** There is no delete on an order, on purpose: orders are the shop's books. The tool for a trial run is "Clear test data" in the platform console (the brand's Manage box): type the brand's address and it removes every order, built gang sheet, return, refund record, cart and customer total, and the numbering starts again at 1001. It was sitting unfinished in the working tree. One thing in it was wrong — it would also have deleted the shop's own ready-made designs — and that is taken out.

**The Delete button.** The server refused (a person with orders, returns or messages cannot simply be removed) with a bare error, and the page swallowed it, so nothing appeared to happen. Now: somebody with orders or returns is refused with the reason and what to do (deactivate, or clear the test data first); what is only theirs goes with them; you cannot delete the account you are signed in with; and the box shows whatever the server says.

## Outcome

- ✅ Impact: the platform is paid on every card payment for a gang sheet, not only a guest's; a trial run can be cleared; a refused delete explains itself.
- 🧪 Tests: as listed.
- 📁 Files: as listed. No migration.
- 🔁 Next prompts: whether the platform's share goes back to the shop when an order is refunded (today it is kept); a gang sheet paid for off-card pays no share; a "commission collected" figure in the console.
- 🧠 Reflection: the commission's own module says "nothing in the product ever read it, so every gang sheet order went through at zero" — and then it was wired into one checkout of three. The test added here names all three, so a fourth way to pay cannot be added without it.

## Evaluation notes (flywheel)

- Failure modes observed: the unfinished clear tool listed the shop's design library as "saved designs"; reading what each table is, not its name, caught it.
- Graders run and results (PASS/FAIL): PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): record the fee on the order when the payment is confirmed, so the console can show it without asking Stripe.
