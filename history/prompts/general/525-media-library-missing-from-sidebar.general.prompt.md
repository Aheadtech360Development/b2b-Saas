---
id: 525
title: Media library missing from the admin sidebar
stage: general
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: none
branch: fix/media-library-nav
user: Aheadtech360Development
command: ek masla iske ilawa ye ha ke bhae pehle to sidebar mei image library thi na jaha brand ka bnda apni images dalke use kelta tha ab wo kaha chali gyi ha yar dekho bhai mere
labels: ["admin-sidebar", "media-library", "live-fix", "navigation"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/layout/AdminSidebar.tsx (Place.alwaysOpen; Storefront always shows its screens)
 - frontend/src/__tests__/admin-sidebar.test.tsx (new, 2)
 - history/prompts/general/525-media-library-missing-from-sidebar.general.prompt.md
tests:
 - frontend admin-sidebar 2 passed (Media library link shown from the dashboard; lit when open); tsc clean
---

## Prompt

ek masla iske ilawa ye ha ke bhae pehle to sidebar mei image library thi na jaha brand ka bnda apni images dalke use kelta tha ab wo kaha chali gyi ha yar dekho bhai mere

## Response snapshot

Not deleted: the Media library page and every picture are still there, and the sidebar still lists it under Storefront. Since the new admin went live (2026-10-19) a place shows its own screens only once somebody is in it, and clicking Storefront opens the website builder, a full page with no sidebar. So nobody was ever "in" Storefront with the sidebar showing, and its screens (Website builder, View store, Media library) never appeared. Fixed in the sidebar: Storefront now always shows its screens. Built on a worktree of live main (branch fix/media-library-nav), waiting for the owner's yes to push.

## Outcome

- ✅ Impact: brands see Media library under Storefront in the sidebar again, from any admin page, once pushed.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push on the owner's yes, then a check on the live site.
- 🧠 Reflection: a nav rule that opens a group only from inside it hides the group for good when its first link leaves the layout; check where a place's first link lands.
