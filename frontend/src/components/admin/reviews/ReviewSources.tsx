"use client";

/**
 * Marketing → Reviews, above the list: where the shop's reviews come from, and
 * who may write one.
 *
 *   Review rules  who may write a review, and whether a new one waits for approval.
 *   Google        find the business on Google: its rating and Google's picked reviews.
 *   Judge.me      the review app most Shopify shops used: every review imported.
 *   Yelp          the Yelp page, and single reviews Yelp's own embed draws.
 *
 * Server: backend/app/api/v1/admin/review_sources.py.
 */
import { useCallback, useEffect, useState } from "react";
import { ask } from "@/lib/dialog";
import { Badge, Btn, CARD, INPUT, LABEL, MUTED, Toggle, errText, fmtDate } from "@/components/admin/suppliers/ui";
import {
  reviewSourcesService as api, type GooglePlaceFound, type ReviewSources as Sources,
} from "@/services/reviewSources.service";

type Note = { ok: boolean; text: string } | null;

const ROW: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" };
const TITLE: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: "var(--pc-ink, #0F1B2D)", margin: 0 };
const ACTIONS: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };

function NoteLine({ note }: { note: Note }) {
  if (!note) return null;
  return (
    <p role="status" style={{ ...MUTED, marginTop: 10, fontWeight: 600, color: note.ok ? "#067647" : "#B42318" }}>{note.text}</p>
  );
}

function plural(n: number | undefined, one: string, many: string) {
  const v = n ?? 0;
  return `${v.toLocaleString("en-US")} ${v === 1 ? one : many}`;
}

