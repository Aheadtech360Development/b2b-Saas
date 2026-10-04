// frontend/src/app/(customer)/cart/page.tsx
import CartView from "@/components/storefront/CartView";
import { BuilderPage } from "@/components/builder/SiteParts";
import { loadBuilderPage } from "@/lib/builder/load";
import { findType } from "@/lib/builder/tree";
import CartIsland from "@/components/builder/islands/CartIsland";

/**
 * The cart. A shop on the visual builder draws it inside its cart template —
 * the template decides what goes around it, and the cart itself is the same
 * component every other shop gets here. Every other shop: unchanged.
 */
export default async function CartPage() {
  const site = await loadBuilderPage("cart");
  if (site) {
    // A cart template made before the cart element existed still shows the
    // cart, under whatever the template has.
    const placed = findType(site.template, "cart_items");
    return <BuilderPage payload={site} after={placed ? null : <CartIsland id="" />} />;
  }
  return <CartView />;
}
