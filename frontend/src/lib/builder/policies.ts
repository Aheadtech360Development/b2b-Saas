/**
 * The shop's policies: shipping, returns, privacy, terms, contact.
 *
 * Every shop needs the same five, and nobody should have to build a page out
 * of sections and columns to say how long delivery takes. So they are named
 * here once, and written in a plain box of formatted text.
 *
 * A policy is not a new kind of thing. It is an ordinary page at a fixed
 * address, holding one block of formatted text — so it is drawn by the page
 * template like any other page, goes live with Publish like any other page,
 * can be linked from a menu like any other page, and is already laid out for a
 * phone. What is here is only the short way in.
 */
import type { BuilderNode, SiteDoc } from "./types";
import { newId, updateNode, walk } from "./tree";

export interface Policy {
  key: string;
  label: string;
  /** Where it lives on the shop: `/shipping-policy`. */
  slug: string;
  /** What it is for, in a line. */
  blurb: string;
  /** Headings and prompts to start from. Everything in [brackets] is to be replaced. */
  outline: string;
}

export const POLICIES: Policy[] = [
  {
    key: "shipping", label: "Shipping policy", slug: "shipping-policy",
    blurb: "How long an order takes to make and deliver, and what delivery costs.",
    outline:
      "<h3>Processing time</h3><p>[How long it takes you to print and pack an order — for example, 1–2 business days.]</p>"
      + "<h3>Delivery times and costs</h3><p>[The carriers you use, what delivery costs, and how long it usually takes.]</p>"
      + "<h3>Tracking your order</h3><p>[How and when the customer is sent a tracking number.]</p>"
      + "<h3>Questions</h3><p>[The email address or phone number to reach you on.]</p>",
  },
  {
    key: "refund", label: "Return & refund policy", slug: "refund-policy",
    blurb: "What can be sent back, what cannot, and how a refund is paid.",
    outline:
      "<h3>Returns</h3><p>[Whether you accept returns, and within how many days of delivery.]</p>"
      + "<h3>Custom and printed items</h3><p>[Whether made-to-order items can be returned, and in which cases — for example, only when they arrive damaged or wrong.]</p>"
      + "<h3>Damaged or incorrect orders</h3><p>[What the customer should send you — the order number, photos — and how soon after delivery.]</p>"
      + "<h3>Refunds</h3><p>[How a refund is paid, and how long it takes to arrive.]</p>",
  },
  {
    key: "privacy", label: "Privacy policy", slug: "privacy-policy",
    blurb: "What you collect about customers and what you do with it.",
    outline:
      "<h3>What we collect</h3><p>[The details you take when somebody orders or opens an account — name, email, address. Say who handles card payments.]</p>"
      + "<h3>How we use it</h3><p>[To make and deliver orders, to send updates, and anything else you do with it.]</p>"
      + "<h3>Who we share it with</h3><p>[The services that help you run the shop — payment, delivery, email.]</p>"
      + "<h3>Your choices</h3><p>[How a customer can see, correct or delete their details, and who to contact.]</p>",
  },
  {
    key: "terms", label: "Terms & conditions", slug: "terms-and-conditions",
    blurb: "The rules of ordering from your shop.",
    outline:
      "<h3>Orders</h3><p>[When an order is accepted, and when you may cancel or change one.]</p>"
      + "<h3>Artwork you send us</h3><p>[That the customer must have the right to print what they upload, and what you will not print.]</p>"
      + "<h3>Prices and payment</h3><p>[The currency, taxes, and when payment is taken.]</p>"
      + "<h3>Changes to these terms</h3><p>[That these terms may change, and how customers will know.]</p>",
  },
  {
    key: "contact", label: "Contact information", slug: "contact-information",
    blurb: "Who you are and how to reach you.",
    outline:
      "<p><strong>[Your business name]</strong></p>"
      + "<p>[Street address]<br>[City, state, postcode]</p>"
      + "<p>Email: [you@example.com]<br>Phone: [your number]</p>"
      + "<p>[Your opening hours]</p>",
  },
];

/** True when there is nothing a reader would see: no words, only tags and spaces. */
export function isBlank(html: string | null | undefined): boolean {
  return !(html ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;|\s/g, "");
}

/** The block of formatted text a policy is written in, when its page has one. */
function textBlock(tree: BuilderNode | null | undefined): BuilderNode | null {
  let found: BuilderNode | null = null;
  walk(tree, (n) => { if (!found && n.type === "rich_text") found = n; });
  return found;
}

/**
 * A policy's text, or null when it has not been written.
 *
 * "Written" is the page existing with something on it — a page that was made
 * and then emptied reads as not written, because that is what a visitor sees.
 */
export function policyHtml(doc: SiteDoc, policy: Policy): string | null {
  const page = doc.pages?.[policy.slug];
  if (!page) return null;
  const html = String(textBlock(page.tree)?.props?.html ?? "");
  return isBlank(html) ? null : html;
}

/**
 * Write a policy. Makes its page the first time; after that only the text
 * changes, so anything else added to the page in the builder is left alone.
 */
export function savePolicy(doc: SiteDoc, policy: Policy, html: string): SiteDoc {
  const page = doc.pages?.[policy.slug];
  // A comfortable line length: a policy is read, not glanced at.
  const block = (): BuilderNode => ({ id: newId(), type: "rich_text", props: { html }, style: { maxWidth: "760px" } });

  if (!page) {
    const tree: BuilderNode = { id: newId(), type: "stack", children: [block()] };
    return {
      ...doc,
      pages: {
        ...doc.pages,
        [policy.slug]: {
          title: policy.label,
          template: doc.assignments?.page?.default || "default",
          seo: { title: "", description: "", image: "" },
          tree,
        },
      },
    };
  }

  const existing = textBlock(page.tree);
  const tree: BuilderNode = existing && page.tree
    ? updateNode(page.tree, existing.id, (n) => ({ ...n, props: { ...(n.props ?? {}), html } }))
    : page.tree && Array.isArray(page.tree.children)
      ? { ...page.tree, children: [...page.tree.children, block()] }
      : { id: newId(), type: "stack", children: [block()] };
  return { ...doc, pages: { ...doc.pages, [policy.slug]: { ...page, tree } } };
}

/** Take a policy off the shop: its page goes. */
export function removePolicy(doc: SiteDoc, policy: Policy): SiteDoc {
  if (!doc.pages?.[policy.slug]) return doc;
  const pages = { ...doc.pages };
  delete pages[policy.slug];
  return { ...doc, pages };
}
