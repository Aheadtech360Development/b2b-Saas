"use client";

/**
 * Team: who can use the company account (Members), who the shop should call
 * or email (Contacts), and the groups people are filed under (Groups). The
 * account owner invites, edits and removes people; everyone else can look.
 * Shown at /account/users and, on its Contacts tab, at /account/contacts.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { ask } from "@/lib/dialog";
import { useAuthStore } from "@/stores/auth.store";
import { Banner, Chip, Empty, Loading, Modal, PageHead, Tabs } from "./ui";
import { companyRoleOf } from "./data";

interface Member {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  user_group: string;
  is_active: boolean;
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  phone_ext: string | null;
  department: string | null;
  notes: string | null;
  is_primary: boolean;
  notify_order_confirmation: boolean;
  notify_order_shipped: boolean;
  notify_invoices: boolean;
  [key: string]: unknown;
}

/** The groups people are filed under: the labels the account has always used. */
const GROUPS: [string, string][] = [
  ["Admin", "Runs the account with the owner"],
  ["Accounting", "Invoices, statements and payments"],
  ["Purchasing", "Orders, quick order, quotes and print jobs"],
  ["Promo Standards", "Artwork and brand standards"],
];

const ROLE_WORDS: Record<string, string> = { owner: "Owner", buyer: "Buyer", viewer: "Viewer", finance: "Finance" };

