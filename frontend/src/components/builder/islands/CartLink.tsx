"use client";

/**
 * The cart icon, with how many things are in it — counted the way the rest of
 * the storefront counts them: the account's cart once signed in, the guest
 * cart in this browser before that, and again whenever either changes.
 */
import { useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { GUEST_CART_KEY } from "@/lib/guestCart";
import { useAuthStore } from "@/stores/auth.store";

export default function CartLink({ id, showCount, edit }: { id: string; showCount: boolean; edit?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (edit || !showCount || isLoading) return;
    if (user && !user.is_admin) {
      const load = () => {
        apiClient.get<{ items: { quantity: number }[] }>("/api/v1/cart")
          .then((r) => setCount((r?.items ?? []).reduce((s, i) => s + i.quantity, 0)))
          .catch(() => {});
      };
      load();
      window.addEventListener("cart_updated", load);
      return () => window.removeEventListener("cart_updated", load);
    }
    const read = () => {
      try {
        const lines: { quantity: number }[] = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || "[]");
        setCount(lines.reduce((s, i) => s + (Number(i.quantity) || 0), 0));
      } catch {
        setCount(0);
      }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("af_guest_cart_updated", read);
    window.addEventListener("cart_updated", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("af_guest_cart_updated", read);
      window.removeEventListener("cart_updated", read);
    };
  }, [user, isLoading, showCount, edit]);

  return (
    <a data-b={id} className="b-iconlink" href="/cart" aria-label={count ? `Cart, ${count} items` : "Cart"}>
      <ShoppingCart size={21} aria-hidden />
      {showCount && count > 0 && <span className="b-count">{count > 99 ? "99+" : count}</span>}
    </a>
  );
}
