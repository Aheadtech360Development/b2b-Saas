---
id: 378
title: Admin redesign new shell and Home
stage: general
date: 2026-10-09
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: make the admin's first page (the Command Center) look like the two screenshots, with working features, on localhost only
labels: ["admin-redesign", "home", "sidebar", "order-queues", "returns", "local-only"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/order_queues.py (new)
 - backend/app/services/admin_home.py (new)
 - backend/app/api/v1/admin/home.py (new)
 - backend/app/api/v1/admin/orders.py
 - backend/app/api/v1/admin/nav_counts.py
 - backend/app/main.py
 - backend/tests/test_admin_home.py (new)
 - frontend/src/app/(admin)/admin-shell.css (new)
 - frontend/src/app/(admin)/layout.tsx
 - frontend/src/app/(admin)/admin/dashboard/page.tsx
 - frontend/src/app/(admin)/admin/orders/page.tsx
 - frontend/src/app/(admin)/admin/returns/page.tsx
 - frontend/src/components/layout/AdminSidebar.tsx
 - frontend/src/components/admin/AdminTopbar.tsx (new)
 - frontend/src/components/admin/TrialBanner.tsx
 - frontend/src/components/admin/CopilotDock.tsx
 - frontend/src/services/admin.service.ts
 - frontend/next.config.ts
tests:
 - backend/tests/test_admin_home.py — 11 passed (the queues read as SQL, the wording; no database)
 - frontend type-check — clean but for the two old errors in src/__tests__/api-client.test.ts
 - local API, demo shop — every number on Home that points at the order list equals the total of the list behind its button (new 7/7, unpaid 7/7, in production 1/1, ready 0/0, shipped 3/3); an unknown queue name answers 400
 - browser engine, local shop, 1440 wide — Home drew from the server's answer; each button was pressed or opened and landed on the screen it names; the sales figure matched the server for 7 days, 30 days and all time; search found an order by number and a customer by name, and Enter opened that order; the Copilot panel opened and shut from the top bar; the account menu opened; the Returns page listed the three returns Home counts
 - browser engine, 390 wide — no sideways scroll, the drawer opens from the menu button, the orders table fits
 - the trial bar was looked at by changing the billing answer in that browser only (the demo shop is not on trial)
 - NOT run — the frontend unit tests (vitest), a production build (next build), and anything on a real phone or in Safari or Firefox
 - NOT checked — the platform console, a staff account with fewer permissions, a shop on a plan with locked features
---

## Prompt

(two screenshots of the new admin Home design)

bhae sb mei pehle ye ajao ab jo brands ko abhi admin panel dikhra hana sb se pehle hamein ab wo change krna ha saiha bhai ab ye abhi jo at the moment live mei command center wala page hana wo asa dikhey saiha bhai proper dekho sirf statically change nh krna bhai features bhi chayien features break na hone chayien bilkul saiha abhi ye ek screen ap kro blkl change meri jan jaldi se saiha jaldi kro sirf aur han main bat sirf localhost saihas koi cheez live nh jani chayie poori ui change krke ek sath mei krunga isko deploy jb tk sirf localhost pe chayie mere ko

(sent while the work was under way)

mei tumhein ek sath sari screens dedun?

## Response snapshot

- The new shell is on every admin page of the local shop: the dark sidebar with eight places and Settings at the foot, the top bar with search, Inbox, Copilot and the account menu, and the slim trial bar.
- Home is "Today": Needs you today, Production pipeline, Recent orders, Get ready to go live, Sales. All of it is read from the shop's own data through one new answer, GET /admin/home.
- A count of orders and the list behind its button come from one definition (services/order_queues.py), so they are the same rows. Checked on the local shop.
- Found and fixed on the way, on the branch only: the admin's Returns list answered 500 as soon as a shop had a return, so "Review returns" opened an empty page.
- Three commits on the local branch admin-ui-redesign (358af0e, 2548023 and this record). Nothing was pushed; main and the live site are as they were.
- To the owner's question: yes, send all the screens at once.

## Outcome

- ✅ Impact: the first screen of the new admin and the frame for the rest, working against real data on localhost.
- 🧪 Tests: as listed, with what was not run.
- 📁 Files: as listed.
- 🔁 Next prompts: the remaining screens' designs; whether the returns fix should go to the live site now; whether the pipeline's stages are the ones the owner means.
- 🧠 Reflection: the first version passed a filter in each button's address and three of the lists disagreed with their counts. Two filters kept alike by hand do not stay alike; one named definition read by both sides does.

## Evaluation notes (flywheel)

- Failure modes observed: a count and its list defined in two places (ship queue, unpaid, drafts); a wait loop that could not end because curl could not write to /dev/null with path conversion off; two quick edits to next.config.ts left the dev server on the first.
- Graders run and results (PASS/FAIL): unit tests PASS (11); count-equals-list on the local API PASS; browser pass PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): for each further screen, compare every number shown with the rows behind its link before calling it done.