function MemberForm({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved: (text: string) => void }) {
  const [form, setForm] = useState({
    first_name: member?.first_name ?? "", last_name: member?.last_name ?? "", email: member?.email ?? "",
    user_group: member?.user_group || "Purchasing", password: "", confirm: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!member) {
      if (form.password.length < 8 || form.password.length > 20) return setError("The password needs 8 to 20 characters.");
      if (!/^[a-zA-Z]/.test(form.password)) return setError("The password must begin with a letter.");
      if (form.password !== form.confirm) return setError("The two passwords do not match.");
    }
    setSaving(true);
    try {
      if (member) {
        await apiClient.patch(`/api/v1/account/users/${member.user_id}`, {
          first_name: form.first_name.trim(), last_name: form.last_name.trim(), user_group: form.user_group,
        });
        onSaved("Saved.");
      } else {
        await apiClient.post("/api/v1/account/users/invite", {
          first_name: form.first_name.trim(), last_name: form.last_name.trim(), email: form.email.trim(),
          role: "buyer", user_group: form.user_group, password: form.password,
        });
        onSaved(`${form.first_name.trim() || form.email.trim()} is on the team. They get an email with how to sign in.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "That could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Modal title={member ? "Edit person" : "Invite someone"} onClose={onClose}
      foot={<>
        <button type="button" className="cp-btn" onClick={onClose}>Cancel</button>
        <button type="submit" form="member-form" className="cp-btn cp-btn-p" disabled={saving}>{saving ? "Saving…" : member ? "Save" : "Send invite"}</button>
      </>}>
      <form id="member-form" onSubmit={submit} className="cp-stack-sm" style={{ gap: 14 }}>
        {error && <Banner tone="bad">{error}</Banner>}
        <div className="cp-grid2">
          <div className="cp-field"><label className="cp-label" htmlFor="m-first">First name</label><input id="m-first" className="cp-input" required value={form.first_name} onChange={set("first_name")} /></div>
          <div className="cp-field"><label className="cp-label" htmlFor="m-last">Last name</label><input id="m-last" className="cp-input" required value={form.last_name} onChange={set("last_name")} /></div>
        </div>
        <div className="cp-field">
          <label className="cp-label" htmlFor="m-email">Email</label>
          <input id="m-email" className="cp-input" type="email" required disabled={!!member} value={form.email} onChange={set("email")} />
        </div>
        <div className="cp-field">
          <label className="cp-label" htmlFor="m-group">Group</label>
          <select id="m-group" className="cp-select" value={form.user_group} onChange={set("user_group")}>
            {form.user_group && !GROUPS.some(([g]) => g === form.user_group) && <option value={form.user_group}>{form.user_group}</option>}
            {GROUPS.map(([g]) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        {!member && (
          <div className="cp-grid2">
            <div className="cp-field"><label className="cp-label" htmlFor="m-pw">Password for them</label><input id="m-pw" className="cp-input" type="password" autoComplete="new-password" required value={form.password} onChange={set("password")} /></div>
            <div className="cp-field"><label className="cp-label" htmlFor="m-pw2">Password again</label><input id="m-pw2" className="cp-input" type="password" autoComplete="new-password" required value={form.confirm} onChange={set("confirm")} /></div>
            <span className="cp-hint cp-span2">8 to 20 characters, starting with a letter. It goes to them in the invite email; they can change it under Account, Security.</span>
          </div>
        )}
      </form>
    </Modal>
  );
}

function Members({ owner }: { owner: boolean }) {
  const me = useAuthStore((s) => s.user);
  const [rows, setRows] = useState<Member[] | null>(null);
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(() => {
    apiClient.get<Member[]>("/api/v1/account/users").then(setRows)
      .catch(() => { setRows([]); setMessage({ tone: "bad", text: "The team could not be loaded." }); });
  }, []);
  useEffect(load, [load]);

  async function act(label: string, fn: () => Promise<unknown>, done: string) {
    if (!await ask(label)) return;
    try { await fn(); setMessage({ tone: "ok", text: done }); load(); }
    catch (err) { setMessage({ tone: "bad", text: err instanceof Error ? err.message : "That did not go through." }); }
  }

  return (
    <div className="cp-stack">
      {owner && (
        <div className="cp-actions">
          <button type="button" className="cp-btn cp-btn-p" onClick={() => { setMessage(null); setEditing("new"); }}>+ Invite someone</button>
          <Link href="/account/resend-emails" className="cp-btn">Resend invites</Link>
        </div>
      )}
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      <div className="cp-card" style={{ overflow: "hidden" }}>
        {rows === null ? <Loading /> : rows.length === 0 ? <Empty title="Nobody yet">Invite the people who order with you.</Empty> : (
          <div className="cp-tbl-wrap">
            <table className="cp-tbl">
              <thead><tr><th>Name</th><th>Email</th><th>Group</th><th>Status</th><th><span className="cp-sr">Actions</span></th></tr></thead>
              <tbody>
                {rows.map((u) => {
                  const isOwner = u.role === "owner";
                  const isMe = u.user_id === me?.id;
                  return (
                    <tr key={u.id}>
                      <td className="cp-strong">{`${u.first_name} ${u.last_name}`.trim() || u.email}{isMe && <span className="cp-muted" style={{ fontWeight: 500 }}> (you)</span>}</td>
                      <td>{u.email}</td>
                      <td>{isOwner ? <Chip tone="info">Owner</Chip> : <span>{u.user_group || ROLE_WORDS[u.role] || "—"}</span>}</td>
                      <td><Chip tone={u.is_active ? "ok" : "mute"}>{u.is_active ? "Active" : "Off"}</Chip></td>
                      <td className="cp-end">
                        {owner && !isOwner ? (
                          <span className="cp-actions" style={{ justifyContent: "flex-end" }}>
                            <button type="button" className="cp-btn cp-btn-sm" onClick={() => { setMessage(null); setEditing(u); }}>Edit</button>
                            <button type="button" className="cp-btn cp-btn-sm" onClick={() => act(`Send ${u.email} a link to set a new password?`,
                              () => apiClient.post(`/api/v1/account/users/${u.user_id}/reset-password`, {}), `Password email sent to ${u.email}.`)}>Reset password</button>
                            <button type="button" className="cp-btn cp-btn-sm" onClick={() => act(`${u.is_active ? "Turn off" : "Turn on"} ${u.email}'s access?`,
                              () => apiClient.patch(`/api/v1/account/users/${u.user_id}`, { is_active: !u.is_active }), u.is_active ? "Access turned off." : "Access turned on.")}>
                              {u.is_active ? "Turn off" : "Turn on"}
                            </button>
                            <button type="button" className="cp-btn cp-btn-sm cp-btn-danger" onClick={() => act(`Remove ${u.first_name || u.email} from your company?`,
                              () => apiClient.delete(`/api/v1/account/users/${u.user_id}`), "Removed from the team.")}>Remove</button>
                          </span>
                        ) : isOwner ? <span className="cp-note">Full access</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!owner && <p className="cp-note">Only the account owner can invite or remove people.</p>}
      {editing && (
        <MemberForm member={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onSaved={(text) => { setEditing(null); setMessage({ tone: "ok", text }); load(); }} />
      )}
    </div>
  );
}

