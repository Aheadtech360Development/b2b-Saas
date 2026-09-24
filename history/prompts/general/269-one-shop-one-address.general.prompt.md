---
id: 269
title: One shop, one address
stage: general
date: 2026-09-24
surface: agent
model: claude-opus-5
feature: none
branch: main
user: Aheadtech360Development
command: continuation of tenant-domain work
labels: ["multi-tenant","routing","middleware","domains"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/middleware.ts
 - frontend/src/__tests__/middleware.test.ts
tests:
 - frontend/src/__tests__/middleware.test.ts (9 passed)
 - scratchpad/t_host_tenant.py (ALL PASSED)
 - scratchpad/t_two_brands.py (ALL PASSED)
 - scratchpad/t_chrome.py (ALL PASSED)
 - npx tsc --noEmit (clean), npx next build (clean)
---

## Prompt

ek chota sa issue ha jo mene catch kra ha printcopilot.co saiha tumhare wala landing page hi arha ha zabardast saiha lekin msla ye arha ha usme jese interflow ka dashboard kholrha hn na to store view click krrha na to us domain pe us ki site arhi jo us brand ne mjhsy bnwai ha dekho zara halake ye is tarah hona printcopilot.interflow ase krke kuch kia kehty ho matlab differentiator to hona chayie na jani koi kuke dono domain ase to kabhi kch dikhaegy kabhi kch to proper analyze kro is cheez ko aur mjhy proper batao ke ab kia scene ha saiha

## Response snapshot

Two causes, one in code and one in configuration.

1. Code: `?tenant=<slug>` was a second address for every shop, and the cookie
   that visit set was read again on the apex, so `printcopilot.co` showed
   whichever shop was browsed last. Fixed in `frontend/src/middleware.ts`:
   `isPlatformHost()` is exported; `resolveSlug()` returns null on the
   platform host (no cookie, no query read); `?tenant=<slug>` arriving on the
   platform host 307-redirects to `<slug>.<PLATFORM_DOMAIN>` with the param
   stripped; the tenant cookie is written only on a shop's address. Other
   hosts (preview deploys) keep the query fallback unchanged.

2. Configuration: `tenantUrl()` falls into query mode when the page is not
   served from `NEXT_PUBLIC_PLATFORM_DOMAIN`, so "Store view" built
   `printcopilot.co/?tenant=interflow` instead of `interflow.printcopilot.co`.
   That env var must be live in the Vercel production build, and each brand
   needs its subdomain added to the Vercel project.

## Outcome

- ✅ Impact: the platform's address is only ever the platform's; a shop is only
  ever reached at its own address.
- 🧪 Tests: 9 new middleware tests + 3 backend suites, all passing; typecheck
  and production build clean. Two pre-existing `api-client.test.ts` failures
  (token-refresh dedupe) are untouched by this change.
- 📁 Files: middleware.ts, middleware.test.ts
- 🔁 Next prompts: add each brand's subdomain in Vercel; confirm
  NEXT_PUBLIC_PLATFORM_DOMAIN is live; point buyer-facing emails at brand_urls.
- 🧠 Reflection: the sticky cookie, not the query parameter, was the part that
  made the same URL show different things to different people.

## Evaluation notes (flywheel)

- Failure modes observed: an env var that exists in the dashboard but was not
  in the deployed build looks exactly like a code bug.
- Graders run and results (PASS/FAIL): PASS (vitest 9/9, three backend suites)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a wildcard `*.printcopilot.co`
  domain in Vercel so a new brand needs no manual step.
