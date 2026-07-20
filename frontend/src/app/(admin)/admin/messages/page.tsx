"use client";

import { useEffect, useState } from "react";
import { contactService, type ContactSubmission } from "@/services/contact.service";
import { useAuthStore } from "@/stores/auth.store";
import { isReadOnly } from "@/lib/permissions";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MessagesPage() {
  const { user } = useAuthStore();
  const readOnly = isReadOnly(user?.role);
  const [items, setItems] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  function load() {
    setLoading(true);
    contactService.list()
      .then((r) => setItems(r.items))
      .catch(() => setError("Failed to load messages."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function toggle(s: ContactSubmission) {
    const next = open === s.id ? null : s.id;
    setOpen(next);
    if (next && !s.is_read && !readOnly) {
      try {
        await contactService.markRead(s.id);
        setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_read: true } : x)));
      } catch { /* ignore */ }
    }
  }

  async function remove(s: ContactSubmission) {
    if (!confirm("Delete this message?")) return;
    try {
      await contactService.remove(s.id);
      setItems((prev) => prev.filter((x) => x.id !== s.id));
    } catch { setError("Could not delete."); }
  }

  const card: React.CSSProperties = { background: "#fff", border: "1px solid #E2E0DA", borderRadius: "12px" };
  const unread = items.filter((i) => !i.is_read).length;

  return (
    <div style={{ fontFamily: "var(--font-jakarta), sans-serif", maxWidth: "820px" }}>
      <div style={{ marginBottom: "22px" }}>
        <h1 style={{ fontFamily: "var(--font-bebas), sans-serif", fontSize: "32px", color: "#2A2830", letterSpacing: ".03em", lineHeight: 1 }}>
          Messages {unread > 0 && <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff", background: "#1A5CFF", borderRadius: "20px", padding: "3px 10px", verticalAlign: "middle", marginLeft: "8px", fontFamily: "var(--font-jakarta), sans-serif" }}>{unread} new</span>}
        </h1>
        <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>Form submissions from your storefront contact forms.</p>
      </div>

      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>{error}</div>}

      {loading ? (
        <div style={{ padding: "40px", color: "#888", fontSize: "14px" }}>Loading messages…</div>
      ) : items.length === 0 ? (
        <div style={{ ...card, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "34px", marginBottom: "8px" }}>📭</div>
          <p style={{ fontSize: "15px", color: "#7A7880" }}>No messages yet.</p>
          <p style={{ fontSize: "13px", color: "#aaa", marginTop: "4px" }}>Add a Contact Form section to a page — submissions will show up here.</p>
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          {items.map((s, idx) => {
            const summary = s.data["Name"] || s.data["name"] || s.data["Email"] || s.data["email"] || Object.values(s.data)[0] || "Submission";
            return (
              <div key={s.id} style={{ borderTop: idx === 0 ? "none" : "1px solid #F2F1EC", background: s.is_read ? "#fff" : "#F7FAFF" }}>
                <div onClick={() => toggle(s)} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", cursor: "pointer" }}>
                  {!s.is_read && <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#1A5CFF", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: s.is_read ? 500 : 700, color: "#2A2830", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</div>
                    <div style={{ fontSize: "12px", color: "#999", marginTop: "2px" }}>{s.form_name || "Contact"}{s.page_slug ? ` · /${s.page_slug}` : ""}</div>
                  </div>
                  <span style={{ fontSize: "12px", color: "#aaa", flexShrink: 0 }}>{timeAgo(s.created_at)}</span>
                  <span style={{ fontSize: "11px", color: "#bbb", transform: open === s.id ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</span>
                </div>
                {open === s.id && (
                  <div style={{ padding: "0 18px 18px 18px" }}>
                    <div style={{ background: "#FAFAF8", border: "1px solid #EEE", borderRadius: "8px", padding: "14px" }}>
                      {Object.entries(s.data).map(([k, v]) => (
                        <div key={k} style={{ display: "flex", gap: "10px", padding: "6px 0", borderBottom: "1px solid #F0EFEA", fontSize: "14px" }}>
                          <span style={{ fontWeight: 700, color: "#555", flex: "0 0 130px" }}>{k}</span>
                          <span style={{ color: "#2A2830", whiteSpace: "pre-wrap", flex: 1 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    {!readOnly && (
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
                        <button onClick={() => remove(s)} style={{ background: "transparent", border: "1px solid #F1C4C4", color: "#B91C1C", padding: "7px 16px", borderRadius: "7px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Delete</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
