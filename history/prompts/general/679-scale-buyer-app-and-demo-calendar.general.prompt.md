---
id: 679
title: Scale buyer app and demo calendar
stage: general
date: 2026-11-16
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner says yes to both open points, done properly - keep Scale's "your own branded buyer app" (make it real) and give the demo form a real time picker
labels: ["mobile-app", "scale-plan", "marketing-site", "demo-booking"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/core/features.py (shop code screen = mobile_app, Scale only)
 - backend/app/core/config.py (MOBILE_APP_STORE_URL, MOBILE_PLAY_STORE_URL)
 - backend/app/services/shop_code.py (buyer_app flag, card with link and QR)
 - backend/app/api/v1/storefront.py (by-code 403 not_on_app; branding buyer_app + website; shop-code card)
 - backend/app/services/demo_slots.py (new)
 - backend/app/api/v1/leads.py (GET demo-slots, booking check, visitor confirmation)
 - backend/app/middleware/auth_middleware.py (demo-slots open)
 - backend/tests/test_buyer_app.py, backend/tests/test_demo_booking.py (new)
 - frontend/src/app/(admin)/admin/settings/buyer-app/page.tsx, components/admin/settings/BuyerAppPanel.tsx, SettingsFrame.tsx
 - frontend/src/app/(customer)/get-app/page.tsx, components/marketing/site/GetApp.tsx
 - frontend/src/components/marketing/site/SiteWire.tsx (demo time picker)
 - frontend/src/components/platform/LeadsTab.tsx (meeting time first)
 - frontend/src/__tests__/buyer-app.test.tsx (new), marketing-site.test.tsx
 - mobile/src/App.tsx, api/client.ts, api/shop.ts, screens/ApplyScreen.tsx, shop/ShopApp.tsx
tests:
 - backend: test_demo_booking, test_buyer_app, test_leads, test_mobile_app_routes - 67 passed
 - vitest: marketing-site, buyer-app, marketing-forms - 51 passed
 - tsc --noEmit: website and mobile app clean
 - local screenshots at 390 wide: the demo time picker and the booked message
---

## Prompt

Do sawal ab bhi aap ke jawab ka wait kar rahe hain: Scale plan par "your own branded buyer app" rehne dein ya nahi, aur demo form mein calendar ki jagah email par time bhejna theek hai ya nahi. hn ye dono krdo mere bhai proper

## Response snapshot

Branded buyer app (Scale): the console's code and QR (Settings, Buyer app) are Scale only; the page shows the shop's six-character code, its QR square (download as PNG), copy buttons, a "New code" that asks first, and how buyers get in; other plans see the Scale upgrade box. The QR opens printcopilot.co/get-app, which names the shop, shows the code, and opens the app at the shop's Apply screen with the code filled in. The code lookup turns away a shop without the app and says where to order instead; in the app, a buyer of a shop without it sees "not on the app" with its website and Sign out. Store links come from two settings, and until they are set every page says the app is not in the stores yet.

Demo calendar: "Choose a time" now opens a second step with the open half-hour slots of the next two weeks of working days, in the team's hours from the Contact page (Mon to Fri, 9 to 5 US Eastern), shown in the visitor's own time zone, no US federal holidays, two hours' notice. The picked slot is checked again on the server (409 if taken), kept with the lead, shown first in the console's Leads, and the visitor is emailed a confirmation. If the times cannot load, the request goes as before.

## Outcome

- ✅ Impact: Scale's buyer app has a real gate, code and QR; the demo form books a time.
- 🧪 Tests: 67 backend, 51 vitest, two type checks, two screenshots.
- 📁 Files: see list above.
- 🔁 Next prompts: owner's yes to push; when the app is published, the two store links in Railway.
- 🧠 Reflection: the design's headings inside forms are styled white with weight; text drawn into them needs its own colour.
