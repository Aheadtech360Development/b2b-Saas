/**
 * The buyer's app: Shop, Cart, Orders and Account, with the screens each one
 * opens on top of it.
 *
 * Like the console, the navigation is a little state rather than a library:
 * which tab, and a short stack of screens opened from it. Switching tab goes
 * back to that tab's first screen; Back (and Android's back button) closes the
 * screen on top.
 */
import { useCallback, useEffect, useState } from "react";
import { BackHandler, Linking, ScrollView, StyleSheet, View } from "react-native";

import { signOut } from "@/api/auth";
import { currentShop, type Shop } from "@/api/shop";
import { cart as fetchCart, type Cart, type PlacedOrder } from "@/api/shopping";
import { TabBar } from "@/admin/TabBar";
import type { Tab } from "@/admin/tabs";
import { AccountScreen } from "@/screens/AccountScreen";
import { CartScreen } from "@/shop/CartScreen";
import { CatalogScreen } from "@/shop/CatalogScreen";
import { CheckoutScreen } from "@/shop/CheckoutScreen";
import { OrderScreen, OrdersScreen, PlacedScreen } from "@/shop/OrdersScreen";
import { BAR_SPACE } from "@/shop/parts";
import { ProductScreen } from "@/shop/ProductScreen";
import type { Session } from "@/session/store";
import { Button, Hero, Lede } from "@/ui/components";
import { accentFor, palette, space } from "@/ui/theme";

export const SHOP_TABS: Tab[] = [
  { key: "shop", label: "Shop", icon: "storefront-outline", iconActive: "storefront" },
  { key: "cart", label: "Cart", icon: "cart-outline", iconActive: "cart" },
  { key: "orders", label: "Orders", icon: "receipt-outline", iconActive: "receipt" },
  { key: "account", label: "Account", icon: "person-outline", iconActive: "person" },
];

export type Screen =
  | { name: "product"; slug: string }
  | { name: "checkout" }
  | { name: "placed"; order: PlacedOrder }
  | { name: "order"; number: string };

export function ShopApp({ session, onSignedOut }: { session: Session; onSignedOut: () => void }) {
  const [tab, setTab] = useState("shop");
  const [stack, setStack] = useState<Screen[]>([]);
  const [shopName, setShopName] = useState("Shop");
  const [accent, setAccent] = useState(palette.ink);
  const [units, setUnits] = useState(0);
  // The branded buyer app is sold on Scale: a buyer of a shop without it is
  // told so, and sent to the shop's website, instead of shopping here.
  const [notOnApp, setNotOnApp] = useState<Shop | null>(null);
  // A buyer whose account has no company yet (a wholesale application not yet
  // approved) can look around but not order: the cart refuses them.
  const canOrder = !!session.companyId;

  useEffect(() => {
    if (!session.tenantSlug) return;
    currentShop(session.tenantSlug)
      .then((shop) => {
        if (shop.name) setShopName(shop.name);
        setAccent(accentFor(shop.primaryColor));
        if (!shop.buyerApp) setNotOnApp(shop);
      })
      .catch(() => { /* a label only; the shop still opens */ });
  }, [session.tenantSlug]);

  const countCart = useCallback((c: Cart) => setUnits(c.units), []);
  useEffect(() => {
    if (canOrder) fetchCart().then(countCart).catch(() => setUnits(0));
  }, [canOrder, countCart]);

  const push = useCallback((s: Screen) => setStack((st) => [...st, s]), []);
  const pop = useCallback(() => setStack((st) => st.slice(0, -1)), []);
  const goTab = useCallback((key: string) => { setStack([]); setTab(key); }, []);

  // Android's back button closes the screen on top, then goes back to Shop,
  // and only then leaves the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stack.length) { pop(); return true; }
      if (tab !== "shop") { goTab("shop"); return true; }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, tab, pop, goTab]);

  const top = stack[stack.length - 1];
  let body: React.ReactNode;
  if (top?.name === "product") {
    body = (
      <ProductScreen key={top.slug} slug={top.slug} tenantSlug={session.tenantSlug} canOrder={canOrder} accent={accent}
        onBack={pop} onAdded={countCart} onCart={() => goTab("cart")} />
    );
  } else if (top?.name === "checkout") {
    body = (
      <CheckoutScreen shopName={shopName} accent={accent} onBack={pop}
        onPlaced={(order) => { setUnits(0); setStack([{ name: "placed", order }]); }} />
    );
  } else if (top?.name === "placed") {
    body = (
      <PlacedScreen order={top.order} accent={accent}
        onView={() => { setTab("orders"); setStack([{ name: "order", number: top.order.number }]); }}
        onShop={() => goTab("shop")} />
    );
  } else if (top?.name === "order") {
    body = <OrderScreen key={top.number} number={top.number} accent={accent} onBack={pop} />;
  } else if (tab === "cart") {
    body = (
      <CartScreen shopName={shopName} accent={accent} canOrder={canOrder} onChanged={countCart}
        onCheckout={() => push({ name: "checkout" })} onShop={() => goTab("shop")} />
    );
  } else if (tab === "orders") {
    body = <OrdersScreen shopName={shopName} canOrder={canOrder} onOpen={(number) => push({ name: "order", number })} />;
  } else if (tab === "account") {
    body = <AccountScreen session={session} onSignedOut={onSignedOut} bottomSpace={BAR_SPACE} hideOrders />;
  } else {
    body = <CatalogScreen shopName={shopName} accent={accent} onOpen={(slug) => push({ name: "product", slug })} />;
  }

  if (notOnApp) {
    const website = notOnApp.website;
    return (
      <ScrollView style={s.root} contentContainerStyle={s.closed}>
        <Hero>{notOnApp.name || shopName} is not on the app</Hero>
        <Lede>
          {notOnApp.name || "This shop"} does not offer shopping in the PrintCoPilot app. You can still order on its website with the same account.
        </Lede>
        <View style={s.gap} />
        {website ? <Button title="Open the website" accent={accent} onPress={() => { Linking.openURL(website); }} /> : null}
        <View style={s.gapSm} />
        <Button title="Sign out" variant="quiet" accent={accent} onPress={() => { signOut().finally(onSignedOut); }} />
      </ScrollView>
    );
  }

  return (
    <View style={s.root}>
      <View style={s.body}>{body}</View>
      <TabBar current={tab} onPick={goTab} tabs={SHOP_TABS} isActive={(k, c) => k === c} badges={{ cart: units }} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.page },
  body: { flex: 1 },
  closed: { padding: space.lg, paddingTop: 120, paddingBottom: space.xl },
  gap: { height: space.lg },
  gapSm: { height: space.sm },
});
