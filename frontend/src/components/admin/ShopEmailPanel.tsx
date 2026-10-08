"use client";

/**
 * The shop's email, the simple way.
 *
 * One address. A brand's customers see the shop's name on every email; this is
 * where their replies go and where the shop's own alerts land. Under the field
 * the panel says exactly what a customer will see — the name, the address it
 * comes from, where a reply goes — worked out by the server the same way the
 * mail itself is, so nobody has to place an order to find out.
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { isReadOnly } from "@/lib/permissions";

export interface EmailIdentity {
  store_name: string;
  sender_name: string;
  /** A sender name typed in on purpose, when it is not simply the store's. */
  custom_sender_name: string;
  email: string;
  reply_to: string;
  from_address: string;
  /** True once the shop sends from a verified address of its own. */
  own_sender: boolean;
}

const URL = "/api/v1/admin/integrations/email-identity";

export function ShopEmailPanel() {
  const { user } = useAuthStore();
  const readOnly = isReadOnly(user?.role, user?.read_only);

  const [who, setWho] = useState<EmailIdentity | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiClient.get<EmailIdentity>(URL)
      .then((r) => { setWho(r); setEmail(r.email ?? ""); })
      .catch(() => setNote({ ok: false, text: "Could not read your email settings." }))
      .finally(() => setLoading(false));
  }, []);

  async function save(useStoreName = false) {
    setBusy(true);
    setNote(null);
    try {
      const r = await apiClient.put<EmailIdentity>(URL, { email: email.trim(), use_store_name: useStoreName });
      setWho(r);
      setEmail(r.email ?? "");
      setNote({ ok: true, text: useStoreName ? "Done. Your emails now go out under your store name." : "Saved. Your emails use it from now on." });
    } catch (e) {
      setNote({ ok: false, text: (e as { message?: string })?.message || "Could not save it. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;

  const changed = email.trim() !== (who?.email ?? "");
  // A sender name typed in earlier that is not the store's: said, because it is
  // what the customer reads, and one press puts the store's name back.
  const otherName = !!who?.custom_sender_name && who.custom_sender_name.toLowerCase() !== (who.store_name || "").toLowerCase();

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="shop-email" className="block text-sm font-medium text-gray-700 mb-1">Your shop&apos;s email</label>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            id="shop-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && changed) void save(); }}
            disabled={readOnly || busy}
            maxLength={254}
            placeholder="you@yourshop.com"
            autoComplete="off"
            className="w-full max-w-sm border border-gray-300 rounded-md px-3 py-2 text-sm disabled:bg-gray-50"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={readOnly || busy || !changed}
            className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          When a customer replies to one of your emails, the reply comes here. Your own alerts come here too:
          new orders, applications, messages and low stock.
        </p>
      </div>

      {note && <p className={`text-sm ${note.ok ? "text-green-700" : "text-red-700"}`}>{note.text}</p>}

      {who && (
        <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-sm" data-email-preview>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">What your customers see</div>
          <dl className="grid gap-y-1" style={{ gridTemplateColumns: "88px 1fr" }}>
            <dt className="text-gray-500">From</dt>
            <dd className="text-gray-900 break-words"><strong>{who.sender_name}</strong> <span className="text-gray-500">&lt;{who.from_address}&gt;</span></dd>
            <dt className="text-gray-500">Replies to</dt>
            <dd className="text-gray-900 break-words">{who.reply_to || <span className="text-amber-700">nowhere yet. Add your email above.</span>}</dd>
          </dl>

          {otherName && (
            <p className="text-xs text-amber-800 mt-3">
              The sender name is set to &ldquo;{who.custom_sender_name}&rdquo;, not your store name &ldquo;{who.store_name}&rdquo;.{" "}
              <button type="button" onClick={() => void save(true)} disabled={readOnly || busy} className="underline font-medium disabled:opacity-50">
                Use my store name
              </button>
            </p>
          )}

          {!who.own_sender && (
            <p className="text-xs text-gray-500 mt-3">
              Your store name is the sender. The address itself is our sending address until you connect a sending
              domain of your own, under More options.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default ShopEmailPanel;
