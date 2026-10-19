"use client";

/**
 * Collections — one of the Products tabs: every collection, picked by hand or
 * filled by conditions (services/collection_rules on the server: a collection
 * with conditions stores the question, so products join and leave as they
 * change). Each opens in its editor (design 36, ./[id]).
 *
 * Categories, the filters the storefront browses by, keep their own tab.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { ProductsFrame } from "@/components/admin/products/ProductsFrame";

interface Row {
  id: string; name: string; slug: string; image_url: string | null;
  match_type: "manual" | "automatic"; rules_match: "all" | "any"; rules_explained: string[];
  is_active: boolean; product_count: number | null;
}

export default function CollectionsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient.get<Row[]>("/api/v1/admin/collections")
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch((e) => setError(e instanceof ApiClientError && e.message ? e.message : "The collections could not be loaded."));
  }, []);

  return (
    <ProductsFrame active="collections" title="Collections"
      sub="Groups of products for your storefront, picked by hand or filled by conditions."
      actions={<Link href="/admin/products/collections/new" className="pc-btn" data-kind="primary">New collection</Link>}>
      <div className="pc-card" data-collections aria-busy={!rows && !error}>
        {error ? <div className="pc-empty">{error}</div>
          : !rows ? <div className="pc-empty">Loading collections…</div>
          : rows.length === 0 ? (
            <div className="pc-empty">
              No collections yet. Pick products yourself, or set conditions such as &ldquo;tagged summer and under $30&rdquo; and the collection keeps itself up to date.{" "}
              <Link href="/admin/products/collections/new" className="pc-link">Make the first one</Link>
            </div>
          ) : (
            <div className="pc-scroll-x">
              <table className="pc-table" style={{ minWidth: "640px" }}>
                <thead><tr><th>Collection</th><th>How products get in</th><th className="pc-num">Products</th><th>Storefront</th></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} data-collection={c.slug} style={{ cursor: "pointer" }} onClick={() => router.push(`/admin/products/collections/${c.id}`)}>
                      <td>
                        <Link href={`/admin/products/collections/${c.id}`} className="pc-row-title" onClick={(e) => e.stopPropagation()}>{c.name}</Link>
                        <div className="pc-sub-line" style={{ fontSize: "12.5px", margin: 0 }}>/collections/{c.slug}</div>
                      </td>
                      <td style={{ color: "var(--pc-ink-2)", maxWidth: "360px" }}>
                        {c.match_type === "automatic"
                          ? (c.rules_explained.length ? c.rules_explained.join(c.rules_match === "all" ? " and " : " or ") : "Conditions (none set)")
                          : "Picked by hand"}
                      </td>
                      <td className="pc-num">{c.product_count ?? "–"}</td>
                      <td><span className="pc-pill" data-tone={c.is_active ? "green" : undefined} style={{ textTransform: "none" }}>{c.is_active ? "Shown" : "Hidden"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </ProductsFrame>
  );
}
