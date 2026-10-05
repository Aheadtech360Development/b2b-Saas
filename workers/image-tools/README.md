# Image tools (Cloudflare Worker)

Background removal for the gang sheet builder, Upload by size and the image
editor. It runs on Cloudflare Images (`segment=foreground`), so it costs the
buyer's device nothing and takes the same few seconds for everybody.

## How a request gets here

1. The browser asks our API for a ticket: `POST /api/v1/upload/cutout-ticket`.
   The API checks the shop, applies its rate limits, and signs a ticket good for
   five minutes.
2. The browser sends the image straight to this Worker — `POST /cutout`, the
   ticket in an `x-ticket` header — and gets back a PNG with the background
   transparent.

The image never passes through our API, and the Worker does nothing without a
valid ticket.

## Settings

| Where | Name | What |
|---|---|---|
| This Worker (secret) | `SIGNING_KEY` | The key tickets are signed with |
| API (Railway variables) | `IMAGE_TOOLS_KEY` | The same key |
| API (Railway variables) | `IMAGE_TOOLS_URL` | This Worker's address, no trailing slash |

Without the two API variables the ticket endpoint answers 503, and the builders
fall back to removing the background in the browser as they did before.

## Deploying

```sh
cd workers/image-tools
npx wrangler deploy
npx wrangler secret put SIGNING_KEY    # only when the key changes
```

## Limits

- Cloudflare Images takes at most 20 MB through a Worker. The builders send a
  copy no larger than 1536 px on its longest edge and apply the result to the
  full-size original, so print resolution is kept and uploads stay small. A
  removal takes about five seconds, nearly all of it the model.
- On Cloudflare's free plan 5,000 transformations a month are included. Past
  that the Worker answers 502 and the builders fall back to the browser.
- AI upscaling (`upscale=generate`) does not take effect through a Worker's
  Images binding — tried October 2026. It is not offered here.
