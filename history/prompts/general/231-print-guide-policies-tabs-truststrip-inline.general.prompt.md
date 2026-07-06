---
id: 231
title: Print Guide Content, Policies All Tabs, TrustStrip Inline
stage: general
date: 2026-06-05
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: fix print guide content, policies all tabs text, homepage trust section
labels: ["ui", "content", "wireframe", "frontend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/print-guide/page.tsx
  - frontend/src/app/(customer)/privacy-policy/PrivacyPolicyContent.tsx
  - frontend/src/components/home/TrustStrip.tsx
tests:
  - npm run build — passed, 0 TypeScript errors
---

## Prompt

Fix 3 pages to match wireframe exactly. Read relevant files first. DO NOT change any functionality.

Fix 1 — Print Guide: Remove card borders from methods, update compatibility table (7 rows: Heavyweight Cotton, Ring-Spun Cotton, CVC 52/48, CVC 60/40, CVC 65/35, Fleece 70/30, Fleece 80/20), update tips text and style (border-bottom, number 20px Fraunces).

Fix 2 — Policies page: Replace ALL 4 tabs content with exact wireframe text (Shipping & Returns, Ordering Info, Terms & Conditions, Privacy Policy).

Fix 3 — Homepage TrustStrip: Row 2 wholesale prompt — change from stacked to inline flex (text + button side by side, gap 12px, flexWrap wrap).

Build, fix TypeScript, commit, push.

## Response snapshot

- Print Guide: removed `border` and `background` from each decoration method div; COMPAT_TABLE updated to 7 rows with new fabric names and "Low Poly — Test First" rating; cellColor updated to use `val.includes("Test First")`; TIPS array updated to exact wireframe wording; list items changed to `padding: "14px 0"`, `borderBottom: "1px solid #E2E2DE"`, number font-size `20px` weight `700`
- Policies: All 4 tabs replaced with exact wireframe text; Privacy Policy updated contact email to `info.afapparel@gmail.com` and added address line
- TrustStrip: Row 2 changed to `display: flex, alignItems: center, justifyContent: center, flexWrap: wrap, gap: 12px`; `marginTop: 20px`, `paddingTop: 18px`; button gets CSS hover (background fills navy)
- Build: clean, 0 errors, 79 static pages generated

## Outcome

- ✅ Impact: Three pages now match wireframes — print guide plain text methods, 7-row compat table, correct tips; all 4 policy tabs with accurate/updated text; trust stats section with inline wholesale prompt row
- 🧪 Tests: npm run build — passed clean
- 📁 Files: 3 files modified
- 🔁 Next prompts: additional wireframe or content fixes
- 🧠 Reflection: Session recovered from context compaction; read JSONL transcript to retrieve exact wireframe data before editing

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): build PASS
- Prompt variant (if applicable): none
- Next experiment: none
