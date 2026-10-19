"use client";

/**
 * Settings → Notifications (design 34): each email a customer gets, on or off,
 * and in the shop's own words (services/notifications on the server).
 *
 * The list is every email; the editor changes one: Send this email, the
 * subject and the message, with the fields [order] [customer] [total]
 * [tracking].
 * - Save keeps it for this shop only.
 * - Send a test emails it, as typed, to the person signed in.
 * - The preview shows it as a customer gets it, with a sample order.
 * An email the shop has not changed goes out as it always has.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { ask, tell } from "@/lib/dialog";
import { useAuthStore } from "@/stores/auth.store";
import { isReadOnly } from "@/lib/permissions";

interface Row {
  key: string;
  label: string;
  when: string;
  enabled: boolean;
  subject: string;
  message: string;
  custom: boolean;
  default_subject: string;
  default_message: string;
}

interface Draft { enabled: boolean; subject: string; message: string }

const errorText = (e: unknown, fallback: string) => (e instanceof ApiClientError && e.message ? e.message : fallback);

export default function NotificationsPage() {
  const { user } = useAuthStore();
  const readOnly = isReadOnly(user?.role, user?.read_only);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fields, setFields] = useState<string[]>(["order", "customer", "total", "tracking"]);
  const [key, setKey] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | "failed" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient.get<{ items: Row[]; fields: string[] }>("/api/v1/admin/notifications")
      .then((r) => {
        setRows(r.items);
        setFields(r.fields);
        const first = r.items[0];
        if (first) { setKey(first.key); setDraft({ enabled: first.enabled, subject: first.subject, message: first.message }); }
      })
      .catch((e) => setError(errorText(e, "The emails could not be loaded.")));
  }, []);

  const row = rows?.find((r) => r.key === key) ?? null;
  const dirty = !!row && !!draft && (draft.enabled !== row.enabled || draft.subject !== row.subject || draft.message !== row.message);

  // The preview follows what is typed, a moment after the typing stops. Someone
  // who may only look sees the saved email (a read; the typed one is a POST).
  const latest = useRef(0);
  useEffect(() => {
    if (!key || !draft) return;
    const ticket = ++latest.current;
    const t = window.setTimeout(() => {
      const url = `/api/v1/admin/notifications/${key}/preview`;
      (readOnly
        ? apiClient.get<{ subject: string; html: string }>(url)
        : apiClient.post<{ subject: string; html: string }>(url, { enabled: draft.enabled, subject: draft.subject, message: draft.message }))
        .then((p) => { if (ticket === latest.current) setPreview(p); })
        .catch(() => { if (ticket === latest.current) setPreview("failed"); });
    }, 350);
    return () => window.clearTimeout(t);
  }, [key, draft, readOnly]);

  const open = useCallback(async (next: Row) => {
    if (next.key === key) return;
    if (dirty && !(await ask("Leave this email without saving? Your changes to it are lost.", { ok: "Leave it", danger: true }))) return;
    setKey(next.key);
    setDraft({ enabled: next.enabled, subject: next.subject, message: next.message });
    setNote(null);
    setPreview(null);
  }, [key, dirty]);

  async function save() {
    if (!draft || !row) return;
    setBusy("save");
    setNote(null);
    try {
      const saved = await apiClient.put<Row>(`/api/v1/admin/notifications/${row.key}`, draft);
      setRows((all) => all?.map((r) => (r.key === saved.key ? saved : r)) ?? all);
      setDraft({ enabled: saved.enabled, subject: saved.subject, message: saved.message });
      setNote({ ok: true, text: saved.enabled ? "Saved. Customers get this email in these words from now on." : "Saved. This email is no longer sent." });
    } catch (e) {
      setNote({ ok: false, text: errorText(e, "It could not be saved. Try again.") });
    } finally {
      setBusy("");
    }
  }

  async function test() {
    if (!draft || !row) return;
    setBusy("test");
    setNote(null);
    try {
      const r = await apiClient.post<{ sent_to: string }>(`/api/v1/admin/notifications/${row.key}/test`, draft);
      await tell(`A test of "${row.label}" went to ${r.sent_to}, with a sample order.`);
    } catch (e) {
      setNote({ ok: false, text: errorText(e, "The test could not be sent.") });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="pc-page" data-notifications>
      <Link href="/admin/settings" className="pc-back"><ArrowLeft size={16} strokeWidth={2.2} /> Settings</Link>
      <div className="pc-head">
        <div>
          <div className="pc-eyebrow">Settings</div>
          <h1 className="pc-h1">Notifications</h1>
          <p className="pc-sub-line">Emails your customers get.</p>
        </div>
      </div>

      {error && <div className="pc-flash" data-bad role="alert">{error}</div>}

      {!rows ? (
        !error && <div className="pc-card pc-empty">Loading…</div>
      ) : (
        <div className="pc-settings">
          <nav className="pc-card" aria-label="Emails" style={{ overflow: "hidden", padding: 0, alignSelf: "start" }}>
            {rows.map((r, i) => (
              <button key={r.key} type="button" onClick={() => open(r)} data-email={r.key}
                aria-current={r.key === key ? "true" : undefined}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", width: "100%",
                  textAlign: "left", padding: "11px 14px", border: 0, borderTop: i ? "1px solid var(--pc-line)" : 0,
                  background: r.key === key ? "#EDF3FE" : "#fff", font: `${r.key === key ? 600 : 500} 14px var(--pc-sans)`,
                  color: "var(--pc-ink)", cursor: "pointer",
                }}>
                <span>{r.label}</span>
                {!r.enabled && <span className="pc-pill" style={{ textTransform: "none" }}>Off</span>}
              </button>
            ))}
          </nav>

          {row && draft && (
            <div style={{ display: "grid", gap: "16px", minWidth: 0 }}>
              <section className="pc-card pc-pad" style={{ display: "grid", gap: "14px" }} data-editor={row.key}>
                <div>
                  <h2 className="pc-h2">{row.label}</h2>
                  <p className="pc-sub-line" style={{ margin: "4px 0 0" }}>{row.when}</p>
                </div>
                <div className="pc-switch-row">
                  <span>Send this email</span>
                  <button type="button" className="pc-switch" role="switch" aria-checked={draft.enabled} aria-label="Send this email"
                    data-on={draft.enabled ? "" : undefined} disabled={readOnly}
                    onClick={() => setDraft({ ...draft, enabled: !draft.enabled })} />
                </div>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span className="pc-label">Subject</span>
                  <input className="pc-input" value={draft.subject} maxLength={200} disabled={readOnly || !draft.enabled}
                    onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                </label>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span className="pc-label">Message</span>
                  <textarea className="pc-input" rows={5} value={draft.message} maxLength={4000} disabled={readOnly || !draft.enabled}
                    onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                    style={{ height: "auto", minHeight: "120px", padding: "10px 14px", resize: "vertical", lineHeight: 1.5 }} />
                </label>
                <p className="pc-sub-line" style={{ margin: 0 }}>
                  Fields you can use: {fields.map((f) => `[${f}]`).join(" ")}. The message opens the email; the order&apos;s
                  details, buttons and attachments follow it as before.
                  {(draft.subject !== row.default_subject || draft.message !== row.default_message) && (
                    <> <button type="button" className="pc-link" style={{ background: "none", border: 0, padding: 0 }} disabled={readOnly}
                      onClick={() => setDraft({ ...draft, subject: row.default_subject, message: row.default_message })}>Use the standard wording</button></>
                  )}
                </p>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" className="pc-btn" disabled={busy !== "" || readOnly} onClick={test}>{busy === "test" ? "Sending…" : "Send a test"}</button>
                  <button type="button" className="pc-btn" data-kind="primary" disabled={busy !== "" || readOnly || !dirty} onClick={save}>{busy === "save" ? "Saving…" : "Save"}</button>
                  {note && <span role="status" style={{ fontSize: "13px", color: note.ok ? "var(--pc-green, #067647)" : "var(--pc-red, #B42318)" }}>{note.text}</span>}
                </div>
              </section>

              <section className="pc-card pc-pad" style={{ display: "grid", gap: "10px" }} data-preview>
                <h2 className="pc-h2">Preview</h2>
                {!draft.enabled ? (
                  <p className="pc-sub-line" style={{ margin: 0 }}>This email is switched off: customers are not sent it.</p>
                ) : preview === "failed" ? (
                  <p className="pc-sub-line" style={{ margin: 0 }}>The preview could not be drawn. Saving still works.</p>
                ) : preview ? (
                  <>
                    <div className="pc-sub-line" data-preview-subject>Subject: <b style={{ color: "var(--pc-ink)" }}>{preview.subject}</b></div>
                    <iframe title="Email preview" srcDoc={preview.html} sandbox=""
                      style={{ width: "100%", height: "460px", border: "1px solid var(--pc-line)", borderRadius: "8px", background: "#fff" }} />
                  </>
                ) : <p className="pc-sub-line" style={{ margin: 0 }}>Drawing the preview…</p>}
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
