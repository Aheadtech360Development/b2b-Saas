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
import { cartService } from "@/services/cart.service";
import { useAuthStore } from "@/stores/auth.store";

export interface ThemeVariant {
  id: string;
  colour: string;
  size: string;
  price: number | null;
  stock: number;
  sku: string;
}

export interface ThemeProductData {
  id: string;
  slug: string;
  name: string;
  pricing_mode: string;
  from_price: number | null;
  variants: ThemeVariant[];
  colours: { label: string; hex: string }[];
  sizes: { label: string }[];
  options: { id: string; name: string; required: boolean; values: { id: string; label: string }[] }[];
  qty_tiers: { min_qty: number; unit_price: number }[];
  gang_sheet: boolean;
}

const money = (value: number) => `$${value.toFixed(2)}`;

export default function ThemeProductBuy({ product }: { product: ThemeProductData }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(`[data-product-id="${CSS.escape(product.id)}"]`);
    if (!root) return;

    // ── What the shopper has chosen so far ──
    const chosen: Record<string, string> = {};   // option id → value id
    let colour = product.colours[0]?.label ?? "";
    let size = product.sizes[0]?.label ?? "";
    let quantity = 1;

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

    // ── Choosing ──
    const cleanups: (() => void)[] = [];

    groups.forEach((group) => {
      const optionId = group.dataset.optionId ?? "";
      const items = Array.from(group.querySelectorAll<HTMLElement>("[data-label]"));
      const label = (group.querySelector(".vlabel, label")?.textContent ?? "").trim().toLowerCase();

      items.forEach((item) => {
        if (item.classList.contains("selected")) {
          if (optionId) chosen[optionId] = item.dataset.valueId ?? "";
          else if (label.startsWith("colo")) colour = item.dataset.label ?? colour;
          else if (label.startsWith("size")) size = item.dataset.label ?? size;
        }
        const onClick = (e: Event) => {
          e.preventDefault();
          items.forEach((other) => other.classList.remove("selected"));
          item.classList.add("selected");
          if (optionId) chosen[optionId] = item.dataset.valueId ?? "";
          else if (label.startsWith("colo")) colour = item.dataset.label ?? "";
          else if (label.startsWith("size")) size = item.dataset.label ?? "";
          setMessage(null);
          if (matrix) showPrice(); else void repriceFromServer();
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
        if (matrix) showPrice(); else void repriceFromServer();
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

        // A product that is made from artwork is ordered in its builder.
        if (button.dataset.themeBuy === "upload" || product.gang_sheet) {
          router.push(`/products/${product.slug}`);
          return;
        }
        if (!isAuthenticated) {
          say("Sign in to your wholesale account to order.", false);
          window.setTimeout(() => router.push("/login"), 1200);
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
            await cartService.addMatrix(product.id, [{ variant_id: variant.id, quantity }]);
          } else {
            const missing = product.options.find((o) => o.required && !chosen[o.id]);
            if (missing) { say(`Choose ${missing.name.toLowerCase()} first.`, false); return; }
            await apiClient.post("/api/v1/cart/add-configured", {
              product_id: product.id, selections: chosen, quantity,
            });
          }
          window.dispatchEvent(new Event("cart_updated"));
          say("Added to your cart.");
        } catch (err) {
          const status = err instanceof ApiClientError ? err.status : 0;
          if (status === 401 || status === 403) {
            say("Sign in to your wholesale account to order.", false);
            window.setTimeout(() => router.push("/login"), 1200);
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
  }, [product, isAuthenticated, router]);

  if (!message) return null;
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
