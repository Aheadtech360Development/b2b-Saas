---
id: 599
title: Video host and own media address
stage: general
date: 2026-11-06
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks for the best third-party option for video in the media library, and for media addresses on the platform's own domain instead of ik.imagekit.io
labels: ["media", "imagekit", "video", "custom-domain", "planning"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/599-video-host-and-own-media-address.general.prompt.md
tests:
 - none (web: imagekit.io/plans custom domains 0 on Free and Lite, 1 on Pro $89, $9 each after; docs.bunny.net stream pricing and custom hostnames; developers.cloudflare.com stream pricing. Code: "cdn" is a reserved shop address in signup.py and platform tenants.py; IMAGEKIT_URL_ENDPOINT in config, artwork/inspect.py allows only that origin)
---

## Prompt

dekho meri jan scene sara ye krna ha abhi mjhy manager se bat hi wo kehra ha image lbraary mei video uploa dka bh option dena ha iske lie best option third party app kia ha jani jaldi batao aur abh jese imagekit use hua wa ha saiha to url mei imagekit,io kuch krke arha ha to mjhy apna url bnana ha is platform ke domain ki tarah jese printcopilot.co wagera ya kch to best option kia ha iske lie videos ke lie aur is cheez ke lie jaldi batao yar

## Response snapshot

Recommended staying on ImageKit for images and videos and moving to its Pro plan ($89 a month per its plans page), which includes one custom domain: cdn.printcopilot.co (already a reserved shop address, so no shop can take it). One library, one upload flow, 2 GB videos. Owner's steps: upgrade, ask ImageKit support for the domain, add the CNAME they give at Namecheap without touching the wildcard or _acme-challenge records. Then code: the URL endpoint, the artwork origin allow-list and old saved addresses. Alternatives named: Bunny Stream (cheapest per GB, custom hostname, but a second system), Cloudflare Stream (per minute; DNS not on Cloudflare). Still open: where videos show.

## Outcome

- ✅ Impact: the owner can tell the manager the plan and its cost.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: the owner's go and the plan upgrade, then build video upload and the domain switch.
- 🧠 Reflection: prices are from the vendors' pages on 2026-11-06; confirm in the ImageKit dashboard before paying.
