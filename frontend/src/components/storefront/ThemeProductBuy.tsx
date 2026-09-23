"use client";

/**
 * Makes the design's own buying controls work.
 *
 * The product page is the design's markup, filled with the store's product
 * (backend services/theme_product.py). This binds behaviour to the controls
 * that are already there — the colour swatches, the size buttons, the
 * quantity box, the price line and the button — so choosing a colour picks a
 * real variant, the price is the price of that variant, and Add to cart adds
 * it to the same cart everything else uses.
 *
 * Nothing is drawn here. If the design changes, these controls move with it;
 * they are found by the marks the renderer put on them.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { UploadBySizeModal } from "@/components/storefront/UploadBySizeModal";
import type { ProductDetail } from "@/types/product.types";
import { cartService } from "@/services/cart.service";
import { useAuthStore } from "@/stores/auth.store";
import { trackAddToCart } from "@/lib/tracking";
import { addToGuestCart, configuredKey } from "@/lib/guestCart";

export interface ThemeVariant {
  id: string;
  colour: string;
  size: string;
  price: number | null;
  stock: number;
  sku: string;
}

/** One of the sheet sizes this gang-sheet product is sold in. */
export interface ThemeSheet {
  sheet_id: string;
  label: string;
  price: number;
  width_in: number;
  height_in: number;
  custom_length: boolean;
  price_per_inch: number;
  min_length_in: number;
  max_length_in: number;
}

export interface ThemeProductData {
  id: string;
  slug: string;
  name: string;
  pricing_mode: string;
  from_price: number | null;
  images: { url: string; alt: string }[];
  variants: ThemeVariant[];
  colours: { label: string; hex: string }[];
  sizes: { label: string }[];
  options: { id: string; name: string; required: boolean; values: { id: string; label: string }[] }[];
  qty_tiers: { min_qty: number; unit_price: number }[];
  gang_sheet: boolean;
  gang_sheet_type?: string;
  gang_sheet_config?: ProductDetail["gang_sheet_config"];
  sheets?: ThemeSheet[];
  builder_href?: string;
}

const money = (value: number) => `$${value.toFixed(2)}`;

