---
id: 670
title: New printcopilot site
stage: general
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner hands over a new design folder for printcopilot.co (printcopilot-site) to replace the live marketing site, with 301s for dropped pages and Partners sent to Affiliate
labels: ["marketing-site", "redirects", "seo", "forms"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - printcopilot-site/ (the owner's design, committed as the source)
 - frontend/scripts/import-marketing-site.py
 - frontend/src/components/marketing/site/registry.ts
 - frontend/src/components/marketing/site/SitePage.tsx
 - frontend/src/components/marketing/site/SiteWire.tsx
 - frontend/src/components/marketing/site/SiteShell.tsx
 - frontend/src/components/marketing/site/pages/*.ts (generated, 17 pages)
 - frontend/public/site/*.jpg
 - frontend/src/middleware.ts
 - frontend/src/app/page.tsx and (customer) about, affiliate, blog, blog/[slug], [slug], contact, demo, features, pricing, privacy-policy, terms, cookie-policy; (auth)/layout.tsx
 - frontend/src/components/platform/LeadsTab.tsx
 - backend/app/api/v1/leads.py, backend/app/api/v1/platform/leads.py, backend/tests/test_leads.py
 - frontend/src/__tests__/marketing-site.test.tsx
tests:
 - vitest marketing-site (29 new), marketing-forms, plan-prices: 47 passed
 - tsc --noEmit: clean
 - backend test_leads: 8 passed
 - local screenshots (next dev, no API): home, pricing, contact, affiliate, help, sign-in, sign-up, privacy at 1440 and 390 wide; the app matches the design files, no sideways scroll; the sign-in/legal header given its navy band after the first pass showed it white on white
---

## Prompt

acha aB EK ZARA LOCKIN KRNA PAREGA TUMHEIN YE NEW SITE AGYI HA EK SAIHA POORI ISPE SHIFT KRNI HA ABHI JO HAMARI CURRENT PRINTCOPILOT KI LIVE SITE HANA POORA READ KRLO AUR SAME CHAPDO SAIHA SAME JO PAGES PURANE MEI THY NEW MEI NH HAIN NA SME 301 KA REDIRECT LAGAKE HOME WAGERA KAHI BHI BHJDENA AUR AFFILATES AUR PARTNERS ALAG ALAG THY ABHI AFFILIATE TO MAIN HA A PARTNERS PR BHI CLICK HO TO AFFILIATES PR JAE SAIHA YE DEKHLENA PROPER YAD SE JALDI SE KRO ISKO PROPER

(screenshot: the printcopilot-site folder)

## Response snapshot

Moved printcopilot.co to the new design: 17 pages (home, features, pricing, demo, contact, about, affiliate, blog and three posts, brands, dtf, examples, help, print shops, wholesale), drawn exactly as designed and wired like the live site. A script turns the design into the site's pages: every placeholder link pointed at its real page by its words (trial buttons on a plan's card sign up for that plan), prices and the affiliate program's numbers filled from the settings, the four forms sent to the same backend calls (demo and contact to Leads and the inbox, the affiliate application with the program's terms shown, the blog's subscribe box as a newsletter lead), help search, the manager's address and hours added on Contact, the export's duplicate stylesheet dropped. Legal pages and sign-in/sign-up wear the new header and footer. On shops nothing changes: each address still serves the shop's own page. 301s on printcopilot.co only: /partners, /affiliates, /partner to /affiliate (the partner portal stays), /retail to /brands, /retail-pricing to /pricing, and the design's .html names to clean paths. Flagged: the Scale card promises "your own branded buyer app"; the design has no pages for Acceptable Use, Data Processing and Affiliate Terms, so those links go to Terms, Privacy and Affiliate.

## Outcome

- ✅ Impact: printcopilot.co runs on the new design with live prices, working forms and the old addresses moved.
- 🧪 Tests: 47 vitest, tsc clean, 8 backend, screenshots at desktop and phone.
- 📁 Files: see list above.
- 🔁 Next prompts: owner's yes to push (this push also carries the unpushed mobile account-deletion commit 41abcc3).
- 🧠 Reflection: a design page's header can depend on the section around it; check frames on pages the design never drew.
