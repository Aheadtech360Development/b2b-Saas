---
id: 691
title: Designer service prices and toggles
stage: general
date: 2026-11-17
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Manager's Custom Designer requirements, pasted by the owner — a price per service, how Text/Graphics designs reach the admin, switch each service on or off
labels: ["tshirt-designer", "pricing", "admin", "names-and-numbers"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/tshirt_designer.py
 - backend/app/api/v1/admin/tshirt_designer.py
 - backend/app/api/v1/tshirt_designs.py
 - backend/tests/test_tshirt_designer.py
 - backend/tests/test_tshirt_designer_checkout.py
 - backend/tests/test_tshirt_designs.py
 - frontend/src/lib/designer/pricing.ts
 - frontend/src/lib/designer/catalog.ts
 - frontend/src/stores/designer.store.ts
 - frontend/src/components/designer/context.ts
 - frontend/src/components/designer/Rails.tsx
 - frontend/src/components/designer/Stage.tsx
 - frontend/src/components/designer/Steps.tsx
 - frontend/src/components/designer/Chrome.tsx
 - frontend/src/components/designer/send.ts
 - frontend/src/components/designer/panels/UploadPanel.tsx
 - frontend/src/services/tshirtDesigns.service.ts
 - frontend/src/app/(admin)/admin/tshirt-designer/page.tsx
 - frontend/src/__tests__/designer-pricing.test.ts
 - frontend/src/__tests__/tshirt-designer.test.tsx
tests:
 - pytest test_tshirt_designer + test_tshirt_designs + test_tshirt_designer_checkout: 44 passed
 - vitest designer-pricing, tshirt-designer, tshirt-designer-cart, designer-shirts, designer-change-product, designer-print-dpi: 58 passed
 - tsc --noEmit clean
 - local screenshots (made-up API answers): Products → T-shirt designer → Prices and a design's page, desktop and phone, no sideways scroll
---

## Prompt

Custom Designer – Feature Updates & Requirements
1. Individual Pricing for Each Service
Currently, all four services under Custom Designer (Upload Your Own Artwork, Text, Graphics, and Names & Numbers) share the same printing price. We need the ability to set individual prices for each of these four services independently.
2. Admin-Side Design Submission
We need clarification on how designs created using the Text and Graphics options will be delivered to the admin. Will the admin receive the customized design as a downloadable file (such as PNG or PDF), or will the text and design details be displayed separately in the order details? Ideally, the admin should receive a ready-to-use design file along with the order.
3. Enable/Disable Individual Services
We need an option in the admin panel to enable or disable each of the four Custom Designer services independently. This will allow individual stores to decide which services they want to offer.
For example, a store might offer only Upload Your Own Artwork, while another might offer Upload Your Own Artwork, Text, and Graphics. Each service should have its own enable/disable toggle.

 ye t shirt designer ka kam ha bsically saiha bhai isme matlab bascially manager ye kehra ha ke bhai agar sirf ek t shirt pr design wagera ya kch ho ya sirf name ho yar atwork ho to uske paisae alag alag hongy na ofc to abhi esa nh arha ha isko zara proper kro aur dusra agar graphics select krta ha user to admin ke pass wo kese jaegi proper batao yar ye cheez mjhy bhai

(Owner's answer to the one question asked: a side with several kinds is charged at the dearest — "Mehngi wali (Recommended)".)

## Response snapshot

Prices: each quantity break now has a price per side for uploaded artwork, text and graphics (print and embroidery); a side carrying several is one print at the dearest; names and numbers keep their own per-shirt prices and a side with only them adds no side price. Old saved rows (one price) give all three that price, and every row still carries per_side for pages loaded before the release. Server quote and the designer's live price follow the same rules; the breakdown lists each side with what it is.
Services: Prices tab gets "What customers can add" with four switches saved at once (setting key tshirt_designer → services, at least one on). The designer hides switched-off tools (AI design only while text and graphics are both on), refuses pasted/dropped pictures when uploads are off, and a design using a switched-off service cannot be ordered (server and browser).
Delivery to the admin: unchanged in shape — per shirt and side a preview PNG and a print-ready transparent 300 DPI PNG with all text, graphics and uploads merged as placed, on the design's page (Products → T-shirt designer → Designs, linked from the order and Production). Fixed: a side with names and numbers now gets one print file per player (each with that player's name and number), and the design page lists the roster (name, number, size) with each player's print file; before, only the first player's name was in the file and the roster was not shown.

## Outcome

- ✅ Impact: per-service prices, per-shop service switches, a print file per player.
- 🧪 Tests: 44 pytest, 58 vitest, tsc, screenshots.
- 📁 Files: as listed.
- 🔁 Next prompts: owner's yes to push; the shop sets its prices in Products → T-shirt designer → Prices.
- 🧠 Reflection: the per-player print file has no column of its own: the roster row id rides in the file name (`-p-<id>.png`), read back by player_of.