export default function ThemeProductBuy({ product }: { product: ThemeProductData }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const busy = useRef(false);
  const byUpload = product.gang_sheet && product.gang_sheet_type === "upload_by_size";

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(`[data-product-id="${CSS.escape(product.id)}"]`);
    if (!root) return;

    // ── What the shopper has chosen so far ──
    const chosen: Record<string, string> = {};   // option id → value id
    let colour = product.colours[0]?.label ?? "";
    let size = product.sizes[0]?.label ?? "";
    let quantity = 1;

    // A gang sheet is chosen by the sheet, not by a variant: these are the
    // sizes the brand set up for this product, in the order it set them.
    const sheets = product.sheets ?? [];
    let sheetId = sheets[0]?.sheet_id ?? "";

    const priceLine = root.querySelector<HTMLElement>("[data-theme-price]");
    const qtyBox = root.querySelector<HTMLElement>("[data-theme-qty]");
    const qtyValue = qtyBox?.querySelector<HTMLElement>("span, input");
    const buyButtons = Array.from(root.querySelectorAll<HTMLElement>("[data-theme-buy]"));
    const groups = Array.from(root.querySelectorAll<HTMLElement>(".variant-group"));

    const matrix = product.pricing_mode !== "configurable";

    function variantFor(c: string, z: string): ThemeVariant | undefined {
      return product.variants.find(
        (v) => (!c || v.colour === c) && (!z || v.size === z),
      );
    }

    function say(text: string, ok = true) {
      setMessage({ ok, text });
      if (ok) window.setTimeout(() => setMessage(null), 4000);
    }

    /** The price of what is currently chosen, straight from the store. */
    function showPrice() {
      if (!priceLine) return;
      if (sheets.length) {
        // Priced by the sheet: what one costs at the size chosen, times how
        // many of them.
        const sheet = sheets.find((s) => s.sheet_id === sheetId) ?? sheets[0];
        if (!sheet) return;
        priceLine.textContent = quantity > 1
          ? `${money(sheet.price)} each · ${money(sheet.price * quantity)}`
          : money(sheet.price);
        return;
      }
      if (matrix) {
        const variant = variantFor(colour, size);
        const unit = variant?.price ?? product.from_price;
        if (unit == null) return;
        const keep = priceLine.querySelector(".from");
        priceLine.textContent = "";
        if (keep) priceLine.appendChild(keep);
        priceLine.append(quantity > 1 ? `${money(unit)} each · ${money(unit * quantity)}` : money(unit));
        if (variant && variant.stock <= 0) say("That size is out of stock in this colour.", false);
      }
    }

    /** For a product priced from its options, the server does the arithmetic. */
    async function repriceFromServer() {
      if (matrix || !priceLine) return;
      try {
        const r = await apiClient.post<{ unit_price: number; total: number }>(
          `/api/v1/products/${product.id}/price`, { selections: chosen, quantity },
        );
        const keep = priceLine.querySelector(".from");
        priceLine.textContent = "";
        if (keep) priceLine.appendChild(keep);
        priceLine.append(quantity > 1 ? `${money(r.unit_price)} each · ${money(r.total)}` : money(r.unit_price));
      } catch {
        /* leave the price as it was rendered */
      }
    }

    /** Whatever kind of product this is, show what it now costs. */
    function refresh() {
      if (sheets.length || matrix) showPrice();
      else void repriceFromServer();
    }

    /** This product's builder, at the size and quantity chosen here. */
    function builderHref() {
      const base = product.builder_href || `/products/${product.slug}`;
      const cut = base.indexOf("?");
      const path = cut < 0 ? base : base.slice(0, cut);
      const params = new URLSearchParams(cut < 0 ? "" : base.slice(cut + 1));
      if (sheets.length) {
        if (sheetId) params.set("size", sheetId);
        if (quantity > 1) params.set("qty", String(quantity));
      }
      // Hosts without wildcard subdomains carry the brand in ?tenant=; losing
      // it on the way to the builder would lose the brand with it.
      const tenant = new URLSearchParams(window.location.search).get("tenant");
      if (tenant) params.set("tenant", tenant);
      const query = params.toString();
      return query ? `${path}?${query}` : path;
    }

    // ── Choosing ──
    const cleanups: (() => void)[] = [];

    groups.forEach((group) => {
      const optionId = group.dataset.optionId ?? "";
      const items = Array.from(group.querySelectorAll<HTMLElement>("[data-label]"));
      const labelEl = group.querySelector<HTMLElement>(".vlabel, label");
      // The label keeps its own wording and gains what is chosen: "Color:
      // Forest" tells a shopper what that swatch actually is.
      const baseLabel = (labelEl?.dataset.baseLabel ?? labelEl?.textContent ?? "").trim().replace(/:\s*$/, "");
      if (labelEl) labelEl.dataset.baseLabel = baseLabel;
      const label = baseLabel.toLowerCase();

      const showChoice = (chosenLabel: string) => {
        if (!labelEl || !baseLabel) return;
        labelEl.textContent = chosenLabel ? `${baseLabel}: ${chosenLabel}` : baseLabel;
      };

      items.forEach((item) => {
        if (item.classList.contains("selected")) {
          if (item.dataset.sheetId) sheetId = item.dataset.sheetId;
          else if (optionId) chosen[optionId] = item.dataset.valueId ?? "";
          else if (label.startsWith("colo")) colour = item.dataset.label ?? colour;
          else if (label.startsWith("size")) size = item.dataset.label ?? size;
          showChoice(item.dataset.label ?? "");
        }
        const onClick = (e: Event) => {
          e.preventDefault();
          items.forEach((other) => other.classList.remove("selected"));
          item.classList.add("selected");
          if (item.dataset.sheetId) sheetId = item.dataset.sheetId;
          else if (optionId) chosen[optionId] = item.dataset.valueId ?? "";
          else if (label.startsWith("colo")) colour = item.dataset.label ?? "";
          else if (label.startsWith("size")) size = item.dataset.label ?? "";
          showChoice(item.dataset.label ?? "");
          setMessage(null);
          refresh();
        };
        item.addEventListener("click", onClick);
        item.style.cursor = "pointer";
        cleanups.push(() => item.removeEventListener("click", onClick));
      });
    });

    // ── How many ──
    if (qtyBox) {
      const buttons = Array.from(qtyBox.querySelectorAll("button"));
      const setQty = (next: number) => {
        quantity = Math.max(1, next);
        if (qtyValue) {
          if (qtyValue instanceof HTMLInputElement) qtyValue.value = String(quantity);
          else qtyValue.textContent = String(quantity);
        }
        refresh();
      };
      buttons.forEach((button) => {
        const down = (button.textContent ?? "").includes("−") || (button.textContent ?? "").trim() === "-";
        const onClick = (e: Event) => { e.preventDefault(); setQty(quantity + (down ? -1 : 1)); };
        button.addEventListener("click", onClick);
        cleanups.push(() => button.removeEventListener("click", onClick));
      });
      if (qtyValue instanceof HTMLInputElement) {
        const onInput = () => setQty(parseInt(qtyValue.value, 10) || 1);
        qtyValue.addEventListener("input", onInput);
        cleanups.push(() => qtyValue.removeEventListener("input", onInput));
      }
    }

    // ── Buying ──
    buyButtons.forEach((button) => {
      const onClick = async (e: Event) => {
        e.preventDefault();
        if (busy.current) return;

        // A product made from artwork is ordered in its builder, carrying the
        // sheet size and quantity chosen here so nothing is asked twice.
        if (button.dataset.themeBuy === "builder" || button.dataset.themeBuy === "upload" || product.gang_sheet) {
          // One design at one size is uploaded right here; a sheet several
          // designs share is arranged in the builder.
          if (byUpload) setUploadOpen(true);
          else router.push(builderHref());
          return;
        }
        busy.current = true;
        const original = button.textContent;
        button.textContent = "Adding…";
        try {
          if (matrix) {
            const variant = variantFor(colour, size);
            if (!variant) { say("Choose a colour and size first.", false); return; }
            if (variant.stock <= 0) { say("That one is out of stock.", false); return; }
            if (isAuthenticated) {
              await cartService.addMatrix(product.id, [{ variant_id: variant.id, quantity }]);
            } else {
              // No account needed to shop: the same guest cart the rest of the
              // storefront keeps, and the same guest checkout at the end of it.
              addToGuestCart({
                variant_id: variant.id, quantity, product_id: product.id, product_name: product.name,
                slug: product.slug, color: variant.colour || null, size: variant.size || null,
                unit_price: variant.price ?? 0,
                // Without this the cart drew a grey placeholder next to a
                // product the shopper had just been looking at a photo of.
                image_url: product.images?.[0]?.url ?? null,
              });
              window.dispatchEvent(new Event("cart_updated"));
              trackAddToCart([{
                id: variant.id, sku: variant.sku, name: product.name,
                price: variant.price ?? 0, quantity,
                variant: [variant.colour, variant.size].filter(Boolean).join(" / "),
              }]);
              say("Added to your cart.");
              return;
            }
          } else {
            const missing = product.options.find((o) => o.required && !chosen[o.id]);
            if (missing) { say(`Choose ${missing.name.toLowerCase()} first.`, false); return; }
            if (isAuthenticated) {
              await apiClient.post("/api/v1/cart/add-configured", {
                product_id: product.id, selections: chosen, quantity,
              });
            } else {
              // No account needed for a made-to-order product either: the
              // choices travel with the line and the server prices them again
              // at checkout, so a guest pays exactly what anyone else does.
              const priced = await apiClient.post<{ unit_price: number }>(
                `/api/v1/products/${product.id}/price`, { selections: chosen, quantity },
              );
              const names = product.options
                .map((o) => o.values.find((v) => v.id === chosen[o.id])?.label)
                .filter(Boolean)
                .join(" · ");
              addToGuestCart({
                variant_id: configuredKey(product.id, chosen),
                quantity,
                product_id: product.id,
                product_name: names ? `${product.name} — ${names}` : product.name,
                slug: product.slug,
                color: null,
                size: null,
                unit_price: priced.unit_price,
                image_url: product.images?.[0]?.url ?? null,
                selections: { ...chosen },
              });
              say("Added to your cart.");
              return;
            }
          }
          window.dispatchEvent(new Event("cart_updated"));
          say("Added to your cart.");
        } catch (err) {
          const status = err instanceof ApiClientError ? err.status : 0;
          if (status === 401 || status === 403) {
            say("Please sign in again to finish that.", false);
            window.setTimeout(() => router.push("/login"), 1400);
          } else {
            say(err instanceof ApiClientError && err.message ? err.message : "Could not add that to your cart.", false);
          }
        } finally {
          button.textContent = original;
          busy.current = false;
        }
      };
      button.addEventListener("click", onClick);
      cleanups.push(() => button.removeEventListener("click", onClick));
    });

    showPrice();
    return () => cleanups.forEach((off) => off());
  }, [product, isAuthenticated, router, byUpload]);

  return (
    <>
      {uploadOpen && (
        <UploadBySizeModal
          product={{ id: product.id, gang_sheet_config: product.gang_sheet_config ?? null }}
          onClose={() => setUploadOpen(false)}
        />
      )}
      {message && messageBar(message)}
    </>
  );
}

function messageBar(message: { ok: boolean; text: string }) {
  return (
    <div
      role="status"
      style={{
        position: "fixed", left: "50%", bottom: "24px", transform: "translateX(-50%)", zIndex: 60,
        background: message.ok ? "#0F5132" : "#842029", color: "#fff", padding: "12px 20px",
        borderRadius: "8px", fontSize: "14px", fontFamily: "system-ui, sans-serif", maxWidth: "92vw",
        boxShadow: "0 8px 24px rgba(0,0,0,.18)",
      }}
    >
      {message.text}
      {message.ok && (
        <a href="/cart" style={{ color: "#fff", marginLeft: "12px", fontWeight: 700 }}>View cart →</a>
      )}
    </div>
  );
}
