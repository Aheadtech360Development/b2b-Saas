---
id: 621
title: Designer change product and straight tee
stage: general
date: 2026-11-10
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner shows the t-shirt designer; Change product does nothing, and the shirt pictures stand tilted
labels: ["tshirt-designer", "storefront", "mockups"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/designer/panels/ProductPanel.tsx
 - frontend/src/lib/designer/photo.ts
 - frontend/src/lib/designer/mockups.ts
 - frontend/public/designer/tee-front-straight.webp (was tee-front.webp)
 - frontend/public/designer/tee-back-straight.webp (was tee-back.webp)
 - frontend/src/__tests__/designer-change-product.test.tsx
tests:
 - frontend/src/__tests__/designer-change-product.test.tsx (4 passed)
 - designer-pricing, designer-print-dpi, designer-shirts, tshirt-designer, tshirt-designer-cart (passed; 47 in all)
 - the new photos recoloured blue, white and black, and the chest/back art spots drawn on them, looked at
 - tsc clean; next build passed
---

## Prompt

bhae ye t shirt customizer mei yaha se product change nh hori ha isko proper dekho yar meri jan jaldi se bhae blkl jadli se aur dekho ye shirt ke preset bhi jo hain halke se tilt tery arhy hain blkl straight any chayien bhai is taah achy nh lagry ain blkl bhi jaldi dekho bhai isey yar jaldi meri jan

(screenshot: the designer's Garment tab, product "T Shirt", an arrow at Change product)

## Response snapshot

Change product: the shop (Ikrash) has one product in the designer (live catalog, read-only GET: 1 garment), so Change product opened an empty list. Now a customer is only shown Change product when there is another product to change to; the shop's own people (signed in as admin) see it with "T Shirt is the only product in the designer. To offer more, add them in Products → T-shirt designer → Add products". With two or more products, changing works (tested: the shirt, its designs and the colours it shares move to the new product). Tilted shirt: the tee's front and back studio shots were taken turned to one side (the long sleeve, tank and muscle tee are straight). Made straight versions from them: the camera-facing half widened back to its un-turned width, mirrored about the centre front, the middle levelled so it hangs flat, centred; front and back now the same width. The tee's print areas follow (centred, 31.6 in wide; chest and back spots on the centre line); scale and top unchanged, so print sizes hold. Files renamed so browsers fetch the new ones.

## Outcome

- ✅ Impact: no dead Change product; the tee stands straight on the stage, in thumbnails and in previews.
- 🧪 Tests: 4 new, designer suites, visual checks, tsc, next build.
- 📁 Files: product panel, photo list, print areas, two photos, one test file.
- 🔁 Next prompts: the owner's yes to push; to offer other products, add them in Products → T-shirt designer; a real straight studio shot of the tee can replace the made one later.
- 🧠 Reflection: an empty list behind a button reads as a broken button; the shop had one product, which only the live catalog showed.
