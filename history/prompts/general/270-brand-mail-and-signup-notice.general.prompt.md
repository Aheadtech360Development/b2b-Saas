---
id: 270
title: Brand mail and the new-shop notice
stage: general
date: 2026-09-24
surface: agent
model: claude-opus-5
feature: none
branch: main
user: Aheadtech360Development
command: continuation of tenant-domain work
labels: ["email","multi-tenant","resend","signup"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/core/tenant_context.py
 - backend/app/core/database.py
 - backend/app/core/config.py
 - backend/app/services/email_service.py
 - backend/app/tasks/email_tasks.py
 - backend/app/api/v1/signup.py
tests:
 - scratchpad/t_brand_mail.py (ALL PASSED — 17 checks)
 - scratchpad/t_signup.py (ALL PASSED)
 - scratchpad/t_two_brands.py (ALL PASSED)
 - scratchpad/t_entitlements.py (ALL PASSED)
---

## Prompt

aur ye mene na dekho resend ki apikey railway mei lagadi ha saiha mei chahta hn koi bhi signup hona new brand signup kre to support@printcopilot.co is mail pr na jana chaye proper iska mail ke new signup aya ha isme aur ye bhi dekhlena ye domain add krna parega kia isme — Ek cheez jo main ne abhi tak nahi ki, tum kaho to kar dun: customer ke emails (track order, abandoned cart, activation) abhi bhi platform ke address se link bana rahe hain — unhein bhi brand_urls pe laga dun taake brand ka customer brand ki shop pe utre. aur ye jo tumne bola ha ye bhi krdo jani

## Response snapshot

Two things, both at one choke point each.

1. **Links.** ~40 call sites build links from `FRONTEND_URL` (the platform's
   address). Rather than edit 40 sites, the brand's own origin is now resolved
   once per request in `_apply_tenant_context` (`_resolve_brand_site`, cached
   300s, built by `brand_urls.build`) and carried on a new contextvar; the
   single send path (`_send_via_resend`) rewrites the platform origin to it via
   `_point_at_brand`. Celery email tasks set it too, from the order's tenant.

2. **New-shop notice.** `PLATFORM_SUPPORT_EMAIL` added to config;
   `email_service.notify_platform()` sends as the platform (brand name and site
   swapped out and restored) so its links are not bent towards a brand;
   `signup.py` queues `_announce` as a `BackgroundTasks` job, so a sign-up
   never waits on — or fails because of — an inbox.

Resend: yes, the domain must be added and verified before anything can be sent
from `@printcopilot.co`. Sending ≠ receiving — `support@printcopilot.co` needs
a mailbox or Namecheap email forwarding on the root MX; Resend's own MX sits on
`send.printcopilot.co`, so the two do not collide.

## Outcome

- ✅ Impact: a brand's customer lands on the brand's shop; the platform hears
  about every new shop.
- 🧪 Tests: 17 new checks in t_brand_mail.py + three existing suites, all green.
- 📁 Files: 6 backend files, +182/-7.
- 🔁 Next prompts: verify the Resend domain; set RESEND_FROM_EMAIL,
  PLATFORM_SUPPORT_EMAIL, and clear EMAIL_REDIRECT_TO on Railway; a welcome
  email to the new owner.
- 🧠 Reflection: the send path already rebranded copy at one point — links
  belonged in the same place, not in 40 call sites.

## Evaluation notes (flywheel)

- Failure modes observed: EMAIL_REDIRECT_TO left set after a domain is verified
  silently diverts every message; APP_ENV=development does the same implicitly.
- Graders run and results (PASS/FAIL): PASS (4 suites)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): per-brand Resend sending domains,
  so a brand's mail is *from* its own domain rather than only replying to it.
