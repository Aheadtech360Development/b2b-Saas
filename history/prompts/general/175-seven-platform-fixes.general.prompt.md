---
id: "175"
title: Seven Platform Fixes — Orders Tag, Variant Pricing, Style Sheets, Product Price, About Box, Price List, Contact Form
stage: general
date: 2026-05-12
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix 7 small issues across AF Apparels frontend and backend."
labels: ["orders","variant-pricing","style-sheets","product-page","about","price-list","contact-form","bug-fix","ui"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/orders/page.tsx
  - frontend/src/app/(admin)/admin/customers/tiers/page.tsx
  - frontend/src/app/(customer)/style-sheets/StyleSheetsContent.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
  - frontend/src/app/(customer)/about/page.tsx
  - frontend/src/app/(customer)/account/price-list/page.tsx
  - frontend/src/app/(customer)/contact/ContactContent.tsx
  - backend/app/api/v1/contact.py
tests:
  - manual: admin orders list — retail/guest orders show "Retail" blue badge instead of "Guest" orange badge
  - manual: individual variant pricing — variant cells show product-level group price as placeholder (not MSRP-minus-discount)
  - manual: style sheets page — no black style number badge on images; cards are wider (280px min); images taller (320px)
  - manual: product page — retail_price shown with strikethrough above effective_price when retail > effective
  - manual: about page certifications section — dark gradient card with FileText icon replaces plain blue box
  - manual: price list — strikethrough and red price only on variants with actual discount; equal prices show plain
  - manual: contact form submits successfully; admin receives email at ADMIN_NOTIFICATION_EMAIL; submitter receives confirmation
---

## Prompt

Fix 7 small issues across AF Apparels frontend and backend. Read ALL relevant files first.

## Response snapshot

**FIX 1 — Admin orders "Guest" → "Retail" tag** (`admin/orders/page.tsx`):
- Changed badge from `bg-orange-100 text-orange-700` "Guest" to inline style `#E8F4FD / #1A6FA8` pill "Retail"

**FIX 2 — Individual Variant Pricing placeholder** (`admin/customers/tiers/page.tsx`):
- Variant-level input placeholder previously computed `v.retail_price - disc` (MSRP minus product-level discount amount), showing ~$19 for a $4 group price
- Changed to show `gOv.price` directly — whatever is entered at the product-group level is used as the variant placeholder price

**FIX 3 — Style Sheets bigger cards, no badge** (`style-sheets/StyleSheetsContent.tsx`):
- Removed black "STYLE / {number}" overlay badge from card images
- Grid `minmax` increased 220px → 280px (both loading skeleton and actual grid)
- Image container height increased 200px → 320px

**FIX 4 — Product page MSRP strikethrough** (`ProductDetailClient.tsx`):
- In the active pricing block (shown to all users), when `retail_price > effective_price`, show `retail_price` in gray strikethrough above the wholesale price
- Uses `display:flex; flex-direction:column` layout to stack strikethrough above the main price

**FIX 5 — About page certifications box** (`about/page.tsx`):
- Replaced `ClipboardList` import with `FileText`
- Replaced plain blue left-border box with gradient dark card (`#1b3a5c → #1a3a5c`) with frosted icon container, white text, and red mailto/tel links

**FIX 6 — Price list conditional strikethrough** (`account/price-list/page.tsx`):
- Was: always rendering `retail_price` with `line-through` and `unit_price` bold
- Now: only show strikethrough + red `unit_price` when `unit_price < retail_price`; otherwise both show plain (no strikethrough, no red highlight)

**FIX 7 — Contact form email sending** (`ContactContent.tsx` + `contact.py`):
- Root cause: frontend sent `{ business: ... }` but backend ContactRequest schema expects `{ company: ... }` → company field always empty in email
- Frontend fix: explicitly map `company: form.business` in the POST body
- Backend fix: changed hardcoded `"info@afblanks.com"` to `settings.ADMIN_NOTIFICATION_EMAIL` with fallback to `EMAIL_FROM_ADDRESS`
- Added confirmation email back to submitter

## Outcome

- ✅ Impact: 7 UI/UX and functional fixes applied across orders admin, variant pricing admin, style sheets, product page, about page, price list, and contact form
- 🧪 Tests: Manual verification needed
- 📁 Files: 8 files modified (7 frontend, 1 backend)
- 🔁 Next prompts: none
- 🧠 Reflection: FIX 7 was a silent data mismatch — Pydantic silently ignored `business` field and `company` defaulted to empty string, so no error was raised but the email always had blank business name. The hardcoded wrong `to` address meant emails went to `info@afblanks.com` instead of the admin inbox.

## Evaluation notes (flywheel)

- Failure modes observed: Pydantic silent field ignore for mismatched key names; hardcoded recipient email in contact.py pointed to wrong address; variant pricing placeholder used MSRP-subtraction instead of flat product-group price
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
