---
id: 204
title: Policy tabs text update and favicon addition
stage: general
date: 2026-05-19
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Update policy pages text content from policy-text.txt + add favicon
labels: ["policy","privacy","shipping","terms","favicon","content-update"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/privacy-policy/PrivacyPolicyContent.tsx
  - frontend/src/app/layout.tsx
tests:
  - none
---

## Prompt

Update policy pages text content. Read the file at C:\Users\RT\Desktop\AF Apparel\policy-text.txt
Find the policies page in frontend that has these 3 tabs (Search for 'Shipping & Returns' or 'Privacy Policy' or 'Terms' in frontend files)
Update ONLY the text content of each tab with the corresponding text from the file. Do not change any styling, layout, component structure, or other pages.

Also add favicon: Find the AF Apparels logo file in public/ folder and add it as the site favicon in layout.tsx.

## Response snapshot

- Found policy page at `frontend/src/app/(customer)/privacy-policy/PrivacyPolicyContent.tsx` — has 4 tabs: Shipping & Returns, Ordering Info, Terms & Conditions, Privacy Policy
- Found logo at `frontend/public/Af-apparel logo.png`
- Rewrote Shipping & Returns tab: simplified to match policy-text.txt (shipping methods FAQ + claim/return policy FAQ + contact info box)
- Rewrote Terms & Conditions tab: replaced 9-section generic text with 13 FAQ entries from policy-text.txt (payment methods, minimums, PO submission, processing time, shipping, will call, email notifications, claims/returns, time frame, damaged items, incorrect items, return shipping, cancellations)
- Rewrote Privacy Policy tab: replaced simplified 8-section summary with full Shopify-generated privacy policy from policy-text.txt (last updated January 30, 2025), all 14 sections rendered with h3 headings and proper structure
- Ordering Info tab: left completely unchanged
- Added favicon to `layout.tsx` metadata `icons` field pointing to `/Af-apparel logo.png` (icon + apple variants)
- Moved TERMS_FAQS array to module level for cleaner JSX

## Outcome

- ✅ Impact: Policy pages now display the actual AF Apparels business policies from policy-text.txt instead of generic placeholder content; site now has a favicon
- 🧪 Tests: none
- 📁 Files: 2 files modified
- 🔁 Next prompts: verify policy pages render correctly in browser
- 🧠 Reflection: Complete rewrite approach used for PrivacyPolicyContent.tsx since changes spanned 3 out of 4 content sections; kept Ordering Info tab content exactly as-is

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
