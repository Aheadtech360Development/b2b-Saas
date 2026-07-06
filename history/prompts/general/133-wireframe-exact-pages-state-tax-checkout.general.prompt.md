---
id: 133
title: Wireframe-Exact Pages + State Tax Checkout
stage: general
date: 2026-05-03
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "Rewrite all 5 customer pages with exact wireframe content + taxes admin state dropdown + checkout state-based tax"
labels: ["frontend","pages","checkout","taxes","wireframe"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/about/page.tsx
  - frontend/src/app/(customer)/contact/page.tsx
  - frontend/src/app/(customer)/private-label/page.tsx
  - frontend/src/app/(customer)/print-guide/page.tsx
  - frontend/src/app/(customer)/privacy-policy/page.tsx
  - frontend/src/app/(admin)/admin/settings/taxes/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
tests:
  - manual: /about page matches wireframe — exact headings, story text, stats, certs, team, timeline, CTA
  - manual: /contact page matches wireframe — exact form fields, dept options, info cards, hours, FAQ
  - manual: /private-label page matches wireframe — exact announce bar, hero, process, options, specs, CTA
  - manual: /print-guide page matches wireframe — 6 method cards with exact specs, compatibility matrix
  - manual: /privacy-policy page matches wireframe — sidebar nav, Shipping & Returns, Ordering, Terms, Privacy
  - manual: Taxes admin page — Region dropdown shows "TX - Texas" format for all 50 states
  - manual: Checkout review — shipping state TX with 6.25% rate shows "Tax (TX 6.25%): $X.XX"
  - manual: Checkout review — shipping state with no rate shows "Tax: Calculated at checkout"
---

## Prompt

The pages created do not match the wireframe. Read the wireframe file again carefully at C:\Users\RT\Desktop\AF Apparel\AF-Apparels-Wireframe-COMPLETE.html. For each page (About Us, Contact Us, Private Label, Print Guide, Privacy Policy), copy the EXACT content from the wireframe: Same headings word for word, Same body text word for word, Same sections in same order, Same layout structure. Do not write any new content. Do not paraphrase. Copy exactly as written in the wireframe file. Also for the Taxes admin page, add a Region field that works exactly like Shopify: Region dropdown with all 50 US states (state code + state name e.g. 'TX - Texas'), Each tax rate is linked to a specific state, In checkout, when customer selects their shipping state, automatically find the matching tax rate and apply it, Show tax line in order summary: 'Tax (TX 6.25%): $X.XX', If no tax rate exists for that state, show 'Tax: Calculated at checkout' or $0

## Response snapshot

**About page** — Full rewrite with exact wireframe content:
- Announce: "🇺🇸 Factory-Direct Wholesale Blanks — Serving 2,000+ American Businesses | Same-Day Shipping from Dallas, TX"
- Hero tag "🇺🇸 Dallas, TX — Est. 2010", H1 "America's Factory-Direct Blank Apparel Supplier", exact body text
- Stats: 14+ Years, 2,000+, 50+, 4 Industry Certifications
- Our Story: exact 3 paragraphs + 4 cert badges (ISO 9000, Oeko-Tex, GOTS, WRAP) + Facility callout
- What We Stand For: 4 value cards with exact titles and body text from wireframe
- Team: Michael Chen/Founder & CEO, Sarah Williams/Head of Wholesale Accounts, James Torres/Operations & Fulfillment
- Timeline: 2010–2024 exact entries
- CTA: "READY TO PARTNER WITH AF?" exact

**Contact page** — Full rewrite with exact wireframe content:
- Announce: "🇺🇸 Factory-Direct Wholesale Blanks — (214) 272-7213 | info.afapparel@gmail.com"
- Hero tag "📞 We respond within 4 business hours", H1 "Get in Touch With Our Team"
- Form: Full Name, Business Name, Email, Phone, Department dropdown (exact 6 options), How Can We Help? textarea
- Submit: "Send Message →", note below form
- Info cards: Phone (214) 272-7213, Email info.afapparel@gmail.com, Facility Dallas TX, Hours table Mon-Fri/Sat/Sun/Federal Holidays
- Departments: Wholesale Sales/sales@, Account Support/support@, Private Label/privatelabel@
- FAQ: 4 questions from wireframe with exact answers
- CTA: "NOT SURE WHERE TO START?"

**Private Label page** — Full rewrite with exact wireframe content:
- Announce: "🏷️ Private Label Program — Custom Styles, Your Brand, Factory-Direct | Min. 2,500 Units/Style/Color"
- Hero: "🏷️ Private Label Program" tag, H1 "Build Your Brand on Factory-Direct Blanks", 3 badges
- Who It's For: Apparel Brands, Retailers, Print Shops (exact descriptions)
- How It Works: 5 steps (Submit Inquiry, Design & Sampling, Production, QA & Inspection, Ship to You)
- Customization Options: Labels & Tags (5 items), Custom Styles & Cuts (5 items), Exclusive Colorways (5 items)
- Program Specifications: 10 spec rows exact from wireframe
- CTA: "READY TO BUILD YOUR BRAND?" with privatelabel@afapparel.com

**Print Guide page** — Full rewrite with 6 method cards from wireframe:
- Announce: "🖨️ Print Guide — Tested Press Settings & Compatibility for AF Blanks"
- Hero: "🔬 Tested in our Dallas facility + validated by 200+ print shops" tag, H1 "Printing Recommendations", 5 tabs
- Section: "Decoration Method Guide"
- DTF: 6 spec rows + 5 pro tips (exact)
- Screen Printing: 6 spec rows + 4 pro tips (exact)
- Sublimation: warning box + 6 spec rows + 4 "When Sublimation Works" tips
- Embroidery: 6 spec rows + 5 pro tips (exact)
- HTV/Vinyl: 6 spec rows + 5 pro tips (exact)
- After-Print Care Guide: intro text + 6 spec rows + 4 "Suggested Customer Tag Copy" tips
- Fabric Compatibility Matrix: 7 AF blank rows × 5 decoration methods with star ratings
- CTA: "QUESTIONS ABOUT YOUR SETUP?"

**Privacy Policy page** — Full rewrite with exact wireframe content:
- Announce: "🇺🇸 AF Apparels — Clear Policies, No Surprises"
- Sidebar: 4 policies + Quick Links (Contact Support, Track My Order, Apply for NET 30)
- Active section switching: Shipping & Returns, Ordering Info, Terms & Conditions, Privacy Policy
- All 4 sections contain exact text from wireframe (tables, bullet points, highlight boxes)

**Taxes admin page** — Updated US_STATES from bare codes to `{ code, name }` objects:
- Dropdown now shows "TX - Texas", "CA - California" etc. format
- Stored region value remains the 2-letter code (e.g. "TX")

**Checkout review page** — State-based tax calculation:
- Added `taxRate` state
- useEffect: when shippingAddress.state changes, fetches /api/v1/admin/taxes, finds enabled rate matching state
- `taxAmount = subtotal * rate / 100` (rounded to 2 dp)
- Tax line in order summary: "Tax (TX 6.25%): $X.XX" when match found, "Tax: Calculated at checkout" when no match
- Total includes taxAmount

## Outcome

- ✅ Impact: All 5 customer pages rewritten with exact wireframe headings, body text, and section structure
- ✅ Taxes admin: Region dropdown is now "TX - Texas" format for all 50 states + DC
- ✅ Checkout: State-based tax auto-applied; "Tax (TX 6.25%): $X.XX" or "Calculated at checkout"
- 🧪 Tests: Manual
- 📁 Files: 7 files modified

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
