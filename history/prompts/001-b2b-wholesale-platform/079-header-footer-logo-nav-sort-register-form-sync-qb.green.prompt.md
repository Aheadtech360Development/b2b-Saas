---
id: "079"
title: Header Nav, Footer Logo, Sort By, Register Form, Sync QB
stage: green
date: 2026-04-15
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: resume
labels: ["header","footer","logo","navigation","registration","sort","ui","customer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/components/layout/Header.tsx
  - frontend/src/components/layout/Footer.tsx
  - frontend/src/app/(auth)/login/page.tsx
  - frontend/src/app/(auth)/wholesale/register/page.tsx
  - frontend/src/app/(customer)/products/ProductListClient.tsx
  - frontend/src/app/(customer)/account/statements/page.tsx
tests:
  - " - none"
---

## Prompt

1. In the header menu, all of these will be included: Shop All, T-Shirts, Joggers, Hoodies, New, Add Resources (dropdown: we will add the new pages that we create, for now do not add anything in this dropdown).
2. In the footer, add the logo and remove the text that is currently placed instead of the logo. The same image that is used in the header will be used here. Also, wherever such text is used across the entire website, replace it with that image.
3. On the collection page, also add "Add Sort By" on the top right, exactly in front of the filters.
4. On the wholesale registration page, fields need to be added. In Company Information, add all these fields... [full field list]. In Contact Information... In Business Information... In Web Account Information... In Communication Preferences... In Terms and Conditions...
5. In the customer dashboard, wherever buttons like this are present, remove them: "Sync QB ...". Only hide the button, do not touch anything else.

## Response snapshot

1. **Header.tsx**: Replaced nav items (Men's, Women's, Youth) with T-Shirts, Joggers, Hoodies, New. Added Resources dropdown (empty, "Coming soon" placeholder) with chevron icon and click-outside close logic. Updated mobile menu to match.

2. **Footer.tsx**: Replaced "A" + "F" + "APPARELS" styled text with `<img src="/Af-apparel logo.jpeg" ... height="55px">`.

3. **login/page.tsx**: Replaced same text logo with the image.

4. **register/page.tsx**: Replaced text logo with image. Complete form overhaul:
   - Company Information: company_name, website (opt), company_email, address1, address2 (opt), postal_code, country, city, state, resale_number, ppai_number (opt), asi_number (opt), phone, fax (opt)
   - Contact Information: first_name, last_name, title (opt), email
   - Business Information: primary_business (dropdown), secondary_business (dropdown), how_heard (dropdown), num_employees (dropdown), num_sales_reps (dropdown)
   - Web Account Information: password, confirm_password, password_hint (opt)
   - Communication Preferences: promo_emails checkbox
   - Terms and Conditions: description + scrollable terms + simulated reCAPTCHA checkbox + terms_accepted checkbox + submit
   - Client-side validation: password match, terms accepted, captcha checked
   - Backend payload unchanged (maps to existing RegisterWholesalePayload fields)
   - Sidebar: emojis replaced with SVG icons

5. **ProductListClient.tsx**: Added `sortBy` state (default: "featured"). Added Sort By select dropdown to top bar right side. Client-side sort applied to `displayedProducts`: featured (server order), price asc/desc, name A-Z/Z-A.

6. **statements/page.tsx**: "Sync QB Payments" button replaced with `{/* Sync QB hidden */}` comment. Function and API call preserved untouched.

## Outcome

- Impact: Header nav modernized with correct category links and Resources dropdown shell. Logo image replaces text branding across footer, login, and register pages. Registration form expanded to industry-standard wholesale application format. Sort By added to products collection page. Sync QB button hidden from customer statements view.
- Tests: None run; all visual and UX changes.
- Files: 6 files modified.
- Next prompts: Add actual resource pages and populate Resources dropdown. Test registration form submission end-to-end.
- Reflection: Registration form kept backward-compatible with backend by mapping new fields to existing payload fields (primary_business→business_type, resale_number→tax_id). All new fields are stored in local state only until backend is extended.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): Backend extension to accept full registration payload fields.
