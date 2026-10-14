---
id: 421
title: Product gallery in one row, colour shows its pictures
stage: general
date: 2026-10-15
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: One row of at most five thumbnails with a slider under the main picture; a colour swatch changes the picture
labels: ["website-builder", "product-page", "gallery", "colour-swatches"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/colourPictures.ts
 - frontend/src/components/builder/islands/Interactive.tsx
 - frontend/src/components/builder/render.tsx
 - frontend/src/components/storefront/ThemeProductBuy.tsx
 - frontend/src/lib/builder/baseCss.ts
 - frontend/src/__tests__/builder-gallery-colour.test.tsx
tests:
 - builder-gallery-colour.test.tsx 6/6; builder tests 259/259; tsc 0 errors
 - local browser, a product with 10 pictures named by colour: 18/18 on desktop and phone (one row, 5 in view on desktop and 4 on a phone, arrows, no sideways page scroll, Forest and Navy show their own pictures); screenshots looked at; the check pictures and builder site removed after
---

## Prompt

boss ye ek cheez krni ha fast and quick dekho ek main image banner ha uske nechay multiple rows arhi mera client kehra ke main image ke nechay ek hi rpow ho bs max 5 aein usme usse ziada jo bhi hon waha slider dedena saiha ye ek cheez smjhgye matlab asa na ho rows increase horin ho hamein 5 se ziada pe slider dedena ha saiha aur uske bad  ye jo color swatches hain na yar ye click krne pr bhi image change nh hori ha ye bhi zara dekho gor se jani ye msla hal kro jaldi se

(with a screenshot of a builder product page, "1133 Crop Top", showing two rows of thumbnails)

## Response snapshot

**One row.** The thumbnails under the main picture are one row:
- At most 5 in view (4 on a phone). The rest slide.
- There is an arrow at each end while more is that way, and a phone can swipe.
- The row never grows into more rows.

**A colour shows its pictures.**
- Picking a colour in the buy box shows that colour's pictures, the first one large.
- A picture says its colour in its alt text, as the S&S import writes it ("Name - Colour - Back") and as the older product page reads it.
- A part that is the colour wins, so Black is not Black Heather.
- A colour with none of its own leaves the pictures as they are.

## Outcome

- ✅ Impact: the client's product pages show one sliding row, and the swatches change the picture.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: the owner's go to push.
- 🧠 Reflection: pictures with no colour in their alt text cannot follow a swatch; the brand names the colour in the picture's alt text.

## Evaluation notes (flywheel)

- Failure modes observed: jsdom has no Element.scrollTo; the code sets scrollLeft instead.
- Graders run and results (PASS/FAIL): all PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
