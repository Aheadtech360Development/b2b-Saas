"use client";

/**
 * LinkPicker — where a button in the theme points.
 *
 * Typing a URL by hand is how internal links end up wrong, so the picker
 * offers the store's own pages, products and collections by name and writes
 * the address itself. An external link is still just a URL, typed once.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface Target { label: string; url: string }
interface Targets { pages: Target[]; products: Target[]; collections: Target[] }

type Kind = "page" | "product" | "collection" | "url";

const label: React.CSSProperties = { display: "block", fontSize: "11.5px", fontWeight: 600, color: "#555", marginBottom: "5px", textTransform: "uppercase", letterSpacing: ".04em" };
const input: React.CSSProperties = { width: "100%", border: "1px solid #E3E3E3", borderRadius: "8px", padding: "9px 11px", fontSize: "13.5px", outline: "none", boxSizing: "border-box", background: "#fff" };

/** Which kind of destination an address already is. */
function kindOf(url: string): Kind {
  if (/^https?:\/\//i.test(url) || url.startsWith("mailto:") || url.startsWith("tel:")) return "url";
  if (url.startsWith("/products/")) return "product";
  if (url.startsWith("/collections/")) return "collection";
  return "page";
}

export function LinkPicker({ value, disabled, onChange }: {
  value: string;
  disabled?: boolean;
  onChange: (url: string) => void;
}) {
  const [kind, setKind] = useState<Kind>(() => kindOf(value || "/"));
  const [q, setQ] = useState("");
  const [targets, setTargets] = useState<Targets>({ pages: [], products: [], collections: [] });
  const [loading, setLoading] = useState(false);
  const lastValue = useRef(value);
  // What this picker itself last wrote. Anything else arriving in `value` came
  // from the editor moving to a different link.
  const ourWrite = useRef<string | null>(null);

  /** Report a change, and remember we were the ones who made it. */
  const write = useCallback((url: string) => {
    ourWrite.current = url;
    lastValue.current = url;
    onChange(url);
  }, [onChange]);

  // Follow the value when the EDITOR jumps to another link — never when the
  // change is one of ours.
  //
  // It used to re-derive the kind from any new value, including every
  // keystroke this picker had just caused. So picking "External URL" and
  // typing `h` handed back "h", which reads as a page, and the picker
  // switched itself back to Pages mid-word: the field unmounted, the focus
  // went, and you started again. Every link in the theme editor did it.
  useEffect(() => {
    if (value === lastValue.current) return;
    lastValue.current = value;
    if (value === ourWrite.current) return;
    ourWrite.current = null;
    setKind(kindOf(value || "/"));
  }, [value]);

  useEffect(() => {
    if (kind === "url") return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      apiClient.get<Targets>(`/api/v1/admin/storefront/theme/links${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)
        .then((r) => { if (!cancelled) setTargets({ pages: r.pages ?? [], products: r.products ?? [], collections: r.collections ?? [] }); })
        .catch(() => { if (!cancelled) setTargets({ pages: [], products: [], collections: [] }); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, kind]);

  const options = useMemo(() => {
    if (kind === "product") return targets.products;
    if (kind === "collection") return targets.collections;
    return targets.pages;
  }, [kind, targets]);

  const known = options.some((o) => o.url === value);

  return (
    <div>
      <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
        {(["page", "product", "collection", "url"] as Kind[]).map((k) => (
          <button key={k} type="button" disabled={disabled}
            onClick={() => {
              setKind(k);
              setQ("");
              // Asking for an external URL when the link is a path on this shop
              // empties the box. Otherwise the old "/" sat there and whatever
              // you typed landed after it — "/https://…", which is neither.
              if (k === "url" && value && kindOf(value) !== "url") write("");
            }}
            style={{ border: "1px solid", borderColor: kind === k ? "#1A1A1A" : "#E3E3E3", background: kind === k ? "#1A1A1A" : "#fff", color: kind === k ? "#fff" : "#555", borderRadius: "7px", padding: "5px 10px", fontSize: "11.5px", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", textTransform: "capitalize" }}>
            {k === "url" ? "External URL" : k}
          </button>
        ))}
      </div>

      {kind === "url" ? (
        <input disabled={disabled} style={input} value={value} placeholder="https://example.com"
          onChange={(e) => write(e.target.value)} />
      ) : (
        <>
          <input disabled={disabled} style={{ ...input, marginBottom: "6px" }} value={q}
            placeholder={`Search ${kind === "page" ? "pages" : kind === "product" ? "products" : "collections"}…`}
            onChange={(e) => setQ(e.target.value)} />
          <select disabled={disabled} style={input} value={known ? value : ""}
            onChange={(e) => e.target.value && write(e.target.value)}>
            <option value="">{loading ? "Loading…" : known ? "" : `— choose a ${kind} —`}</option>
            {options.map((o) => <option key={o.url} value={o.url}>{o.label}</option>)}
          </select>
          {value && !known && (
            <p style={{ fontSize: "11.5px", color: "#7A7880", marginTop: "6px" }}>
              Currently points to <code>{value}</code>
              {value === "#" ? " — nowhere yet." : "."}
            </p>
          )}
        </>
      )}
      {kind !== "url" && !loading && options.length === 0 && (
        <p style={{ fontSize: "11.5px", color: "#7A7880", marginTop: "6px" }}>
          Nothing here yet — add {kind === "product" ? "a product" : kind === "collection" ? "a collection" : "a page"} first.
        </p>
      )}
    </div>
  );
}

export { kindOf as linkKindOf };
