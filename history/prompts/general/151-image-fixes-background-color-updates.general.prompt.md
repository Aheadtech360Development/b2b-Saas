---
id: "151"
title: Image Fixes and Background Color Updates
stage: green
date: 2026-05-07
surface: agent
model: claude-sonnet-4-6
feature: ui-fixes
branch: main
user: umeradnan7106
command: fix images not showing, update background colors in AF Apparels frontend
labels: ["images","next/image","background-color","private-label","cta","hero","about"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/next.config.ts
  - frontend/src/components/home/HeroSection.tsx
  - frontend/src/components/home/WhyChooseUs.tsx
  - frontend/src/components/home/CtaSection.tsx
  - frontend/src/app/(customer)/about/page.tsx
  - frontend/src/app/(customer)/private-label/page.tsx
tests:
  - manual: HeroSection image renders at /
  - manual: WhyChooseUs image renders on homepage
  - manual: About page shows both Our Story images
  - manual: Private label hero shows product image, light background
  - manual: CTA section shows #f4f3ef background with dark text
---

## Prompt

Fix images not showing, update background colors in AF Apparels frontend.
- FIX 1: Add GitHub raw domains to next.config remotePatterns
- FIX 2: Replace placeholder boxes / <img> with Next.js <Image> using actual public/ files
- FIX 3: Check actual image files before replacing
- FIX 4: Private Label dark hero (#111) → #f4f3ef, update all text colors
- FIX 5: Homepage CTA section (#1B3A5C) → #f4f3ef, update all text colors

## Response snapshot

Read all 5 target files + next.config + ran find on public/ first. Found these actual image files:
- `Home page Hero.png` (HeroSection was using wrong case "Home Page Hero.png" — case mismatch)
- `Why 2,000+ Businesses Choose AF Apparels.png`
- `Our Story.png`, `Our Story-2.png`
- `Private Label Direct Blanks.png`

Changes made:
1. next.config.ts: added specific github.com / githubusercontent.com remotePatterns alongside existing wildcards
2. HeroSection.tsx: `<img>` → `<Image fill>`, fixed path case (Page → page), added `priority`
3. WhyChooseUs.tsx: `<img>` → `<Image fill>`, added `position: relative` to container
4. about/page.tsx: replaced two emoji placeholder divs with `<Image fill>` using Our Story.png + Our Story-2.png
5. private-label/page.tsx: replaced Shirt icon placeholder with `<Image fill>` using Private Label Direct Blanks.png; hero background #111 → #f4f3ef; heading #fff → #1b3a5c; body #9CA3AF → #444; badge dark navy bg; "Download Guide" button border/text dark; feature stats #555
6. CtaSection.tsx: background #1B3A5C → #f4f3ef; heading #fff → #1b3a5c; body rgba(255,255,255,.55) → #444; "Browse Products First" border/text #1b3a5c

## Outcome

- ✅ Impact: Images now render via optimized Next.js Image component; dark-on-light color schemes applied to Private Label hero and CTA section
- 🧪 Tests: Manual visual verification needed in browser
- 📁 Files: 6 files modified
- 🔁 Next prompts: Verify images load correctly in browser; check mobile responsive layout for private label grid (1fr 1fr may need to collapse on small screens)
- 🧠 Reflection: Key bug was case mismatch in HeroSection path ("Home Page Hero.png" vs actual "Home page Hero.png") — caught by reading actual filenames from disk before editing

## Evaluation notes (flywheel)

- Failure modes observed: Case sensitivity in image filenames causes silent failure on Linux/Docker even though it works on Windows
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