export function ReviewSources({ onChanged }: { onChanged?: () => void }) {
  const [data, setData] = useState<Sources | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api.overview());
      setFailed("");
    } catch (e) {
      setFailed(errText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const update = useCallback((next: Sources, listChanged = false) => {
    setData((prev) => ({ ...(prev ?? next), ...next }));
    if (listChanged) onChanged?.();
  }, [onChanged]);

  if (failed) return <div style={{ ...CARD, marginBottom: 16 }}><p style={MUTED}>Review sources could not load: {failed}</p></div>;
  if (!data) return null;

  const shown = (k: string) => data.counts?.[k]?.shown ?? 0;
  return (
    <section aria-label="Where your reviews come from" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
      <p style={MUTED} data-review-counts>
        In your shop now: {plural(shown("site"), "review", "reviews")} written on your shop
        {shown("judgeme") > 0 && <>, {plural(shown("judgeme"), "from Judge.me", "from Judge.me")}</>}
        {shown("google") > 0 && <>, {plural(shown("google"), "from Google", "from Google")}</>}.
      </p>
      <RulesCard data={data} onSaved={update} />
      <GoogleCard data={data} onSaved={update} />
      <JudgeMeCard data={data} onSaved={update} />
      <YelpCard data={data} onSaved={update} />
    </section>
  );
}

// ── Review rules ─────────────────────────────────────────────────────────────

function RulesCard({ data, onSaved }: { data: Sources; onSaved: (d: Sources) => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const rules = data.rules;

  async function save(next: typeof rules) {
    setBusy(true);
    setNote(null);
    try {
      const saved = await api.saveRules(next);
      onSaved({ ...data, rules: saved });
      setNote({ ok: true, text: "Saved." });
    } catch (e) {
      setNote({ ok: false, text: errText(e) });
    }
    setBusy(false);
  }

  return (
    <div style={CARD} data-card="rules">
      <p style={TITLE}>Who can write a review</p>
      <p style={{ ...MUTED, marginTop: 4 }}>“Verified buyer” shows only on reviews from customers who bought the product.</p>
      <div role="radiogroup" aria-label="Who can write a review" style={{ display: "grid", gap: 6, marginTop: 10 }}>
        {([["signed_in", "Any signed-in customer"], ["buyers", "Only customers who bought the product"]] as const).map(([value, label]) => (
          <label key={value} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: busy ? "wait" : "pointer" }}>
            <input type="radio" name="review-who" value={value} checked={rules.who === value} disabled={busy}
              onChange={() => save({ ...rules, who: value })} />
            {label}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <Toggle on={rules.hold} busy={busy} title="Check new reviews first" onChange={() => save({ ...rules, hold: !rules.hold })} />
        <span style={{ fontSize: 13 }}>Check new reviews before they show. They wait under Pending until you approve them.</span>
      </div>
      <NoteLine note={note} />
    </div>
  );
}

// ── Google ───────────────────────────────────────────────────────────────────

function GoogleCard({ data, onSaved }: { data: Sources; onSaved: (d: Sources) => void }) {
  const g = data.google_place;
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<GooglePlaceFound[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [changing, setChanging] = useState(false);
  const place = g.place;

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy("search");
    setNote(null);
    try {
      const r = await api.searchGoogle(query);
      setFound(r.places);
      if (!r.places.length) setNote({ ok: false, text: "Google found no business by that name. Add your city." });
    } catch (err) {
      setNote({ ok: false, text: errText(err) });
    }
    setBusy(null);
  }

  async function choose(p: GooglePlaceFound) {
    setBusy(p.place_id);
    setNote(null);
    try {
      onSaved(await api.chooseGoogle(p.place_id));
      setFound(null);
      setChanging(false);
      setNote({ ok: true, text: "Your Google rating and reviews can now show on your site. Add a “Reviews from…” block set to Google in Site builder." });
    } catch (err) {
      setNote({ ok: false, text: errText(err) });
    }
    setBusy(null);
  }

  async function remove() {
    if (!await ask("Stop showing your Google rating and reviews?")) return;
    setBusy("remove");
    try {
      onSaved(await api.removeGoogle());
      setNote({ ok: true, text: "Google business removed." });
    } catch (err) {
      setNote({ ok: false, text: errText(err) });
    }
    setBusy(null);
  }

  return (
    <div style={CARD} data-card="google">
      <div style={ROW}>
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <p style={TITLE}>Google</p>
          {g.place_id && place ? (
            <p style={{ ...MUTED, marginTop: 4 }}>
              {place.name}{place.address ? `, ${place.address}` : ""}
              {place.rating != null && <> · <span style={{ color: "#F5A524" }}>★</span> {Number(place.rating).toFixed(1)}</>}
              {place.total != null && <> · {plural(place.total, "review", "reviews")} on Google</>}
              {place.maps_url && <> · <a href={place.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>See it on Google Maps</a></>}
            </p>
          ) : (
            <p style={{ ...MUTED, marginTop: 4 }}>
              Show your Google rating and the reviews Google picks (up to 5), straight from Google. Find your business to start.
            </p>
          )}
          {g.place_id && g.error && <p style={{ ...MUTED, marginTop: 6, color: "#B54708" }}>{g.error}</p>}
        </div>
        {g.place_id && (
          <div style={ACTIONS}>
            <Btn kind="ghost" onClick={() => { setChanging((c) => !c); setFound(null); }}>{changing ? "Cancel" : "Change"}</Btn>
            <Btn kind="danger" busy={busy === "remove"} disabled={busy !== null} onClick={remove}>Remove</Btn>
          </div>
        )}
      </div>

      {!g.configured && !g.place_id && (
        <p style={{ ...MUTED, marginTop: 10, color: "#B54708" }}>Google business search is not switched on for this platform yet.</p>
      )}

      {g.configured && (!g.place_id || changing) && (
        <form onSubmit={search} style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input aria-label="Your business name on Google" placeholder="Your business name and city" value={query}
            onChange={(e) => setQuery(e.target.value)} style={{ ...INPUT, flex: "1 1 260px" }} maxLength={200} />
          <Btn type="submit" busy={busy === "search"} disabled={busy !== null || query.trim().length < 3}>Find on Google</Btn>
        </form>
      )}

      {found && found.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {found.map((p) => (
            <div key={p.place_id} style={{ ...ROW, alignItems: "center", border: "1px solid var(--pc-line, #E3E8EF)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                <div style={{ ...MUTED, fontSize: 12 }}>
                  {p.address}{p.rating != null && <> · ★ {Number(p.rating).toFixed(1)} ({plural(p.total ?? 0, "review", "reviews")})</>}
                </div>
              </div>
              <Btn busy={busy === p.place_id} disabled={busy !== null} onClick={() => choose(p)}>This is my business</Btn>
            </div>
          ))}
        </div>
      )}
      <NoteLine note={note} />
    </div>
  );
}

// ── Judge.me ─────────────────────────────────────────────────────────────────

function JudgeMeCard({ data, onSaved }: { data: Sources; onSaved: (d: Sources, listChanged?: boolean) => void }) {
  const j = data.judgeme;
  const [domain, setDomain] = useState(j.shop_domain ?? "");
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy("connect");
    setNote(null);
    try {
      const r = await api.connectJudgeMe(domain, token);
      onSaved(r, true);
      setToken("");
      setEditing(false);
      setNote(r.synced && r.result
        ? { ok: true, text: `Connected. ${plural(r.result.imported, "review", "reviews")} imported from Judge.me.` }
        : { ok: false, text: `Connected, but the import did not finish: ${r.message ?? "try Sync now"}` });
    } catch (err) {
      setNote({ ok: false, text: errText(err) });
    }
    setBusy(null);
  }

  async function sync() {
    setBusy("sync");
    setNote(null);
    try {
      const r = await api.syncJudgeMe();
      onSaved(r, true);
      setNote({ ok: true, text: `Up to date: ${r.result.added} new, ${r.result.updated} changed, ${r.result.removed} removed.` });
    } catch (err) {
      setNote({ ok: false, text: errText(err) });
    }
    setBusy(null);
  }

  async function disconnect() {
    const n = data.counts?.judgeme ? data.counts.judgeme.shown + data.counts.judgeme.hidden : 0;
    if (!await ask(`Disconnect Judge.me? The ${plural(n, "review", "reviews")} imported from it are removed from your shop.`)) return;
    setBusy("disconnect");
    try {
      onSaved(await api.disconnectJudgeMe(false), true);
      setDomain("");
      setNote({ ok: true, text: "Judge.me disconnected." });
    } catch (err) {
      setNote({ ok: false, text: errText(err) });
    }
    setBusy(null);
  }

  const showForm = !j.connected || editing;
  return (
    <div style={CARD} data-card="judgeme">
      <div style={ROW}>
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <p style={TITLE}>Judge.me {j.connected && <Badge text="Connected" color="#067647" />}</p>
          {j.connected ? (
            <p style={{ ...MUTED, marginTop: 4 }}>
              {j.shop_name || j.shop_domain} ({j.shop_domain}) · token {j.token_hint}
              {" · "}{plural(j.imported, "review", "reviews")} imported{j.store_reviews ? `, ${j.store_reviews} about the store` : ""}
              {j.last_synced_at && <> · synced {fmtDate(j.last_synced_at)}</>}. New reviews come in every 6 hours.
            </p>
          ) : (
            <p style={{ ...MUTED, marginTop: 4 }}>
              Bring every review from Judge.me, the review app on Shopify, with its “Verified buyer” marks and photos.
              Product reviews go on the product with the same URL handle.
            </p>
          )}
        </div>
        {j.connected && !editing && (
          <div style={ACTIONS}>
            <Btn kind="ghost" busy={busy === "sync"} disabled={busy !== null} onClick={sync}>Sync now</Btn>
            <Btn kind="ghost" disabled={busy !== null} onClick={() => setEditing(true)}>Change</Btn>
            <Btn kind="danger" busy={busy === "disconnect"} disabled={busy !== null} onClick={disconnect}>Disconnect</Btn>
          </div>
        )}
      </div>

      {j.connected && (j.unmatched ?? 0) > 0 && (
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "#FFFAEB", fontSize: 13, color: "#93370D" }}>
          {plural(j.unmatched, "review is", "reviews are")} for products this shop does not have, so they were left out:{" "}
          {(j.unmatched_handles ?? []).join(", ")}. Give the product the same URL handle as on Shopify, then Sync now.
        </div>
      )}
      {j.connected && j.last_error && !note && <p style={{ ...MUTED, marginTop: 10, color: "#B54708" }}>{j.last_error}</p>}

      {showForm && (
        <form onSubmit={connect} style={{ display: "grid", gap: 10, marginTop: 12, maxWidth: 560 }}>
          <div>
            <label style={LABEL} htmlFor="jm-domain">Shop domain</label>
            <input id="jm-domain" style={{ ...INPUT, width: "100%" }} placeholder="your-shop.myshopify.com" value={domain}
              onChange={(e) => setDomain(e.target.value)} autoComplete="off" maxLength={300} />
          </div>
          <div>
            <label style={LABEL} htmlFor="jm-token">Private API token</label>
            <input id="jm-token" type="password" style={{ ...INPUT, width: "100%" }} value={token}
              placeholder={j.connected ? `Saved (${j.token_hint}). Leave empty to keep it.` : "From Judge.me: Settings → Integrations → View API tokens"}
              onChange={(e) => setToken(e.target.value)} autoComplete="new-password" maxLength={300} />
            <p style={{ ...MUTED, fontSize: 12, marginTop: 4 }}>
              In Judge.me: Settings → Integrations → View API tokens. Use the private token. It stays on our server.
            </p>
          </div>
          <div style={ACTIONS}>
            <Btn type="submit" busy={busy === "connect"} disabled={busy !== null || !domain.trim() || (!j.connected && !token.trim())}>
              {j.connected ? "Save and import" : "Connect and import"}
            </Btn>
            {editing && <Btn kind="ghost" disabled={busy !== null} onClick={() => setEditing(false)}>Cancel</Btn>}
          </div>
        </form>
      )}
      <NoteLine note={note} />
    </div>
  );
}

// ── Yelp ─────────────────────────────────────────────────────────────────────

function YelpCard({ data, onSaved }: { data: Sources; onSaved: (d: Sources) => void }) {
  const y = data.yelp;
  const saved = y.reviews ?? [];
  const [url, setUrl] = useState(y.url ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);

  async function save(keep: string[], add: string[], done: string) {
    setNote(null);
    try {
      const next = await api.saveYelp(url, keep, add);
      onSaved(next);
      setUrl(next.yelp.url ?? "");
      setCode("");
      setNote({ ok: true, text: done });
    } catch (err) {
      setNote({ ok: false, text: errText(err) });
    }
    setBusy(null);
  }

  return (
    <div style={CARD} data-card="yelp">
      <p style={TITLE}>Yelp</p>
      <p style={{ ...MUTED, marginTop: 4 }}>
        Link your Yelp page, and show your Yelp reviews the way Yelp draws them. On yelp.com, open a review’s
        three dots, choose Embed review, copy the code and paste it here. Only your own business’s reviews can be added.
      </p>
      <div style={{ display: "grid", gap: 10, marginTop: 12, maxWidth: 640 }}>
        <div>
          <label style={LABEL} htmlFor="yelp-url">Your Yelp page</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input id="yelp-url" style={{ ...INPUT, flex: "1 1 280px" }} placeholder="https://www.yelp.com/biz/your-business-city"
              value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} />
            <Btn kind="ghost" busy={busy === "url"} disabled={busy !== null}
              onClick={() => { setBusy("url"); save(saved.map((r) => r.id), [], "Saved."); }}>Save link</Btn>
          </div>
        </div>

        {saved.length > 0 && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {saved.map((r) => (
              <li key={r.id} style={{ ...ROW, alignItems: "center", border: "1px solid var(--pc-line, #E3E8EF)", borderRadius: 8, padding: "8px 12px" }}>
                <a href={r.review_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "inherit" }}>
                  {r.author ? `${r.author}’s review` : "A Yelp review"}{r.business ? ` of ${r.business}` : ""}
                </a>
                <Btn kind="danger" busy={busy === r.id} disabled={busy !== null}
                  onClick={() => { setBusy(r.id); save(saved.filter((s) => s.id !== r.id).map((s) => s.id), [], "Review removed."); }}>
                  Remove
                </Btn>
              </li>
            ))}
          </ul>
        )}

        <div>
          <label style={LABEL} htmlFor="yelp-code">Add a Yelp review</label>
          <textarea id="yelp-code" rows={3} style={{ ...INPUT, height: "auto", padding: 10, width: "100%" }}
            placeholder={'<span class="yelp-review" data-review-id="…">… or the review’s link'}
            value={code} onChange={(e) => setCode(e.target.value)} maxLength={5000} />
          <div style={{ ...ACTIONS, marginTop: 6 }}>
            <Btn busy={busy === "add"} disabled={busy !== null || !code.trim()}
              onClick={() => { setBusy("add"); save(saved.map((r) => r.id), [code], "Review added. Add a “Reviews from…” block set to Yelp in Site builder to show it."); }}>
              Add review
            </Btn>
            {(y.url || saved.length > 0) && (
              <Btn kind="ghost" busy={busy === "clear"} disabled={busy !== null} onClick={async () => {
                if (!await ask("Remove your Yelp page and every Yelp review from your shop?")) return;
                setBusy("clear");
                try { onSaved(await api.removeYelp()); setUrl(""); setNote({ ok: true, text: "Yelp removed." }); }
                catch (err) { setNote({ ok: false, text: errText(err) }); }
                setBusy(null);
              }}>Remove Yelp</Btn>
            )}
          </div>
        </div>
      </div>
      <NoteLine note={note} />
    </div>
  );
}
