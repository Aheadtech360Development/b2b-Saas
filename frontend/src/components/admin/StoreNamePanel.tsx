"use client";

/**
 * What the shop calls itself.
 *
 * This name is everywhere a customer looks — the browser tab, the emails they
 * get, the order pages, the app — and until now it could only be set on the
 * storefront editor, which is off the menu. So a brand that changed its name
 * kept wearing the old one with nowhere to go and change it.
 *
 * It is the brand's own name, not the one the platform files them under, so
 * the two can differ on purpose; this is where the brand decides.
 */
import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { isReadOnly } from "@/lib/permissions";
import { storefrontService } from "@/services/storefront.service";

export function StoreNamePanel() {
  const { user } = useAuthStore();
  const readOnly = isReadOnly(user?.role, user?.read_only);

  const [name, setName] = useState("");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    storefrontService.get()
      .then((b) => {
        const current = b?.store_name && b.store_name !== "Store" ? b.store_name : "";
        setName(current);
        setSaved(current);
      })
      .catch(() => setNote({ ok: false, text: "Could not read your store name." }))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    const next = name.trim();
    if (!next || next === saved) return;
    setBusy(true);
    setNote(null);
    try {
      await storefrontService.update({ store_name: next });
      setSaved(next);
      setNote({ ok: true, text: "Saved. Your tab and your emails use it from now on." });
      // The tab is written from the branding the page loaded at startup, so it
      // would keep the old name until a reload otherwise.
      if (typeof document !== "undefined") document.title = next;
    } catch {
      setNote({ ok: false, text: "Could not save it. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          disabled={readOnly || busy}
          maxLength={80}
          placeholder="e.g. Innterflow"
          aria-label="Store name"
          className="w-full max-w-sm border border-gray-300 rounded-md px-3 py-2 text-sm disabled:bg-gray-50"
        />
        <button
          type="button"
          onClick={save}
          disabled={readOnly || busy || !name.trim() || name.trim() === saved}
          className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      {note && (
        <p className={`text-sm ${note.ok ? "text-green-700" : "text-red-700"}`}>{note.text}</p>
      )}

      <p className="text-xs text-gray-500">
        Shown in the browser tab, on every email you send, and anywhere a customer
        is told whose shop this is.
      </p>
    </div>
  );
}

export default StoreNamePanel;
