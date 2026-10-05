"use client";

/**
 * "Website template" on a product's or collection's own admin page.
 *
 * Which template a page is drawn with is part of the website's design, and the
 * design is drafted and then published. So unlike the fields around it, a
 * choice made here is not live when it is saved: it goes into the Website
 * builder's draft — the same place the builder's Templates panel puts it —
 * and reaches shoppers at the next publish. The field says so, every time,
 * and says what shoppers see in the meantime.
 *
 * A brand that has never opened the Website builder has no templates to
 * choose from, and this draws nothing.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ApiClientError } from "@/lib/api-client";
import { builderService, type TemplateAssignment } from "@/services/builder.service";

type Kind = "product" | "collection";

const NOTE: CSSProperties = {
  display: "flex", gap: "8px", alignItems: "flex-start", marginTop: "10px", padding: "9px 11px",
  borderRadius: "9px", fontSize: "12.5px", lineHeight: 1.45,
};
const TONES: Record<"draft" | "live" | "quiet" | "bad", CSSProperties> = {
  draft: { background: "#FFF8EB", color: "#7A4A00", border: "1px solid #F5E1B8" },
  live: { background: "#ECFDF3", color: "#05603A", border: "1px solid #C6EFD8" },
  quiet: { background: "#F6F6F4", color: "#4A4850", border: "1px solid #ECECEC" },
  bad: { background: "#FEF3F2", color: "#912018", border: "1px solid #F8D3CF" },
};
const DOT: CSSProperties = { width: "7px", height: "7px", borderRadius: "50%", background: "currentColor", marginTop: "6px", flex: "0 0 auto" };
// A new tab, so whatever is unsaved on this page is not lost by going to
// publish. "opener" hands that tab this tab's sign-in, which is kept per tab.
const NEW_TAB = { target: "_blank", rel: "opener" } as const;
const LINK: CSSProperties = { color: "inherit", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: "2px", whiteSpace: "nowrap" };

export function WebsiteTemplateField({ kind, recordId, selectStyle, wrap }: {
  kind: Kind;
  recordId: string;
  selectStyle?: CSSProperties;
  /** The page's own card or label around the field; not drawn when there is nothing to choose. */
  wrap: (body: ReactNode) => ReactNode;
}) {
  const [state, setState] = useState<TemplateAssignment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setState(null);
    setError("");
    if (!recordId) return;
    // No builder, or no permission to the shop's design: nothing to show.
    builderService.assignment(kind, recordId).then((s) => { if (live) setState(s); }).catch(() => { if (live) setState(null); });
    return () => { live = false; };
  }, [kind, recordId]);

  if (!state?.available) return null;

  const templates = state.templates ?? [];
  const defaultId = state.defaultId ?? "default";
  const defaultName = templates.find((t) => t.id === defaultId)?.name ?? "Default";
  const others = templates.filter((t) => t.id !== defaultId);
  // Chosen explicitly but the same as the default: that is the default.
  const value = state.assigned && state.assigned !== defaultId ? state.assigned : "";
  const noun = kind === "product" ? "product" : "collection";
  const liveName = state.live?.name || "the default template";

  async function choose(template: string) {
    setBusy(true);
    setError("");
    try {
      setState(await builderService.assign(kind, recordId, template));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "That did not save. Check your connection and try again.");
      // Show what is really saved, not what was picked.
      builderService.assignment(kind, recordId).then(setState).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  let tone: keyof typeof TONES = "quiet";
  let status: ReactNode;
  if (error) {
    tone = "bad";
    status = <>{error} Nothing was changed.</>;
  } else if (busy) {
    status = <>Saving to the website draft…</>;
  } else if (state.mode !== "visual_builder") {
    status = <>Saved in the website draft. Your shop is showing its imported theme, so shoppers will see this once you publish the website and switch the shop over to it.</>;
  } else if (!state.live) {
    tone = "draft";
    status = <>Saved in the website draft. Your website has not been published yet.</>;
  } else if (state.pending) {
    tone = "draft";
    status = (
      <>
        <b>In the website draft — not live yet.</b> Shoppers still see “{liveName}” until you publish the website.{" "}
        <a href="/site-builder" {...NEW_TAB} style={LINK}>Open Website builder to publish →</a>
      </>
    );
  } else {
    tone = "live";
    status = <>Live: shoppers see this {noun} with “{liveName}”.</>;
  }

  return wrap(
    <>
      <select value={value} disabled={busy} onChange={(e) => void choose(e.target.value)} style={selectStyle} aria-label="Website template">
        <option value="">Default — {defaultName}</option>
        {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <div style={{ ...NOTE, ...TONES[tone] }} role="status" data-template-status={error ? "error" : busy ? "saving" : state.pending ? "draft" : state.live ? "live" : "unpublished"}>
        <span style={DOT} aria-hidden />
        <span>{status}</span>
      </div>
      <p style={{ fontSize: "12px", color: "#7A7880", marginTop: "8px", marginBottom: 0, lineHeight: 1.5 }}>
        Which Website builder template this {noun}&apos;s page is drawn with. It is part of your website&apos;s design, so a change here
        is saved to the website draft straight away — on its own, not with this page&apos;s Save button — and goes live when you publish the website.
        {others.length === 0 && <> You have one {noun} template so far; make another in the Website builder under Templates → New.</>}
        {" "}<a href="/site-builder" {...NEW_TAB} style={{ color: "#1A1A1A", fontWeight: 600 }}>Manage templates →</a>
      </p>
    </>,
  );
}
