"use client";

/**
 * /gang-sheets — straight into the builder.
 *
 * This used to be a hub between the product page and the builder: the same
 * size grid the product page had just shown, a "Build your own" button, a
 * welcome screen, and the buyer's past sheets. Choosing a size twice to reach
 * one tool was a step nobody needed, and past sheets already live under My
 * Print Jobs. So the page now only loads what the builder needs and opens it.
 *
 *   ?product=<id>   whose sheet sizes to use (falls back to the brand's set)
 *   ?size=<id>      the size picked on the product page
 *   ?qty=<n>        how many of that sheet the product page asked for
 *   ?edit=<id>      reopen a saved job that is still the buyer's to change
 *   ?auto=1         open on Auto Build
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { gangSheetsService, type GangSheetOrder, type GangSheetSize } from "@/services/gangSheets.service";
import { GangSheetStudio } from "@/components/storefront/GangSheetStudio";
import { useAuthStore } from "@/stores/auth.store";

interface Launch {
  sizes: GangSheetSize[];
  productId: string | null;
  sizeId: string | null;
  qty: number;
  resume: GangSheetOrder | null;
  auto: boolean;
}

export default function GangSheetBuilderPage() {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    // The builder saves to the buyer's account, so it needs one. Come back here
    // after signing in, with the same product and size.
    if (!isAuthenticated()) {
      const next = window.location.pathname + window.location.search;
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const productId = params.get("product");
    const sizeId = params.get("size");
    const editId = params.get("edit");
    let cancelled = false;

    (async () => {
      try {
        const [sizes, resume] = await Promise.all([
          gangSheetsService.listSizes(productId || undefined),
          editId ? gangSheetsService.myOrder(editId).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (!sizes.length) {
          setProblem("This product has no sheet sizes set up yet, so there's nothing to build on.");
          return;
        }
        if (editId && !resume) {
          setProblem("That gang sheet couldn't be opened — it may belong to another account or no longer exist.");
          return;
        }
        if (resume && resume.status !== "submitted" && resume.status !== "revision_requested") {
          setProblem("That gang sheet is already with the print team, so it can't be edited any more.");
          return;
        }
        setLaunch({
          sizes,
          productId: productId || resume?.product_id || null,
          sizeId: sizeId && sizes.some((s) => s.id === sizeId) ? sizeId : null,
          qty: Math.max(1, Math.min(999, parseInt(params.get("qty") || "1", 10) || 1)),
          resume,
          auto: params.get("auto") === "1",
        });
      } catch {
        if (!cancelled) setProblem("The builder couldn't load. Please refresh the page to try again.");
      }
    })();
    return () => { cancelled = true; };
  }, [isLoading, isAuthenticated]);

  // Close goes back to wherever the buyer came from — usually the product page.
  function leave() {
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/";
  }

  if (problem) {
    return (
      <div style={S.center}>
        <div style={S.card}>
          <div style={{ fontSize: "16px", fontWeight: 800, marginBottom: "6px" }}>Gang sheet builder</div>
          <p style={{ fontSize: "14px", color: "#555", lineHeight: 1.6, margin: "0 0 16px" }}>{problem}</p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={leave} style={S.primary}>Go back</button>
            <Link href="/account/gang-sheets" style={S.secondary}>My print jobs</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!launch) {
    return (
      <div style={S.center} role="status" aria-live="polite">
        <style>{"@keyframes gsspin{to{transform:rotate(360deg)}}"}</style>
        <div style={S.spinner} />
        <div style={{ fontSize: "15px", fontWeight: 700, marginTop: "18px" }}>Opening your builder…</div>
      </div>
    );
  }

  return (
    <GangSheetStudio
      sizes={launch.sizes}
      productId={launch.productId}
      contactName={[user?.first_name, user?.last_name].filter(Boolean).join(" ") || undefined}
      contactEmail={user?.email}
      autoStart={launch.auto}
      initialSizeId={launch.sizeId}
      initialQty={launch.qty}
      resumeOrder={launch.resume}
      onClose={leave}
      // "Save" keeps the sheet without buying it; it is then waiting under My
      // Print Jobs. "Save & Add to Cart" goes to the cart on its own.
      onSaved={() => { window.location.href = "/account/gang-sheets?saved=1"; }}
    />
  );
}

const S: Record<string, React.CSSProperties> = {
  center: { minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center" },
  card: { maxWidth: "440px", background: "#fff", border: "1px solid #E8E6E1", borderRadius: "12px", padding: "26px" },
  spinner: { width: "44px", height: "44px", borderRadius: "50%", border: "4px solid #E5E3DE", borderTopColor: "var(--brand-primary, #1C3557)", animation: "gsspin .8s linear infinite" },
  primary: { padding: "10px 18px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  secondary: { padding: "10px 18px", background: "#fff", color: "#1A1A1A", border: "1px solid #D8D5CF", borderRadius: "8px", fontSize: "13px", fontWeight: 700, textDecoration: "none" },
};
