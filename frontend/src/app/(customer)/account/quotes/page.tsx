"use client";

/**
 * Quotes: asking the shop for a price on a big or custom job, and accepting
 * the price it sends. A request goes to the shop's Inbox (and its Quotes
 * board) the same way the shop's own "Get a quote" form does; the shop prices
 * it as a quote, and an accepted quote becomes an order once the shop
 * confirms it.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { ask } from "@/lib/dialog";
import { useAuthStore } from "@/stores/auth.store";
import { gangSheetsService } from "@/services/gangSheets.service";
import { day, money } from "@/lib/customerWords";
import { Banner, Chip, Empty, Loading, PageHead, Tabs, type Tone } from "@/components/portal/ui";
import type { QuoteRow } from "@/components/portal/data";

type Tab = "open" | "accepted" | "expired";

const TONE: Record<QuoteRow["status"], Tone> = {
  needs_pricing: "mute", draft: "mute", sent: "info", expired: "bad", accepted: "ok", ordered: "ok",
};
const WORDS: Partial<Record<QuoteRow["status"], string>> = {
  sent: "Ready to accept", accepted: "Accepted", ordered: "Ordered", expired: "Expired", needs_pricing: "Waiting for a price",
};
const tabOf = (q: QuoteRow): Tab => (q.status === "expired" ? "expired" : q.status === "accepted" || q.status === "ordered" ? "accepted" : "open");

function RequestForm({ onSent, onCancel }: { onSent: () => void; onCancel: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [what, setWhat] = useState("");
  const [qty, setQty] = useState("");
  const [by, setBy] = useState("");
  const [details, setDetails] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!what.trim()) return setError("Say what you need a price for.");
    setSending(true);
    setError(null);
    try {
      let artwork: string | undefined;
      if (file) artwork = (await gangSheetsService.uploadArtwork(file)).url;
      await apiClient.post("/api/v1/storefront/contact", {
        page_slug: "account",
        form_name: "Quote request",
        data: {
          Name: [user?.first_name, user?.last_name].filter(Boolean).join(" ") || undefined,
          Email: user?.email,
          "What do you need": what.trim(),
          Quantity: qty.trim() || undefined,
          "Needed by": by || undefined,
          Details: details.trim() || what.trim(),
          ...(artwork ? { Artwork: artwork } : {}),
        },
      });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your request could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="cp-card cp-pad cp-stack-sm" style={{ gap: 14 }}>
      <h2 className="cp-h2">Request a quote</h2>
      {error && <Banner tone="bad">{error}</Banner>}
      <div className="cp-field">
        <label className="cp-label" htmlFor="q-what">What do you need?</label>
        <input id="q-what" ref={first} className="cp-input" maxLength={300} placeholder="For example 500 black tees with a two-colour front print"
          value={what} onChange={(e) => setWhat(e.target.value)} required />
      </div>
      <div className="cp-grid2">
        <div className="cp-field">
          <label className="cp-label" htmlFor="q-qty">Quantity</label>
          <input id="q-qty" className="cp-input" inputMode="numeric" maxLength={40} value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div className="cp-field">
          <label className="cp-label" htmlFor="q-by">Needed by</label>
          <input id="q-by" className="cp-input" type="date" value={by} onChange={(e) => setBy(e.target.value)} />
        </div>
      </div>
      <div className="cp-field">
        <label className="cp-label" htmlFor="q-details">Details</label>
        <textarea id="q-details" className="cp-textarea" rows={5} maxLength={4000} value={details} onChange={(e) => setDetails(e.target.value)}
          placeholder="Sizes, colours, print positions, anything the shop should know." />
      </div>
      <div className="cp-field">
        <label className="cp-label" htmlFor="q-file">Attach artwork</label>
        <input id="q-file" type="file" accept="image/*,.pdf,.ai,.eps,.svg,.psd" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <span className="cp-hint">Optional. Up to 50 MB.</span>
      </div>
      <div className="cp-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="cp-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="cp-btn cp-btn-p" disabled={sending}>{sending ? "Sending…" : "Send request"}</button>
      </div>
    </form>
  );
}

function Quotes() {
  const params = useSearchParams();
  const [rows, setRows] = useState<QuoteRow[] | null>(null);
  const [tab, setTab] = useState<Tab>("open");
  const [asking, setAsking] = useState(params.get("new") === "1");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(() => {
    apiClient.get<{ items: QuoteRow[] }>(`/api/v1/quotes?utc_offset=${-new Date().getTimezoneOffset()}`)
      .then((d) => setRows(d.items))
      .catch(() => { setRows([]); setMessage({ tone: "bad", text: "Your quotes could not be loaded." }); });
  }, []);
  useEffect(load, [load]);

  async function accept(q: QuoteRow) {
    if (!await ask(`Accept quote ${q.number} for ${money(q.total ?? 0)}? The shop then turns it into an order.`, { ok: "Accept quote" })) return;
    setBusy(q.number);
    try {
      await apiClient.post(`/api/v1/quotes/${encodeURIComponent(q.number)}/accept?utc_offset=${-new Date().getTimezoneOffset()}`, {});
      setMessage({ tone: "ok", text: `Quote ${q.number} accepted. The shop will confirm your order.` });
      load();
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : "The quote could not be accepted." });
    } finally {
      setBusy(null);
    }
  }

  const list = rows ?? [];
  const counts = { open: 0, accepted: 0, expired: 0 } as Record<Tab, number>;
  for (const q of list) counts[tabOf(q)] += 1;
  const shown = list.filter((q) => tabOf(q) === tab);

  return (
    <>
      <PageHead eyebrow="Quotes" title="Quotes" sub="Ask for a price on a big or custom job, then accept it here."
        actions={!asking ? <button type="button" className="cp-btn cp-btn-p" onClick={() => { setMessage(null); setAsking(true); }}>+ Request a quote</button> : undefined} />
      <div className="cp-stack">
        {message && <Banner tone={message.tone}>{message.text}</Banner>}
        {asking && (
          <RequestForm onCancel={() => setAsking(false)}
            onSent={() => { setAsking(false); setTab("open"); setMessage({ tone: "ok", text: "Request sent. The shop will price it and email you, and it shows here." }); load(); }} />
        )}
        <div>
          <Tabs label="Quotes" tabs={(["open", "accepted", "expired"] as Tab[]).map((t) => ({
            key: t, label: t === "open" ? "Open" : t === "accepted" ? "Accepted" : "Expired", count: counts[t], on: tab === t, onClick: () => setTab(t),
          }))} />
          <div className="cp-card" style={{ overflow: "hidden" }}>
            {rows === null ? <Loading what="Loading quotes" /> : shown.length === 0 ? (
              <Empty title={tab === "open" ? "No open quotes" : tab === "accepted" ? "Nothing accepted yet" : "No expired quotes"}>
                {tab === "open" ? "Request a quote and the shop's price shows here." : null}
              </Empty>
            ) : (
              <div className="cp-tbl-wrap">
                <table className="cp-tbl">
                  <thead><tr><th>Quote</th><th>Requested</th><th>Valid until</th><th className="cp-num">Total</th><th>Status</th><th><span className="cp-sr">Actions</span></th></tr></thead>
                  <tbody>
                    {shown.map((q) => (
                      <tr key={`${q.kind}-${q.number}`}>
                        <td>
                          <span className="cp-strong">{q.number}</span>
                          {q.kind === "request" && q.asked && <div className="cp-note" style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.asked}</div>}
                        </td>
                        <td>{day(q.requested_at)}</td>
                        <td>{q.valid_until ? day(q.valid_until) : "—"}</td>
                        <td className="cp-num">{q.total != null ? money(q.total) : "—"}</td>
                        <td><Chip tone={TONE[q.status]}>{WORDS[q.status] ?? q.status_words}</Chip></td>
                        <td className="cp-end">
                          <span className="cp-actions" style={{ justifyContent: "flex-end" }}>
                            {q.kind === "quote" && <a href={`/quote/${encodeURIComponent(q.number)}`} className="cp-btn cp-btn-sm">View</a>}
                            {q.status === "sent" && (
                              <button type="button" className="cp-btn cp-btn-sm cp-btn-p" disabled={busy === q.number} onClick={() => accept(q)}>
                                {busy === q.number ? "Accepting…" : "Accept"}
                              </button>
                            )}
                            {q.order_id && <Link href={`/account/orders/${q.order_id}`} className="cp-btn cp-btn-sm">View order</Link>}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <p className="cp-note">An accepted quote becomes an order once the shop confirms it. An expired one can be asked for again.</p>
      </div>
    </>
  );
}

export default function QuotesPage() {
  return <Suspense fallback={<Loading />}><Quotes /></Suspense>;
}
