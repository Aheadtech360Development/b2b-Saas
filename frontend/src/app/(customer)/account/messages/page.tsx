"use client";

/**
 * Messages: talking to the shop, in one place. A message about an order goes
 * on that order (its comments), where the shop reads it beside the order, and
 * the conversation is listed here. Anything else (a print job, a general
 * question, a reprint) reaches the shop's Inbox, and the shop answers by email.
 * The Help button in the top bar opens this page.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { useBranding } from "@/components/providers/BrandingProvider";
import { accountService } from "@/services/account.service";
import { gangSheetsService } from "@/services/gangSheets.service";
import { apiClient } from "@/lib/api-client";
import { day } from "@/lib/customerWords";
import { Banner, Empty, Loading, PageHead } from "@/components/portal/ui";
import type { Job, OrderPage, OrderRow } from "@/components/portal/data";

interface Convo {
  order_id: string;
  order_number: string;
  last_at: string | null;
  count: number;
  last_body: string;
  last_from_shop: boolean;
}

interface Comment {
  id: string;
  body: string;
  is_admin: boolean;
  author_name: string | null;
  created_at: string;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Thread({ convo, shop, onSent }: { convo: { order_id: string; order_number: string }; shop: string; onSent: () => void }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setComments(null);
    (accountService.getOrderComments(convo.order_id) as Promise<Comment[]>)
      .then(setComments)
      .catch(() => setComments([]));
  }, [convo.order_id]);

  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [comments]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const c = await accountService.addOrderComment(convo.order_id, body.trim()) as Comment;
      setComments((prev) => [...(prev ?? []), c]);
      setBody("");
      onSent();
    } catch {
      setError("Your message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="cp-card cp-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="cp-card-head" style={{ marginBottom: 0 }}>
        <h2 className="cp-h3">Order {convo.order_number}</h2>
        <a href={`/account/orders/${convo.order_id}`} className="cp-link">Open order</a>
      </div>
      {comments === null ? <Loading /> : comments.length === 0 ? (
        <p className="cp-note" style={{ margin: 0 }}>No messages on this order yet. Write the first one below.</p>
      ) : (
        <div className="cp-thread">
          {comments.map((c) => (
            <div key={c.id} className="cp-bubble" data-from={c.is_admin ? "shop" : "me"}>
              <small>{c.is_admin ? shop : (c.author_name || "You")} · {when(c.created_at)}</small>
              {c.body}
            </div>
          ))}
          <div ref={end} />
        </div>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
      <form onSubmit={send} className="cp-actions" style={{ flexWrap: "nowrap" }}>
        <label htmlFor="reply" className="cp-sr">Reply</label>
        <input id="reply" className="cp-input" style={{ flex: 1, minWidth: 0 }} placeholder="Write a reply" maxLength={2000}
          value={body} onChange={(e) => setBody(e.target.value)} />
        <button type="submit" className="cp-btn cp-btn-p" disabled={!body.trim() || sending}>{sending ? "Sending…" : "Send"}</button>
      </form>
      <p className="cp-note" style={{ margin: 0 }}>The shop sees this on your order and answers by email.</p>
    </div>
  );
}

function NewMessage({ orders, jobs, start, onOrderMessage }: {
  orders: OrderRow[];
  jobs: Job[];
  start: { about: string; subject: string; body: string };
  onOrderMessage: (orderId: string) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [about, setAbout] = useState(start.about);
  const [subject, setSubject] = useState(start.subject);
  const [body, setBody] = useState(start.body);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filled again only when what it was opened for changes, never over what the buyer is typing.
  const startKey = `${start.about}|${start.subject}|${start.body}`;
  useEffect(() => {
    setAbout(start.about); setSubject(start.subject); setBody(start.body); setDone(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      if (about.startsWith("order:")) {
        // About an order: it goes on the order, where the shop reads it beside it.
        const orderId = about.slice(6);
        await accountService.addOrderComment(orderId, [subject.trim(), body.trim()].filter(Boolean).join("\n\n"));
        onOrderMessage(orderId);
        return;
      }
      const job = about.startsWith("job:") ? about.slice(4) : "";
      await apiClient.post("/api/v1/storefront/contact", {
        page_slug: "account",
        form_name: "Account message",
        data: {
          Name: [user?.first_name, user?.last_name].filter(Boolean).join(" ") || undefined,
          Email: user?.email,
          Subject: subject.trim() || (job ? `Print job ${job}` : "Question"),
          ...(job ? { "Print job": job } : {}),
          Message: body.trim(),
        },
      });
      setDone(true);
      setBody("");
    } catch {
      setError("Your message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="cp-card cp-pad cp-stack-sm" style={{ gap: 14 }}>
      <h2 className="cp-h3">Write to the shop</h2>
      {done && <Banner tone="ok">Sent. The shop answers by email at {user?.email}.</Banner>}
      {error && <Banner tone="bad">{error}</Banner>}
      <div className="cp-field">
        <label className="cp-label" htmlFor="m-about">About</label>
        <select id="m-about" className="cp-select" value={about} onChange={(e) => setAbout(e.target.value)}>
          <option value="general">A general question</option>
          {orders.length > 0 && (
            <optgroup label="An order">
              {orders.map((o) => <option key={o.id} value={`order:${o.id}`}>Order {o.order_number} ({day(o.created_at)})</option>)}
            </optgroup>
          )}
          {jobs.length > 0 && (
            <optgroup label="A print job">
              {jobs.map((j) => <option key={j.id} value={`job:${j.reference}`}>Print job {j.reference}</option>)}
            </optgroup>
          )}
        </select>
      </div>
      <div className="cp-field">
        <label className="cp-label" htmlFor="m-subject">Subject</label>
        <input id="m-subject" className="cp-input" maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="cp-field">
        <label className="cp-label" htmlFor="m-body">Message</label>
        <textarea id="m-body" className="cp-textarea" rows={6} maxLength={4000} value={body}
          onChange={(e) => { setBody(e.target.value); setDone(false); }} required />
      </div>
      <div className="cp-actions" style={{ justifyContent: "space-between" }}>
        <span className="cp-note">
          {about.startsWith("order:") ? "This goes on the order. The shop answers by email." : "The shop answers by email."}
        </span>
        <button type="submit" className="cp-btn cp-btn-p" disabled={!body.trim() || sending}>{sending ? "Sending…" : "Send"}</button>
      </div>
    </form>
  );
}

function MessagesPage() {
  const params = useSearchParams();
  const branding = useBranding();
  const shop = branding?.store_name || "The shop";
  const [convos, setConvos] = useState<Convo[] | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState<string>("new");
  const [error, setError] = useState<string | null>(null);

  const loadConvos = useCallback(() => {
    apiClient.get<{ items: Convo[] }>("/api/v1/orders/conversations")
      .then((d) => { setConvos(d.items); setError(null); })
      .catch(() => { setConvos([]); setError("Your conversations could not be loaded."); });
  }, []);

  useEffect(() => {
    loadConvos();
    apiClient.get<OrderPage>("/api/v1/orders?page=1&page_size=20").then((d) => setOrders(d.items)).catch(() => {});
    (gangSheetsService.myOrders() as Promise<Job[]>).then((j) => setJobs(j.slice(0, 20))).catch(() => {});
  }, [loadConvos]);

  // Opened from an order's "Request a reprint or return", or a job's "Request a change".
  const askedOrder = params.get("order");
  const askedJob = params.get("job");
  const topic = params.get("topic");
  const start = useMemo(() => {
    const order = askedOrder ? orders.find((o) => o.order_number === askedOrder || o.id === askedOrder) : undefined;
    if (order) {
      return topic === "return"
        ? { about: `order:${order.id}`, subject: "Reprint or return request", body: "What happened: \n\nI would like: a reprint / a refund" }
        : { about: `order:${order.id}`, subject: "", body: "" };
    }
    if (askedJob) return { about: `job:${askedJob}`, subject: `Change to print job ${askedJob}`, body: "" };
    return { about: "general", subject: "", body: "" };
  }, [askedOrder, askedJob, topic, orders]);

  const current = convos?.find((c) => c.order_id === open) ?? null;

  return (
    <>
      <PageHead eyebrow="Messages" title="Messages" sub="Talk to the shop about an order, a print job or anything else." />
      {error && <div style={{ marginBottom: 16 }}><Banner tone="bad" onRetry={loadConvos}>{error}</Banner></div>}
      <div className="cp-cols">
        <div style={{ flex: "0 1 340px", minWidth: 260, maxWidth: "100%" }}>
          <div className="cp-card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--cp-line)" }} className="cp-eyebrow">Conversations</div>
            <div className="cp-convos">
              <button type="button" className="cp-convo" aria-current={open === "new"} onClick={() => setOpen("new")}>
                <div className="t">New message</div>
                <div className="s">A question, a print job or an order</div>
              </button>
              {convos === null ? <Loading /> : convos.length === 0 ? (
                <Empty title="No conversations yet">Messages you write about an order show here.</Empty>
              ) : convos.map((c) => (
                <button key={c.order_id} type="button" className="cp-convo" aria-current={open === c.order_id} onClick={() => setOpen(c.order_id)}>
                  <div className="t">
                    <span>Order {c.order_number}</span>
                    <span className="cp-muted" style={{ fontWeight: 500, fontSize: 12 }}>{c.last_at ? day(c.last_at) : ""}</span>
                  </div>
                  <div className="s">{c.last_from_shop ? `${shop}: ` : "You: "}{c.last_body}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ flex: "1 1 480px", minWidth: 0 }}>
          {current ? (
            <Thread convo={current} shop={shop} onSent={loadConvos} />
          ) : (
            <NewMessage orders={orders} jobs={jobs} start={start}
              onOrderMessage={(orderId) => { loadConvos(); setOpen(orderId); }} />
          )}
        </div>
      </div>
    </>
  );
}

export default function AccountMessagesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <MessagesPage />
    </Suspense>
  );
}
