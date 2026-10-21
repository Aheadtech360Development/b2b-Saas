"use client";

/**
 * A brand just made (design screen 8): what is left before it can sell, read
 * from the brand itself, and its store link.
 */
import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { consoleApi } from "./api";
import { Failed, Loading, useLoad } from "./ui";

export function BrandReady({ slug }: { slug: string }) {
  const { data, error, loading, reload } = useLoad(() => consoleApi.checklist(slug), [slug]);
  const [copied, setCopied] = useState(false);
  const link = data?.fallback_url ?? data?.store_url ?? "";

  return (
    <div>
      {error && <Failed message={error} onRetry={reload} />}
      {loading && !data ? <Loading what="Loading the brand" /> : null}
      {data && (
        <>
          <div className="pc-head">
            <div>
              <div className="pc-eyebrow">Brands</div>
              <h1 className="pc-h1">{data.brand.name} is ready</h1>
              <p className="pc-lede">The owner can sign in now. Here is what is left before they can sell.</p>
            </div>
            <div className="pc-row-actions">
              <Link href={`/platform/brands/${slug}`} className="pc-btn" data-kind="primary">Open brand</Link>
              <Link href="/platform" className="pc-btn">Back to Brands</Link>
            </div>
          </div>
          <div className="pc-cols" style={{ marginTop: 0 }}>
            <section className="pc-card">
              <div className="pc-card-head"><h2 className="pc-h2">Setup checklist</h2></div>
              <div style={{ paddingBottom: 8 }}>
                {data.steps.map((s) => (
                  <div key={s.key} className="pc-step" data-done={s.done ? "" : undefined}>
                    <span className="pc-step-dot">{s.done && <Check size={13} strokeWidth={3} />}</span>
                    <div>
                      <div className="pc-step-title">{s.label}{s.optional ? " (optional)" : ""}</div>
                      <div className="pc-step-detail">{s.detail}</div>
                    </div>
                    {s.done && <span className="pc-step-done">Done</span>}
                  </div>
                ))}
              </div>
            </section>
            <div className="pc-stack">
              <section className="pc-card">
                <div className="pc-card-head"><h2 className="pc-h2">Store link</h2></div>
                <div className="pc-panel-body">
                  <div className="pc-mono" style={{ overflowWrap: "anywhere" }}>{link}</div>
                  <button type="button" className="pc-btn" onClick={() => {
                    void navigator.clipboard?.writeText(link).then(() => setCopied(true));
                  }}>{copied ? "Copied" : "Copy"}</button>
                  <div className="pc-hint">This link works straight away.</div>
                </div>
              </section>
              <div className="pc-note">
                To do: add <b className="pc-mono">{data.vercel_host}</b> in Vercel, the project, Domains, so the shop&apos;s own address answers. The platform inbox has the same note.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
