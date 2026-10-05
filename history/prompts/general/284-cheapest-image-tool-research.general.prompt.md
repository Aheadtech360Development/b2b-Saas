---
id: 284
title: Cheapest image tool research
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: check properly which background-removal / upscale tool is cheap and efficient; the platform pays, not the client
labels: ["gang-sheet-builder", "background-removal", "upscale", "pricing", "research"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none changed
tests:
 - none (pricing and feature research on the providers' own pages)
---

## Prompt

dekho tum pehle na proper dekhlo konsa sasta aur sai tool rhega meri jan proper na phir batao sasta ho aur efficeitn ho nh client se nh lena pasia paisa ham super admin hi dengy bhai

## Response snapshot

Decision recorded from the owner: the platform (super admin) pays; the client is never charged.

Checked today on the providers' own pages:

| Tool | Background removal | AI upscale | 10,000 jobs a month |
|---|---|---|---|
| Cloudflare Images | $0.0005 | $0.0005 | about $2.50 (first 5,000 included) |
| Replicate | about $0.00043 | about $0.0024 | about $14 |
| fal.ai | about $0.0016 (my estimate) | $0.004 | about $28 |
| Photoroom | about $0.02 | not in that plan | $100 for removal alone |
| ImageKit | about $0.018 | about $0.009 | about $217, needs the $89 plan |

Recommendation: Cloudflare Images — both tools in one service (BiRefNet cut-out, ESRGAN upscale), cheapest by a wide margin. fal.ai as plan B. Colour-based removal for flat artwork stays step 1 whatever is chosen: free, instant, full resolution.

Said plainly what is not confirmed: quality on real DTF artwork (not tested for any of them); Cloudflare's speed in seconds; that Cloudflare's server-side route accepts the two options; fal's figures (its pages blocked the reader, numbers come from search snippets). Proposed a short trial on the client's own problem files before committing.

Asked for: a go-ahead for step 1, a free Cloudflare account, and three or four of the client's files that came out badly.

## Outcome

- ✅ Impact: a priced comparison and one recommendation, with the open points named.
- 🧪 Tests: none.
- 📁 Files: none.
- 🔁 Next prompts: go-ahead; the client's problem files; Cloudflare account.
- 🧠 Reflection: the first answer named fal.ai from memory; looking it up turned up a cheaper service that also does the upscale. Worth the lookup.

## Evaluation notes (flywheel)

- Failure modes observed: fal.ai and Photoroom pages returned 403 to the fetcher; their figures rest on search snippets.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run five real artwork files through Cloudflare's cut-out and upscale, time them, and look at the results.
