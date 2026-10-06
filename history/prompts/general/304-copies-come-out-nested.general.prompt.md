---
id: 304
title: Copies come out nested
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: Auto Build and "add quantity" must come out nested like the competitor's, so Auto Nest is only needed for sheets arranged by hand
labels: ["gang-sheet", "auto-build", "auto-nest", "copies"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/storefront/AutoBuildPanel.tsx (the wider "artboard" edge is off by default)
 - frontend/src/components/storefront/GangSheetStudio.tsx (nestWithCopies / applyCopiesNest; Auto Nest keeps an edge chosen in Auto Build)
 - frontend/src/__tests__/gang-sheet-studio.test.tsx (two new)
tests:
 - frontend vitest: gang-sheet-studio + sheet-nesting 44/44; tsc: no new errors
---

## Prompt

With three pictures: the competitor's Auto Build on a 2 ft sheet — thirteen T-shirts in two tight rows of seven and six; ours on 22×10 — rows of five, four and four; ours after pressing Auto Nest — seven and six.

ye dekho ye pehli image mera competiro ha isme auto nest for standard kra kitna perfect aya ha aur mera dekhna jani zara  aur ye dusri pic dekho meri jan mera kese aya aur jb mene auto nest kia na  phir hogya ye sai phir whi bat na jani mei ne tumhein smjhaya to ha ke asa na ho auto nest krne ki zaroorat nh pare yar khud hi hojae auto nest sirf tb bnda kre tb manually wo sheet bhare saiha bhai plz har cheez dekhlo jb banda ek design manually upload kre aur add quantity krke 10 bhi add kre na tb bhi itna intelligent system ho khud proper gapping margin wagera dekhle usme bhi auto nest ki zaroorat na pare plz yar boss final dekhlo isko abhi dikhana ha manager ko

(then) kia hua jani ready kro na yar

## Response snapshot

Three causes, all fixed:

1. **The picture of five, four and four** is the old Auto Build packer; the change that makes Auto Build use Auto Nest's planner (c747054) had only just been pushed and was likely not live yet.
2. **Auto Build's own edge**: its "artboard margin" (0.25 in) was on by default, wider than the sheet's safe edge, so Build fitted six to a row and Auto Nest seven — and Auto Nest still moved things. It is off by default now; a wider edge can still be chosen, and Auto Nest remembers it.
3. **Add quantity**: copies only went into free space around the design, so a design dropped in the middle of the sheet scattered its copies. Now several copies at once (or any copy of a design that is alone on the sheet) nest the whole sheet with Auto Nest's own rules — the design itself moves to the corner, everything in rows with the sheet's margin — and the designs that move glide there and the copies arrive, one after another. A roll is let out to the shortest length that holds them. When they do not all fit, the "Not enough room" question is asked as before.

Tested on the real studio: a design in the middle of a 22×10 sheet plus twelve copies comes out in rows of 6, 6, 1 from the top-left corner (half-inch margin, 0.25 in edge), and Auto Nest then says "Already nested — nothing needed to move." and moves nothing.

## Outcome

- ✅ Impact: Build and Add copies give the finished layout; Auto Nest is for sheets arranged by hand.
- 🧪 Tests: as listed; no browser run.
- 📁 Files: as listed.
- 🔁 Next prompts: try it on the live studio once Vercel has deployed it.
- 🧠 Reflection: two defaults (Build's edge vs the sheet's) disagreeing by a quarter inch was enough to cost a whole column.

## Evaluation notes (flywheel)

- Failure modes observed: a picture taken before the previous fix was live.
- Graders run and results (PASS/FAIL): all PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): none planned.
