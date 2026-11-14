---
id: 676
title: Policy pages from PDFs
stage: general
date: 2026-11-14
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner stops the page-by-page phone check (fix only the flagged sections) and asks for the five policy PDFs to go on the site
labels: ["marketing-site", "legal", "policies"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/scripts/import-policies.py
 - frontend/src/components/marketing/site/PolicyPage.tsx
 - frontend/src/components/marketing/site/policies/{privacy,terms,cookies,affiliate,dpa}.ts (generated)
 - frontend/src/app/(customer)/terms/page.tsx, cookie-policy/page.tsx, privacy-policy/page.tsx
 - frontend/src/app/(customer)/affiliate-terms/page.tsx (new)
 - frontend/src/app/(customer)/data-processing-addendum/page.tsx (new)
 - frontend/src/components/marketing/meta.ts
 - frontend/scripts/import-marketing-site.py (footer legal links)
 - frontend/src/__tests__/marketing-site.test.tsx
tests:
 - word check: every word of each PDF (page header and footer aside) is on its page, nothing added
 - vitest: the five pages draw every section, date and email link; the cookie table keeps its columns; a bold opening joins its sentence
 - local screenshots at 390 and 1280 wide: Data Processing page, the cookie table as cards on a phone, the privacy table on desktop, list bullets
---

## Prompt

aby tum ek ek page nh dekho mene tumhein batadia na bs o section theek krdo aur 5 policy pages dalein hain bs 5 mint ka tim ha jaldi kdo o daldo pdat kdo pdfs dalin hain

## Response snapshot

Stopped the full-site check and fixed only the flagged sections (see 675). Put the five PDFs in the repo root (Privacy Policy, Terms of Service, Cookie Policy, Affiliate Terms, Data Processing Addendum) on printcopilot.co: a script reads each PDF's layout (title, "Last updated", numbered headings, paragraphs, bold openings, indented list items, tables) into page data, checked word for word against the PDF. One page component draws them in the site's legal look, with a side list of sections on wide screens and tables as stacked cards on a phone. Privacy, Terms and Cookies now show the PDF text; Affiliate Terms (/affiliate-terms) and Data Processing Addendum (/data-processing-addendum) are new pages. Footer links: Affiliate Terms and Data Processing go to their new pages, Acceptable Use to the Terms section "Acceptable use and intellectual property". Shops keep their own pages at those addresses.

## Outcome

- ✅ Impact: the site's legal pages match the owner's PDFs; two new pages.
- 🧪 Tests: word check, vitest, tsc clean, screenshots.
- 📁 Files: see list above.
- 🔁 Next prompts: owner's yes to push.
- 🧠 Reflection: PDF table readers can drop spaces; read each cell inside its own box instead.
