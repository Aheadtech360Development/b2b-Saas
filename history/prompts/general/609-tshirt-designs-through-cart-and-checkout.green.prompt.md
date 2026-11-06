---
id: 609
title: T-shirt designs through cart and checkout
stage: green
date: 2026-11-06
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks for the t-shirt designer's cart and checkout (phase two) to be finished properly before pushing
labels: ["t-shirt-designer", "product-customizer", "cart", "checkout", "orders", "production"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/tshirt_designer.py
 - backend/app/services/cart_service.py
 - backend/app/services/order_service.py
 - backend/app/services/production_board.py
 - backend/app/services/order_progress.py
 - backend/app/services/admin_home.py
 - backend/app/services/suppliers/orders.py
 - backend/app/api/v1/cart.py
 - backend/app/api/v1/checkout.py
 - backend/app/api/v1/guest.py
 - backend/app/api/v1/tshirt_designs.py
 - backend/app/api/v1/admin/tshirt_designer.py
 - backend/app/api/v1/admin/orders.py
 - backend/app/schemas/cart.py
 - backend/app/schemas/order.py
 - backend/tests/test_tshirt_designer_checkout.py
 - frontend/src/components/designer/Designer.tsx
 - frontend/src/components/designer/finish.ts
 - frontend/src/components/designer/send.ts
 - frontend/src/components/designer/Chrome.tsx
 - frontend/src/app/(customer)/design/page.tsx
 - frontend/src/components/storefront/CartView.tsx
 - frontend/src/components/shared/ConfigurationDetail.tsx
 - frontend/src/app/(customer)/checkout/review/page.tsx
 - frontend/src/lib/guestCart.ts
 - frontend/src/lib/tracking.ts
 - frontend/src/services/cart.service.ts
 - frontend/src/services/tshirtDesigns.service.ts
 - frontend/src/services/production.service.ts
 - frontend/src/types/order.types.ts
 - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
 - frontend/src/app/(admin)/admin/production/page.tsx
 - frontend/src/app/(admin)/admin/tshirt-designer/page.tsx
 - frontend/src/__tests__/tshirt-designer-cart.test.tsx
 - frontend/src/__tests__/tshirt-designer.test.tsx
 - frontend/src/__tests__/tracking-funnel.test.ts
tests:
 - backend tests/test_tshirt_designer_checkout.py (15); with the designer, gang sheet, production, order progress, sourcing, commission, plans and other related tests 155 passed
 - frontend tshirt-designer-cart.test.tsx (10) and the updated designer page tests; the whole suite 96 files, 896 tests passed; tsc clean in src
 - local database walk (printcopilot_local, demo shop), 37/37: a guest's design for the cart needs no email; priced by the server ($307: tee, two printed sides, a name and a number); into an account's cart and the account's from then on; one line however often it is added; another account refused; its quantity locked; more than the shop has refused at add and, after an edit, shown on the line and refused before the card; the order (bank transfer) has a line per blank variant and one for names, the design's total, the stock taken off (147 to 141, 156 to 150), the design in review with the buyer's name and email; Production, the order page, Designs and the set-up list see it; an unordered design can't be moved; approve and send back; paid sizes stay, new artwork goes back to review at the price paid; reorder adds no blanks; S&S forwarding leaves the blanks out; the guest checkout prices a guest's design and refuses an account's; all put back
 - browser look on the local site: signed-in buyer designs, Add to cart, the cart line (desktop and phone), the shop's order page, Production, the design page opened from its link, the buyer's order page, and a sent-back paid design opened from the email link offering Send the changes; all put back
 - next build
---

## Prompt

nh pehle cart aur checkout wala niptado proper uske bad krdo push ap mei uske bad dekhlunga saiha

(follow-ups while it was being built) continue / continue meri jan

## Response snapshot

Built phase two the way gang sheets are bought. The designer's last step is Add to cart: the design and its print files go to the shop (no email asked; the order says who the buyer is) and the design becomes one cart line priced on the server, in the account's cart when signed in, in the browser's cart for a guest (moved into the account when they sign up to check out). The cart shows pieces for the total, each shirt in words, Edit design, no quantity box, and says why a design can't be ordered (product left the designer, a size not sold, blanks out of stock); checkout refuses it before the card. At checkout the design is priced again and becomes one order line per blank variant (its stock comes off the shelf) plus one for names and numbers; it then belongs to the order, enters review, shows on Production beside gang sheets, on the order page with its status and picture, under Designs with its order, and on Home's awaiting artwork. The shop moves it on with the buyer emailed in the shop's name; a design sent back opens from the email in the designer with Send the changes, and a paid design may change its artwork only. S&S forwarding never sends a design's blanks to ship; reorder never adds them as blanks; the guest checkout handles designs too. No commission on designs (the platform's percentage stays on gang sheets only).

## Outcome

- ✅ Impact: customers buy their own designs through the cart and checkout; the shop gets the order with the print files and runs it through Production.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push (owner said yes once this is done); open questions for the owner: a platform commission on designs, and ordering a design's S&S blanks to the shop.
- 🧠 Reflection: a design's order lines sit on real variants for stock, so everything that reads variant lines had to be checked: S&S forwarding would have drop-shipped blank shirts to the customer, and reorder would have added blanks to the cart.
