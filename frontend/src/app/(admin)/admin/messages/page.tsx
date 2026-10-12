"use client";

/**
 * Inbox — what the storefront's forms sent in: messages and quote requests
 * (services/inbox.py on the server). Under Customers in the sidebar; the top
 * bar's Inbox button comes here with the unread count.
 *
 * The box (?box=) and the open message (?m=) are in the address. Opening a
 * message marks it read. A reply goes out by email in the shop's own name and
 * marks the message answered; Archive takes it out of the Inbox without
 * deleting it. A quote request becomes a draft order for the customer the
 * address belongs to, or for a new account made from the request.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { ask } from "@/lib/dialog";
import { useAuthStore } from "@/stores/auth.store";
import { isReadOnly } from "@/lib/permissions";
import { AddCustomerModal } from "@/components/admin/customers/AddCustomerModal";
import { useCustomersOverview } from "@/components/admin/customers/CustomersFrame";
import { contactService, type ContactSubmission, type InboxBox, type InboxList } from "@/services/contact.service";

const BOXES: [InboxBox, string][] = [["all", "All"], ["messages", "Messages"], ["quotes", "Quote requests"], ["archived", "Archived"]];

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

const who = (s: ContactSubmission) => s.from.name || s.from.email || "Somebody";
const source = (s: ContactSubmission) => `${s.form_name || (s.kind === "quote" ? "Quote request" : "Contact form")}${s.page_slug ? `, /${s.page_slug}` : ""}`;

export default function InboxPage() {
  return (
    <Suspense fallback={<div className="pc-page"><div className="pc-card pc-empty">Loading the Inbox…</div></div>}>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const box = (params.get("box") ?? "all") as InboxBox;
  const openId = params.get("m");
  const { user } = useAuthStore();
  const readOnly = isReadOnly(user?.role, user?.read_only);

  const [data, setData] = useState<InboxList | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);
  const [replying, setReplying] = useState<ContactSubmission | null>(null);
  const [making, setMaking] = useState<ContactSubmission | null>(null);
  const [busy, setBusy] = useState("");
  const { overview } = useCustomersOverview();

  const go = useCallback((next: { box?: InboxBox; m?: string | null }) => {
    const p = new URLSearchParams(params.toString());
    if (next.box !== undefined) { if (next.box === "all") p.delete("box"); else p.set("box", next.box); p.delete("m"); }
    if (next.m !== undefined) { if (next.m) p.set("m", next.m); else p.delete("m"); }
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`, { scroll: false });
  }, [params, pathname, router]);

  const load = useCallback(async () => {
    try {
      setData(await contactService.list(box));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The Inbox could not be loaded.");
    }
  }, [box]);
  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const open = items.find((s) => s.id === openId) ?? null;

  // Open the newest on a wide screen when nothing is picked.
  useEffect(() => {
    if (!openId && items.length && typeof window !== "undefined" && window.innerWidth > 1180) go({ m: items[0]!.id });
  }, [openId, items, go]);

  // Opening a message reads it.
  useEffect(() => {
    if (!open || open.is_read || readOnly) return;
    contactService.change(open.id, { read: true }).then(put).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id]);

  function put(s: ContactSubmission) {
    setData((d) => {
      if (!d) return d;
      const wasUnread = d.items.find((x) => x.id === s.id)?.is_read === false && s.is_read;
      const leaves = (box === "archived") !== !!s.archived_at;
      return {
        ...d,
        items: leaves ? d.items.filter((x) => x.id !== s.id) : d.items.map((x) => (x.id === s.id ? { ...s, customer: s.customer ?? x.customer } : x)),
        unread: Math.max(0, d.unread - (wasUnread ? 1 : 0)),
      };
    });
  }

  async function change(s: ContactSubmission, body: { answered?: boolean; archived?: boolean }, done: string) {
    setBusy(Object.keys(body)[0]!);
    try {
      put(await contactService.change(s.id, body));
      setFlash({ text: done });
      if (body.archived !== undefined) { go({ m: null }); void load(); }
    } catch (e) {
      setFlash({ text: e instanceof Error ? e.message : "That did not save.", bad: true });
    }
    setBusy("");
  }

  async function remove(s: ContactSubmission) {
    if (!await ask(`Delete the message from ${who(s)}? It cannot be brought back. Archive keeps it out of the way instead.`, { title: "Delete message", ok: "Delete", danger: true })) return;
    try {
      await contactService.remove(s.id);
      setFlash({ text: "Deleted." });
      go({ m: null });
      void load();
    } catch {
      setFlash({ text: "It was not deleted.", bad: true });
    }
  }

  const counts = data?.counts;
  return (
    <div className="pc-page" data-inbox>
      <div className="pc-head">
        <div>
          <div className="pc-eyebrow">Inbox</div>
          <h1 className="pc-h1">Inbox</h1>
          <p className="pc-sub-line">Messages and quote requests in one place.</p>
        </div>
      </div>
      <nav className="pc-tabs" aria-label="Inbox">
        {BOXES.map(([b, label]) => {
          const n = counts ? (b === "all" ? counts.all : b === "messages" ? counts.messages : b === "quotes" ? counts.quotes : counts.archived) : null;
          return (
            <button key={b} type="button" className="pc-tab" data-tab={b} data-on={box === b ? "" : undefined}
              aria-current={box === b ? "page" : undefined} onClick={() => go({ box: b })}>
              {label}{n ? <span className="pc-tab-count">{n}</span> : null}
            </button>
          );
        })}
      </nav>

      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status" style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginTop: "14px" }}>
          <span>{flash.text}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)}><X size={16} /></button>
        </div>
      )}

      {error ? <div className="pc-card pc-empty" style={{ marginTop: "18px" }}>{error} <button type="button" className="pc-link" onClick={() => void load()}>Try again</button></div>
        : !data ? <div className="pc-card pc-empty" style={{ marginTop: "18px" }}>Loading the Inbox…</div>
        : (
          <div className="pc-inbox" data-box={box}>
            <div className="pc-card pc-inbox-list" data-inbox-list>
              <div className="pc-inbox-list-head">{items.length} {items.length === 1 ? "message" : "messages"}{box !== "archived" && data.unread ? ` · ${data.unread} unread` : ""}</div>
              {items.length === 0 ? (
                <div className="pc-empty">
                  {box === "archived" ? "Nothing archived." : box === "quotes" ? "No quote requests. The storefront's Get a quote page sends them here."
                    : "No messages. What people send through your storefront's contact and quote forms lands here."}
                </div>
              ) : items.map((s) => (
                <button key={s.id} type="button" className="pc-inbox-row" data-on={s.id === openId ? "" : undefined}
                  data-unread={!s.is_read ? "" : undefined} data-message={s.id} onClick={() => go({ m: s.id })}>
                  <span className="pc-inbox-row-top">
                    <span className="pc-inbox-who">{who(s)}</span>
                    <span className="pc-inbox-when">{when(s.created_at)}</span>
                  </span>
                  <span className="pc-inbox-row-sub">
                    {s.kind === "quote" && <span className="pc-pill" data-tone="blue">Quote</span>}
                    {s.answered_at && <span className="pc-pill" data-tone="green">Answered</span>}
                    <span className="pc-inbox-src">{source(s)}</span>
                  </span>
                  {s.from.message && <span className="pc-inbox-snippet">{s.from.message}</span>}
                </button>
              ))}
            </div>

            <div style={{ minWidth: 0 }}>
              {open ? (
                <Message s={open} busy={busy} readOnly={readOnly}
                  onClose={() => go({ m: null })}
                  onReply={() => setReplying(open)}
                  onAnswered={() => void change(open, { answered: !open.answered_at }, open.answered_at ? "Marked not answered." : "Marked answered.")}
                  onArchive={() => void change(open, { archived: !open.archived_at }, open.archived_at ? "Back in the Inbox." : "Archived. It is under Archived.")}
                  onDelete={() => void remove(open)}
                  onMakeAccount={() => setMaking(open)} />
              ) : items.length > 0 ? (
                <div className="pc-card pc-empty">Pick a message to read it.</div>
              ) : null}
              <p className="pc-sub-line" style={{ fontSize: "13px", margin: "12px 2px 0" }}>
                A quote request becomes a draft order with Create draft order: for the customer the address belongs to, or for a new account made from the request.
              </p>
            </div>
          </div>
        )}

      {replying && (
        <ReplyModal s={replying} onClose={() => setReplying(null)}
          onSent={(s) => { put(s); setReplying(null); setFlash({ text: `Reply sent to ${s.from.email}. The message is answered.` }); }} />
      )}
      {making && (
        <AddCustomerModal
          overview={overview}
          initial={{
            name: making.from.company || making.from.name || "", email: making.from.email ?? undefined, phone: making.from.phone ?? undefined,
            first_name: (making.from.name ?? "").split(" ")[0] || undefined,
            last_name: (making.from.name ?? "").split(" ").slice(1).join(" ") || undefined,
          }}
          onClose={() => setMaking(null)}
          onDone={(id) => {
            const name = making.from.company || making.from.name || "";
            setMaking(null);
            router.push(`/admin/orders/drafts?new=1&company=${id}&company_name=${encodeURIComponent(name)}`);
          }}
        />
      )}
    </div>
  );
}

function Message({ s, busy, readOnly, onClose, onReply, onAnswered, onArchive, onDelete, onMakeAccount }: {
  s: ContactSubmission; busy: string; readOnly: boolean;
  onClose: () => void; onReply: () => void; onAnswered: () => void; onArchive: () => void; onDelete: () => void; onMakeAccount: () => void;
}) {
  const f = s.from;
  const c = s.customer;
  const draftHref = c?.kind === "account" ? `/admin/orders/drafts?new=1&company=${c.id}&company_name=${encodeURIComponent(c.name)}` : null;
  return (
    <div className="pc-card pc-pad" data-open-message={s.id}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="pc-h2">{s.kind === "quote" ? "Quote request" : "Message"}</h2>
          <p className="pc-sub-line" style={{ fontSize: "13px", margin: "2px 0 0" }}>
            {source(s)} · {s.created_at ? new Date(s.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
            {s.answered_at && ` · answered ${new Date(s.answered_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
          </p>
        </div>
        <button type="button" className="pc-x pc-inbox-close" aria-label="Close" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="pc-form2" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: "16px" }}>
        <label><span className="pc-label">Name</span><input className="pc-input" readOnly value={f.name ?? ""} placeholder="—" /></label>
        <label><span className="pc-label">Email</span><input className="pc-input" readOnly value={f.email ?? ""} placeholder="—" /></label>
        <label><span className="pc-label">Phone</span><input className="pc-input" readOnly value={f.phone ?? ""} placeholder="—" /></label>
        <label className="pc-wide"><span className="pc-label">Company</span><input className="pc-input" readOnly value={f.company ?? ""} placeholder="—" /></label>
      </div>
      {f.message && <p style={{ whiteSpace: "pre-wrap", fontSize: "14.5px", lineHeight: 1.6, color: "var(--pc-ink)", margin: "16px 0 0" }} data-message-text>{f.message}</p>}
      {f.fields.length > 0 && (
        <div style={{ display: "grid", gap: "6px", marginTop: "14px" }}>
          {f.fields.map((x) => <div key={x.label} className="pc-kv"><span>{x.label}</span><b style={{ fontWeight: 500, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{x.value}</b></div>)}
        </div>
      )}
      {c && (
        <div className="pc-note" data-tone="blue" style={{ marginTop: "14px" }}>
          {c.kind === "account"
            ? <>This address belongs to <Link href={`/admin/customers/${c.id}`} className="pc-link">{c.name}</Link>, one of your customers.</>
            : <>This address has <Link href={`/admin/customers/guest?email=${encodeURIComponent(c.email)}`} className="pc-link">{c.orders} guest {c.orders === 1 ? "order" : "orders"}</Link>.</>}
        </div>
      )}

      {!readOnly && (
        <div style={{ display: "flex", gap: "10px", marginTop: "18px", flexWrap: "wrap" }}>
          {f.email && !s.archived_at && <button type="button" className="pc-btn" data-kind="primary" disabled={!!busy} onClick={onReply}>Reply by email</button>}
          {s.kind === "quote" && (draftHref
            ? <Link href={draftHref} className="pc-btn" data-kind={f.email && !s.archived_at ? undefined : "primary"}>Create draft order</Link>
            : <button type="button" className="pc-btn" onClick={onMakeAccount} title="Opens an account from the request, then a draft order on it">Create draft order</button>)}
          <button type="button" className="pc-btn" disabled={!!busy} onClick={onAnswered}>{s.answered_at ? "Mark not answered" : "Mark answered"}</button>
          <button type="button" className="pc-btn" disabled={!!busy} onClick={onArchive}>{s.archived_at ? "Back to the Inbox" : "Archive"}</button>
          <button type="button" className="pc-btn" data-kind="danger" disabled={!!busy} onClick={onDelete} style={{ marginLeft: "auto" }}>Delete</button>
        </div>
      )}
    </div>
  );
}

function ReplyModal({ s, onClose, onSent }: { s: ContactSubmission; onClose: () => void; onSent: (s: ContactSubmission) => void }) {
  const first = (s.from.name ?? "").split(" ")[0] || "there";
  const [subject, setSubject] = useState(s.kind === "quote" ? "Your quote request" : "Re: your message");
  const [body, setBody] = useState(`Hi ${first},\n\n`);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setError("");
    try { onSent(await contactService.reply(s.id, { subject, body })); }
    catch (err) { setError(err instanceof Error ? err.message : "The reply did not send."); setSending(false); }
  }
  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}>
      <form className="pc-modal" role="dialog" aria-label="Reply by email" onSubmit={send} style={{ width: "min(640px, 100%)" }} data-reply>
        <div className="pc-panel-head">
          <div>
            <h2 className="pc-h2">Reply to {who(s)}</h2>
            <p className="pc-sub-line" style={{ fontSize: "13.5px", marginTop: "2px" }}>Sent to {s.from.email} in your shop&apos;s name. Their answer comes back to your shop&apos;s email.</p>
          </div>
          <button type="button" className="pc-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: "4px 22px 18px", display: "grid", gap: "12px" }}>
          {error && <div className="pc-note" data-tone="red" role="alert">{error}</div>}
          <label><span className="pc-label">Subject</span><input className="pc-input" required value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label><span className="pc-label">Reply</span><textarea className="pc-input" required rows={9} value={body} onChange={(e) => setBody(e.target.value)} autoFocus /></label>
          {s.from.message && <p className="pc-sub-line" style={{ fontSize: "12.5px", margin: 0 }}>Their message is quoted under your reply.</p>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "14px 22px", borderTop: "1px solid var(--pc-line)" }}>
          <button type="button" className="pc-btn" onClick={onClose} disabled={sending}>Cancel</button>
          <button type="submit" className="pc-btn" data-kind="primary" disabled={sending || !body.trim() || body.trim() === `Hi ${first},`}>{sending ? "Sending…" : "Send reply"}</button>
        </div>
      </form>
    </div>
  );
}
