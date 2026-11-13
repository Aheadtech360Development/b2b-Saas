"use client";

/**
 * Yelp reviews the shop picked, drawn by Yelp's own embed script.
 *
 * The markup is Yelp's snippet rebuilt from checked values (the review id and
 * Yelp links, every word escaped), never the HTML the shop pasted. Until Yelp's
 * script runs, or if it is blocked, each shows as Yelp's own fallback: a link
 * to the review. In the editor the script is not loaded; the links show.
 *
 * Yelp's script swaps the snippets for its own frames, so React hands the
 * snippets over as one block of markup and does not touch them afterwards.
 */
import { useEffect } from "react";
import type { YelpInfo } from "@/lib/builder/types";

export const YELP_SCRIPT = "https://www.yelp.com/embed/widgets.js";

const ID = /^[A-Za-z0-9_-]{10,40}$/;
const YELP_LINK = /^https:\/\/www\.yelp\.com\/[^\s"'<>]*$/;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Yelp's embed snippet for one review, from checked values only. */
export function yelpSnippet(r: YelpInfo["reviews"][number]): string {
  if (!ID.test(r.id) || !YELP_LINK.test(r.review_url)) return "";
  const who = r.author && r.author_url && YELP_LINK.test(r.author_url)
    ? `Read <a href="${esc(r.author_url)}" rel="nofollow noopener">${esc(r.author)}</a>’s `
    : "Read this ";
  const of = r.business ? ` of ${esc(r.business)}` : "";
  return `<span class="yelp-review" data-review-id="${esc(r.id)}" data-hostname="www.yelp.com">${who}`
    + `<a href="${esc(r.review_url)}" rel="nofollow noopener">review</a>${of} on `
    + `<a href="https://www.yelp.com" rel="nofollow noopener">Yelp</a></span>`;
}

export default function YelpEmbeds({ reviews, edit }: { reviews: YelpInfo["reviews"]; edit?: boolean }) {
  const markup = reviews.map(yelpSnippet).filter(Boolean).join("");

  useEffect(() => {
    if (edit || !markup) return;
    // Yelp's script finds the snippets when it runs, so it is added once they
    // are on the page, and again on each visit to a page with them.
    const script = document.createElement("script");
    script.src = YELP_SCRIPT;
    script.async = true;
    document.body.appendChild(script);
    return () => { script.remove(); };
  }, [edit, markup]);

  if (!markup) return null;
  return (
    <>
      <div className="b-srev-yelp" dangerouslySetInnerHTML={{ __html: markup }} />
      {edit && <div className="b-note">Yelp draws these reviews on your live site.</div>}
    </>
  );
}
