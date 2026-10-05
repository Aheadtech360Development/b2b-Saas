"use client";

/**
 * A product's reviews, where a product template puts them.
 *
 * The list arrives with the page (the server read the newest few for this
 * request), so it is in the HTML and costs no extra call. Only writing one
 * needs the browser: a signed-in customer posts to the same reviews endpoint
 * the rest of the storefront uses, and their review joins the list at once.
 */
import { useEffect, useState } from "react";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { safeSrc } from "@/lib/builder/sanitize";
import type { ReviewItem } from "@/lib/builder/types";
import { useAuthStore } from "@/stores/auth.store";

export function Stars({ value, size }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="b-stars" style={size ? { fontSize: size } : undefined} role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      ★★★★★<span aria-hidden style={{ width: `${pct}%` }}>★★★★★</span>
    </span>
  );
}

export default function Reviews({ id, productId, heading, items, total, avg, allowWrite, edit, loading }: {
  id: string; productId: string; heading: string; items: ReviewItem[]; total: number; avg: number;
  allowWrite: boolean; edit?: boolean;
  /** The editor, before the product's reviews have been read. */
  loading?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  // Who is signed in is known only in the browser; until this has mounted the
  // markup matches what the server sent, which knows nobody.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // Only what this visitor has just written is kept here; the rest is whatever
  // the page was handed, so the list follows the data when that changes.
  const [added, setAdded] = useState<ReviewItem[]>([]);
  const list = [...added, ...items];
  const count = total + added.length;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ rating: 5, title: "", body: "", name: "" });
  const [state, setState] = useState<{ busy: boolean; error: string; done: boolean }>({ busy: false, error: "", done: false });
  const signedIn = mounted && !!user && !user.is_admin;
  const signedOut = mounted && !authLoading && !user;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (edit) return;
    const name = form.name.trim() || [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
    if (form.body.trim().length < 10) { setState({ busy: false, error: "Write at least a sentence (10 characters or more).", done: false }); return; }
    if (!name) { setState({ busy: false, error: "Add the name to show with your review.", done: false }); return; }
    setState({ busy: true, error: "", done: false });
    try {
      await apiClient.post(`/api/v1/products/${productId}/reviews`, {
        rating: form.rating, title: form.title.trim() || null, body: form.body.trim(), reviewer_name: name,
      });
      setAdded((l) => [{ rating: form.rating, title: form.title.trim(), body: form.body.trim(), name, company: "", verified: true,
                         image: "", reply: "", date: new Date().toISOString().slice(0, 10) }, ...l]);
      setForm({ rating: 5, title: "", body: "", name: "" });
      setOpen(false);
      setState({ busy: false, error: "", done: true });
    } catch (err) {
      setState({ busy: false, error: err instanceof ApiClientError ? err.message : "That did not send. Try again.", done: false });
    }
  }

  // The average the server worked out covers every review; one just written
  // is folded in so the number moves when the list does.
  const sum = avg * total + added.reduce((s, r) => s + r.rating, 0);
  const average = count ? sum / count : 0;

  return (
    <div data-b={id} id="reviews" className="b-reviews">
      <div className="b-rev-head">
        {heading && <h2 className="b-heading">{heading}</h2>}
        {count > 0 ? (
          <div className="b-rev-sum"><Stars value={average} /> <b>{average.toFixed(1)}</b> <span className="b-rcount">· {count} {count === 1 ? "review" : "reviews"}</span></div>
        ) : (
          <div className="b-rev-sum"><span className="b-rcount">{loading ? "Loading this product’s reviews…" : "No reviews yet."}</span></div>
        )}
        {allowWrite && !open && (edit || signedIn) && (
          <button type="button" className="b-btn b-btn-outline" onClick={() => { if (!edit) setOpen(true); }}>Write a review</button>
        )}
        {allowWrite && !edit && signedOut && (
          <a className="b-rev-signin" href="/login">Sign in to write a review</a>
        )}
      </div>

      {state.done && <p className="b-rev-done" role="status">Thanks — your review is posted.</p>}

      {open && (
        <form className="b-rev-form" onSubmit={submit}>
          <div className="b-rev-rate" role="radiogroup" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={form.rating === n} aria-label={`${n} star${n === 1 ? "" : "s"}`}
                      className={n <= form.rating ? "on" : ""} onClick={() => setForm((f) => ({ ...f, rating: n }))}>★</button>
            ))}
          </div>
          <input className="b-input" placeholder="Title (optional)" maxLength={255} value={form.title}
                 onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} aria-label="Title" />
          <textarea className="b-input" rows={4} placeholder="What did you think?" maxLength={2000} value={form.body} required
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} aria-label="Your review" />
          <input className="b-input" placeholder={[user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Your name"} maxLength={150}
                 value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} aria-label="Name shown with the review" />
          {state.error && <p className="b-rev-err" role="alert">{state.error}</p>}
          <div className="b-rev-actions">
            <button type="submit" className="b-btn b-btn-solid" disabled={state.busy}>{state.busy ? "Posting…" : "Post review"}</button>
            <button type="button" className="b-btn b-btn-outline" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}

      {list.length > 0 && (
        <ul className="b-rev-list">
          {list.map((r, i) => (
            <li key={i} className="b-rev">
              <div className="b-rev-top">
                <Stars value={r.rating} />
                {r.title && <b className="b-rev-title">{r.title}</b>}
              </div>
              <p className="b-rev-body">{r.body}</p>
              {safeSrc(r.image) && <img className="b-rev-img" src={r.image} alt="" loading="lazy" />}
              <div className="b-rev-by">
                {r.name}{r.company ? `, ${r.company}` : ""}{r.verified ? " · Verified buyer" : ""}{r.date ? ` · ${r.date}` : ""}
              </div>
              {r.reply && <div className="b-rev-reply"><b>Reply from the shop</b><p>{r.reply}</p></div>}
            </li>
          ))}
        </ul>
      )}
      {edit && !loading && list.length === 0 && (
        <div className="b-note">Reviews customers write for this product show here, newest first.</div>
      )}
    </div>
  );
}