const BLANK_CONTACT = {
  first_name: "", last_name: "", email: "", phone: "", phone_ext: "", department: "", notes: "",
  is_primary: false, notify_order_confirmation: true, notify_order_shipped: true, notify_invoices: false,
};

function ContactForm({ contact, onClose, onSaved }: { contact: Contact | null; onClose: () => void; onSaved: (text: string) => void }) {
  const [form, setForm] = useState(() => contact ? {
    first_name: contact.first_name, last_name: contact.last_name, email: contact.email, phone: contact.phone ?? "",
    phone_ext: contact.phone_ext ?? "", department: contact.department ?? "", notes: contact.notes ?? "",
    is_primary: contact.is_primary, notify_order_confirmation: contact.notify_order_confirmation,
    notify_order_shipped: contact.notify_order_shipped, notify_invoices: contact.notify_invoices,
  } : BLANK_CONTACT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    // An edit sends the whole contact back: the API replaces every field, and
    // the ones this form does not show (home address and the like) must stay.
    const rest = contact ? Object.fromEntries(Object.entries(contact).filter(([k]) => k !== "id")) : {};
    const body = { ...rest, ...form, phone: form.phone || null, phone_ext: form.phone_ext || null, department: form.department || null, notes: form.notes || null };
    try {
      if (contact) await apiClient.patch(`/api/v1/account/contacts/${contact.id}`, body);
      else await apiClient.post("/api/v1/account/contacts", body);
      onSaved(contact ? "Contact saved." : "Contact added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The contact could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof typeof BLANK_CONTACT) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const tick = (k: keyof typeof BLANK_CONTACT) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.checked }));
  return (
    <Modal title={contact ? "Edit contact" : "Add a contact"} onClose={onClose}
      foot={<>
        <button type="button" className="cp-btn" onClick={onClose}>Cancel</button>
        <button type="submit" form="contact-form" className="cp-btn cp-btn-p" disabled={saving}>{saving ? "Saving…" : "Save contact"}</button>
      </>}>
      <form id="contact-form" onSubmit={submit} className="cp-stack-sm" style={{ gap: 14 }}>
        {error && <Banner tone="bad">{error}</Banner>}
        <div className="cp-grid2">
          <div className="cp-field"><label className="cp-label" htmlFor="c-first">First name</label><input id="c-first" className="cp-input" required value={form.first_name} onChange={set("first_name")} /></div>
          <div className="cp-field"><label className="cp-label" htmlFor="c-last">Last name</label><input id="c-last" className="cp-input" required value={form.last_name} onChange={set("last_name")} /></div>
          <div className="cp-field cp-span2"><label className="cp-label" htmlFor="c-email">Email</label><input id="c-email" className="cp-input" type="email" required value={form.email} onChange={set("email")} /></div>
          <div className="cp-field"><label className="cp-label" htmlFor="c-phone">Phone</label><input id="c-phone" className="cp-input" type="tel" value={form.phone} onChange={set("phone")} /></div>
          <div className="cp-field"><label className="cp-label" htmlFor="c-ext">Extension</label><input id="c-ext" className="cp-input" value={form.phone_ext} onChange={set("phone_ext")} /></div>
          <div className="cp-field cp-span2"><label className="cp-label" htmlFor="c-dept">Department</label><input id="c-dept" className="cp-input" value={form.department} onChange={set("department")} /></div>
          <div className="cp-field cp-span2"><label className="cp-label" htmlFor="c-notes">Notes</label><textarea id="c-notes" className="cp-textarea" rows={3} value={form.notes} onChange={set("notes")} /></div>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
          <legend className="cp-label" style={{ marginBottom: 6 }}>Emails this contact gets</legend>
          <label className="cp-check"><input type="checkbox" checked={form.notify_order_confirmation} onChange={tick("notify_order_confirmation")} />Order confirmations</label>
          <label className="cp-check"><input type="checkbox" checked={form.notify_order_shipped} onChange={tick("notify_order_shipped")} />Shipping updates</label>
          <label className="cp-check"><input type="checkbox" checked={form.notify_invoices} onChange={tick("notify_invoices")} />Invoices</label>
          <label className="cp-check"><input type="checkbox" checked={form.is_primary} onChange={tick("is_primary")} />Main contact (statements go here)</label>
        </fieldset>
      </form>
    </Modal>
  );
}

function Contacts() {
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(() => {
    apiClient.get<Contact[]>("/api/v1/account/contacts").then(setRows)
      .catch(() => { setRows([]); setMessage({ tone: "bad", text: "Your contacts could not be loaded." }); });
  }, []);
  useEffect(load, [load]);

  async function remove(c: Contact) {
    if (!await ask(`Delete the contact ${c.first_name} ${c.last_name}?`, { ok: "Delete", danger: true })) return;
    try { await apiClient.delete(`/api/v1/account/contacts/${c.id}`); setMessage({ tone: "ok", text: "Contact deleted." }); load(); }
    catch { setMessage({ tone: "bad", text: "That contact could not be deleted." }); }
  }

  return (
    <div className="cp-stack">
      <div className="cp-actions"><button type="button" className="cp-btn cp-btn-p" onClick={() => { setMessage(null); setEditing("new"); }}>+ Add a contact</button></div>
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      <div className="cp-card" style={{ overflow: "hidden" }}>
        {rows === null ? <Loading /> : rows.length === 0 ? <Empty title="No contacts yet">Add the people the shop should call or email about orders and invoices.</Empty> : (
          <div className="cp-tbl-wrap">
            <table className="cp-tbl">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Gets</th><th><span className="cp-sr">Actions</span></th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="cp-strong">{c.first_name} {c.last_name}{c.is_primary && <> <Chip tone="info">Main</Chip></>}{c.department && <div className="cp-note">{c.department}</div>}</td>
                    <td>{c.email}</td>
                    <td>{c.phone ? `${c.phone}${c.phone_ext ? ` ext ${c.phone_ext}` : ""}` : "—"}</td>
                    <td className="cp-note">{[c.notify_order_confirmation && "Orders", c.notify_order_shipped && "Shipping", c.notify_invoices && "Invoices"].filter(Boolean).join(", ") || "Nothing"}</td>
                    <td className="cp-end">
                      <span className="cp-actions" style={{ justifyContent: "flex-end" }}>
                        <button type="button" className="cp-btn cp-btn-sm" onClick={() => { setMessage(null); setEditing(c); }}>Edit</button>
                        <button type="button" className="cp-btn cp-btn-sm cp-btn-danger" onClick={() => remove(c)}>Delete</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && (
        <ContactForm contact={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onSaved={(text) => { setEditing(null); setMessage({ tone: "ok", text }); load(); }} />
      )}
    </div>
  );
}

function Groups() {
  return (
    <div className="cp-stack">
      <div className="cp-card" style={{ overflow: "hidden" }}>
        <div className="cp-tbl-wrap">
          <table className="cp-tbl" style={{ minWidth: 480 }}>
            <thead><tr><th>Group</th><th>Used for</th></tr></thead>
            <tbody>{GROUPS.map(([g, what]) => <tr key={g}><td className="cp-strong">{g}</td><td>{what}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <p className="cp-note">Groups say what each person is for. The account owner is the one who invites, edits and removes people.</p>
    </div>
  );
}

export function TeamPage({ tab }: { tab: "members" | "contacts" | "groups" }) {
  const token = useAuthStore((s) => s.accessToken);
  const owner = companyRoleOf(token) === "owner";
  const [counts, setCounts] = useState<{ members: number | null; contacts: number | null }>({ members: null, contacts: null });

  useEffect(() => {
    apiClient.get<unknown[]>("/api/v1/account/users").then((d) => setCounts((c) => ({ ...c, members: d.length }))).catch(() => {});
    apiClient.get<unknown[]>("/api/v1/account/contacts").then((d) => setCounts((c) => ({ ...c, contacts: d.length }))).catch(() => {});
  }, [tab]);

  return (
    <>
      <PageHead eyebrow="Team" title="Team" sub="Who can use your company account, and who the shop should call." />
      <Tabs label="Team" tabs={[
        { key: "members", label: "Members", href: "/account/users", on: tab === "members", count: counts.members },
        { key: "contacts", label: "Contacts", href: "/account/contacts", on: tab === "contacts", count: counts.contacts },
        { key: "groups", label: "Groups", href: "/account/users?tab=groups", on: tab === "groups" },
      ]} />
      {tab === "contacts" ? <Contacts /> : tab === "groups" ? <Groups /> : <Members owner={owner} />}
    </>
  );
}
