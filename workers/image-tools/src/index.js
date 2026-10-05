/**
 * Image tools for the print builders, run on Cloudflare.
 *
 * Background removal used to run in the buyer's own browser: a large model
 * downloaded on first use, then minutes of work on a slow phone or laptop.
 * Here it runs on Cloudflare's hardware and takes the same few seconds for
 * everybody.
 *
 * The browser sends the image straight here — not through our API, which
 * would mean uploading it twice — so this cannot be open to anyone who finds
 * the address. Our API hands the browser a short-lived ticket, signed with a
 * key only it and this Worker hold; no valid ticket, no work.
 */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-ticket",
  "access-control-max-age": "86400",
};

/** The Images binding takes at most this much. */
const MAX_BYTES = 20 * 1024 * 1024;

const reply = (status, text) => new Response(text, { status, headers: { ...CORS, "content-type": "text/plain; charset=utf-8" } });

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Equal or not, taking the same time either way. */
function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * A ticket is `<expires>.<shop>.<signature>`: when it stops working (seconds
 * since 1970), which shop it was issued for, and an HMAC-SHA256 of the first
 * two parts. Returns the shop, or null when the ticket is not good.
 */
export async function shopFor(ticket, key, now = Date.now() / 1000) {
  if (!ticket || !key) return null;
  const first = ticket.indexOf(".");
  const last = ticket.lastIndexOf(".");
  if (first < 1 || last <= first) return null;
  const expires = Number(ticket.slice(0, first));
  const shop = ticket.slice(first + 1, last);
  const signature = ticket.slice(last + 1);
  // Not yet expired, and not dated further ahead than any ticket we issue.
  if (!Number.isFinite(expires) || expires < now || expires > now + 3600) return null;

  const signer = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", signer, new TextEncoder().encode(`${expires}.${shop}`)));
  return same(signature, expected) ? shop : null;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const { pathname } = new URL(request.url);
    if (request.method !== "POST" || pathname !== "/cutout") return reply(404, "Not found.");

    const shop = await shopFor(request.headers.get("x-ticket"), env.SIGNING_KEY);
    if (!shop) return reply(401, "This request is not allowed.");

    if (Number(request.headers.get("content-length") || 0) > MAX_BYTES) return reply(413, "That image is too large.");
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return reply(400, "No image was sent.");
    if (bytes.byteLength > MAX_BYTES) return reply(413, "That image is too large.");

    try {
      const out = await env.IMAGES
        .input(new Blob([bytes]).stream())
        .transform({ segment: "foreground" })
        .output({ format: "image/png" });
      console.log(`cutout shop=${shop} bytes=${bytes.byteLength}`);
      return out.response({ headers: { ...CORS, "cache-control": "no-store" } });
    } catch (err) {
      console.log(`cutout failed shop=${shop} bytes=${bytes.byteLength} error=${(err && err.message) || err}`);
      return reply(502, "The background could not be removed from that image.");
    }
  },
};
