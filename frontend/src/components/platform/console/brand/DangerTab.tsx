"use client";

/**
 * The actions that close or remove a brand (design screen 6), away from the
 * safe ones. Suspend and cancel hold the shop: its people cannot sign in or
 * work in it, and a Stripe event cannot reopen it, until it is restored here.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ask, askText, tell } from "@/lib/dialog";
import { platformService } from "@/services/platform.service";
import type { BrandTabProps } from "../BrandPage";
import { day, errorText } from "../ui";

export function DangerTab({ brand, reload }: BrandTabProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const closed = brand.status !== "active";

  async function act(key: string, run: () => Promise<unknown>, after?: () => void) {
    setBusy(key);
    try {
      await run();
      if (after) after(); else await reload();
    } catch (e) {
      await tell(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function close(status: "suspended" | "cancelled") {
    const reason = await askText(
      status === "suspended"
        ? `Why is ${brand.name} being suspended? Kept with the suspension and in the activity log.`
        : `Why is ${brand.name} being cancelled? Kept with it and in the activity log.`,
      "", { title: status === "suspended" ? "Suspend the brand" : "Suspend and cancel", ok: status === "suspended" ? "Suspend" : "Cancel the brand", danger: true });
    if (reason === null) return;
    await act(status, () => status === "suspended"
      ? platformService.updateTenant(brand.slug, { status, reason: reason.trim() || undefined })
      : platformService.deleteTenant(brand.slug, reason.trim() || undefined));
  }

  async function typed(what: string): Promise<boolean> {
    const answer = await askText(`Type ${brand.slug} to confirm. This cannot be undone.`, "", { title: what, ok: what, danger: true });
    return answer !== null && answer.trim().toLowerCase() === brand.slug.toLowerCase();
  }

  return (
    <section className="pc-card pc-danger">
      <div className="pc-danger-row">
        <div style={{ maxWidth: 560 }}>
          <div className="pc-h2" style={{ fontSize: 16 }}>{closed ? "Restore the brand" : "Suspend and cancel (reversible)"}</div>
          <p className="pc-hint">
            {closed
              ? `${brand.name} is ${brand.status}${brand.hold?.at ? ` since ${day(brand.hold.at)}` : ""}${brand.hold?.reason ? `: ${brand.hold.reason}` : ""}. Restoring opens its store, sign-in and admin again.`
              : "The brand loses access until you restore it: its store closes, and its owner and staff cannot sign in or keep working in its admin. A Stripe payment does not reopen it."}
          </p>
        </div>
        <div className="pc-row-actions">
          {closed ? (
            <button type="button" className="pc-btn" data-kind="primary" disabled={busy !== null}
              onClick={() => void act("restore", () => platformService.updateTenant(brand.slug, { status: "active" }))}>
              {busy === "restore" ? "Restoring…" : "Restore"}
            </button>
          ) : (
            <>
              <button type="button" className="pc-btn" data-kind="danger" disabled={busy !== null} onClick={() => void close("suspended")}>Suspend</button>
              <button type="button" className="pc-btn" data-kind="danger" disabled={busy !== null} onClick={() => void close("cancelled")}>Suspend and cancel</button>
            </>
          )}
        </div>
      </div>

      <div className="pc-danger-row">
        <div style={{ maxWidth: 560 }}>
          <div className="pc-h2" style={{ fontSize: 16 }}>Clear the test data</div>
          <p className="pc-hint">Removes the trial run: orders, built gang sheets, returns, refunds, disputes, carts, discount uses and customer totals. Keeps products, customers, staff, settings, the site and suppliers.</p>
        </div>
        <button type="button" className="pc-btn" data-kind="danger" disabled={busy !== null} onClick={() => void (async () => {
          if (!(await typed("Clear the test data"))) return;
          await act("clear", async () => {
            const r = await platformService.clearTestData(brand.slug, brand.slug);
            await tell(r.total ? `Removed ${Object.entries(r.removed).map(([k, n]) => `${n} ${k}`).join(", ")}. Kept: ${r.kept}.` : "There was nothing to clear.");
          });
        })()}>Clear test data</button>
      </div>

      <div className="pc-danger-row">
        <div style={{ maxWidth: 560 }}>
          <div className="pc-h2" style={{ fontSize: 16, color: "var(--pc-red)" }}>Permanently delete</div>
          <p className="pc-hint">Deletes the brand and all its products, orders, customers and users. This cannot be undone.</p>
        </div>
        <button type="button" className="pc-btn" data-kind="danger" disabled={busy !== null} onClick={() => void (async () => {
          if (!(await typed("Permanently delete"))) return;
          if (!(await ask(`Last chance: delete ${brand.name} and everything in it for good?`, { ok: "Delete for good", danger: true }))) return;
          await act("purge", () => platformService.purgeTenant(brand.slug), () => router.replace("/platform"));
        })()}>Permanently delete</button>
      </div>
    </section>
  );
}
