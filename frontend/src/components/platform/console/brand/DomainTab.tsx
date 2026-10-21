"use client";

/**
 * A brand's addresses (design screen 5): its address on the platform, which
 * can be moved, and its own domain, with the DNS records the owner adds and a
 * check of whether the domain answers yet.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ask, askText, tell } from "@/lib/dialog";
import { platformService } from "@/services/platform.service";
import { consoleApi, type DomainStatus } from "../api";
import type { BrandTabProps } from "../BrandPage";
import { Failed, Loading, errorText, useLoad } from "../ui";

export function DomainTab({ brand, reload }: BrandTabProps) {
  const router = useRouter();
  const { data, error, loading, reload: reloadDomain, setData } = useLoad(() => consoleApi.domain(brand.slug), [brand.slug]);
  const [host, setHost] = useState(brand.custom_domain ?? "");
  const [busy, setBusy] = useState<string | null>(null);

  async function move() {
    const next = await askText("The brand's new address on the platform. Links to the old one stop working, and the new one has to be added in Vercel.",
      brand.slug, { title: "Move the store address", ok: "Move" });
    if (next === null || !next.trim() || next.trim() === brand.slug) return;
    setBusy("move");
    try {
      const r = await platformService.updateTenant(brand.slug, { slug: next.trim() });
      router.replace(`/platform/brands/${r.slug}?tab=domain`);
    } catch (e) {
      await tell(errorText(e, "The address could not be moved."));
    } finally {
      setBusy(null);
    }
  }

  async function saveDomain(value: string) {
    setBusy("domain");
    try {
      await platformService.updateTenant(brand.slug, { custom_domain: value });
      await reload();
      await reloadDomain();
    } catch (e) {
      await tell(errorText(e, "The domain could not be saved."));
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setBusy("check");
    try {
      setData(await consoleApi.domain(brand.slug, true));
    } catch (e) {
      await tell(errorText(e, "The domain could not be checked."));
    } finally {
      setBusy(null);
    }
  }

  const status = (d: DomainStatus) =>
    d.status === "live" ? <span className="pc-pill" data-tone="green">Live</span>
      : d.status === "pending" ? <span className="pc-pill" data-tone="amber">Waiting for DNS</span>
        : <span className="pc-pill">No domain</span>;

  return (
    <div className="pc-stack">
      {error && <Failed message={error} onRetry={reloadDomain} />}
      {loading && !data ? <Loading what="Loading addresses" /> : null}
      <section className="pc-card">
        <div className="pc-card-head"><h2 className="pc-h2">Platform address</h2>
          <button type="button" className="pc-btn" disabled={busy !== null} onClick={() => void move()}>Move</button></div>
        <div className="pc-panel-body">
          <div className="pc-kv"><span>Store address</span><b className="pc-mono">{brand.slug}</b></div>
          {data?.platform_address && <div className="pc-kv"><span>On the platform</span><b className="pc-mono">{data.platform_address}</b></div>}
          <div className="pc-kv"><span>Store link</span><b><a href={brand.store_url} target="_blank" rel="noreferrer" className="pc-link">{brand.store_url}</a></b></div>
          <div className="pc-hint">Moving it breaks existing links. A new shop address answers once it is added in Vercel, the project, Domains.</div>
        </div>
      </section>

      <section className="pc-card">
        <div className="pc-card-head"><h2 className="pc-h2">Shop address (own domain)</h2>{data && status(data)}</div>
        <div className="pc-panel-body">
          <div className="pc-row-actions">
            <input className="pc-input" style={{ maxWidth: 340 }} value={host} placeholder="shop.example.com"
              onChange={(e) => setHost(e.target.value)} aria-label="Shop domain" />
            <button type="button" className="pc-btn" data-kind="primary" disabled={busy !== null || host.trim() === (brand.custom_domain ?? "")}
              onClick={() => void saveDomain(host.trim())}>Save</button>
            {brand.custom_domain && (
              <button type="button" className="pc-btn" disabled={busy !== null} onClick={() => void (async () => {
                if (await ask(`Take ${brand.custom_domain} off this shop? The shop answers on its platform address only.`, { ok: "Remove it" })) {
                  setHost("");
                  await saveDomain("");
                }
              })()}>Remove</button>
            )}
          </div>
          {data?.domain && (
            <>
              <div className="pc-small-head" style={{ marginTop: 6 }}>DNS records the owner must add</div>
              <div className="pc-scroll-x">
                <table className="pc-table">
                  <thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead>
                  <tbody>
                    {data.records.map((r, i) => (
                      <tr key={i}><td className="pc-mono">{r.type}</td><td className="pc-mono">{r.name}</td><td className="pc-mono">{r.value}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pc-row-actions">
                <button type="button" className="pc-btn" disabled={busy !== null} onClick={() => void check()}>
                  {busy === "check" ? "Checking…" : "Check now"}
                </button>
                {data.message && <span className="pc-hint" style={{ margin: 0 }}>{data.message}</span>}
              </div>
              <div className="pc-hint">The owner sees the same records in their Settings, Domain. The secure certificate is issued once the domain is added in Vercel and the records are in place.</div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
