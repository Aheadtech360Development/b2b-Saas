/**
 * A demo request or a partner application from printcopilot.co, passed on to
 * GoHighLevel.
 *
 * Each form has its own inbound webhook in GHL (a workflow's "Inbound Webhook"
 * trigger). The addresses live in the environment rather than in the page —
 * anyone holding one can write into the CRM:
 *
 *   GHL_DEMO_WEBHOOK_URL      Book a demo
 *   GHL_PARTNER_WEBHOOK_URL   Affiliate and Partners
 *
 * Without one, a local build logs the submission and answers as if it went, so
 * the form can be tried; a production build says it could not be sent.
 */
export const dynamic = "force-dynamic";

const WEBHOOKS = {
  demo: "GHL_DEMO_WEBHOOK_URL",
  partner: "GHL_PARTNER_WEBHOOK_URL",
} as const;

type Form = keyof typeof WEBHOOKS;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A submitted value as text, trimmed and kept to a sensible length. */
function field(body: Record<string, unknown>, key: string, max = 500): string {
  const v = body[key];
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send the form as JSON." }, { status: 400 });
  }

  const form = body.form as Form;
  if (!Object.hasOwn(WEBHOOKS, form)) return Response.json({ error: "Unknown form." }, { status: 400 });

  const name = field(body, "name", 120);
  const email = field(body, "email", 200);
  if (!name) return Response.json({ error: "Please enter your name." }, { status: 400 });
  if (!EMAIL.test(email)) return Response.json({ error: "Please enter a valid email address." }, { status: 400 });

  const [first_name, ...rest] = name.split(/\s+/);
  const lead =
    form === "demo"
      ? {
          business_name: field(body, "biz", 200),
          business_type: field(body, "type", 100),
          country: field(body, "country", 100),
          message: field(body, "sell", 2000),
        }
      : {
          website: field(body, "site", 300),
          referral_method: field(body, "how", 100),
        };
  const payload = {
    form,
    source: form === "demo" ? "printcopilot.co — Book a demo" : "printcopilot.co — Affiliate and Partners",
    full_name: name,
    first_name,
    last_name: rest.join(" "),
    email,
    ...lead,
    submitted_at: new Date().toISOString(),
  };

  const url = process.env[WEBHOOKS[form]];
  if (!url) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[marketing lead] ${WEBHOOKS[form]} is not set; not sent:`, payload);
      return Response.json({ ok: true, delivered: false });
    }
    console.error(`[marketing lead] ${WEBHOOKS[form]} is not set; a ${form} submission was dropped.`);
    return Response.json({ error: "This form is not taking submissions right now." }, { status: 503 });
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`GoHighLevel answered ${res.status}`);
  } catch (err) {
    console.error(`[marketing lead] ${form} submission failed:`, err);
    return Response.json({ error: "We could not send that. Please try again." }, { status: 502 });
  }
  return Response.json({ ok: true, delivered: true });
}
