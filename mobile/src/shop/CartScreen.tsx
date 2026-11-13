/**
 * The cart: the same one the buyer has on the website, since it is kept on
 * the server against their account.
 *
 * Quantities change in place. What stops the order (a product's minimum, the
 * shop's minimum order, a line that can no longer be made) is said above the
 * button, in the shop's words, and the button waits until it is fixed.
 */
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ApiError } from "@/api/client";
import { cart as fetchCart, money, removeLine, setQuantity, type Cart } from "@/api/shopping";
import { BAR_SPACE, Centre, Header, Line, Stepper } from "@/shop/parts";
import { Button, Card, Notice } from "@/ui/components";
import { palette, radius, space, type } from "@/ui/theme";

export function CartScreen({ shopName, accent, canOrder, onCheckout, onShop, onChanged }: {
  shopName: string; accent: string; canOrder: boolean;
  onCheckout: () => void; onShop: () => void; onChanged: (cart: Cart) => void;
}) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const c = await fetchCart();
      setCart(c);
      onChanged(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your cart could not load.");
    }
  }, [onChanged]);

  useEffect(() => { if (canOrder) load(); }, [canOrder, load]);

  async function change(lineId: string, next: number | "remove") {
    setBusyLine(lineId);
    setError(null);
    try {
      const c = next === "remove" ? await removeLine(lineId) : await setQuantity(lineId, next);
      setCart(c);
      onChanged(c);
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "That change did not save.");
    }
    setBusyLine(null);
  }

  if (!canOrder) {
    return (
      <View style={s.page}>
        <Header kicker={shopName} title="Cart" />
        <Centre message="You can order once the shop has approved your account." />
      </View>
    );
  }
  if (!cart) {
    return (
      <View style={s.page}>
        <Header kicker={shopName} title="Cart" />
        {error ? <Centre message={error} action={<Button title="Try again" accent={accent} onPress={load} />} /> : <Centre busy />}
      </View>
    );
  }

  return (
    <View style={s.page}>
      <Header kicker={shopName} title="Cart" />
      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: BAR_SPACE + space.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={palette.muted}
          onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} />}
      >
        {error ? <Notice tone="bad">{error}</Notice> : null}
        {cart.lines.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.empty}>Your cart is empty.</Text>
            <Button title="Browse the shop" accent={accent} onPress={onShop} />
          </View>
        ) : (
          <>
            {cart.lines.map((l) => (
              <Card key={l.id}>
                <View style={s.line}>
                  <View style={s.thumb}>
                    {l.image ? <Image source={{ uri: l.image }} style={s.thumbImg} /> : <Ionicons name="shirt-outline" size={22} color={palette.muted} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.name} numberOfLines={2}>{l.productName}</Text>
                    {[l.color, l.size].filter(Boolean).length ? (
                      <Text style={s.meta}>{[l.color, l.size].filter(Boolean).join(" · ")}</Text>
                    ) : null}
                    <Text style={s.meta}>{money(l.unitPrice)} each</Text>
                    {l.problem ? <Text style={s.problem}>{l.problem}</Text> : null}
                  </View>
                  <Text style={s.total}>{money(l.lineTotal)}</Text>
                </View>
                <View style={s.lineActions}>
                  {l.fixed ? <Text style={s.meta}>Qty {l.quantity}</Text> : (
                    <Stepper value={l.quantity} busy={busyLine === l.id}
                      onChange={(n) => change(l.id, n)} />
                  )}
                  <Pressable onPress={() => change(l.id, "remove")} hitSlop={8} accessibilityRole="button"
                    accessibilityLabel={`Remove ${l.productName}`} style={s.remove}>
                    <Ionicons name="trash-outline" size={16} color={palette.bad} />
                    <Text style={s.removeText}>Remove</Text>
                  </Pressable>
                </View>
              </Card>
            ))}

            <Card>
              <Line label={`Subtotal (${cart.units} ${cart.units === 1 ? "item" : "items"})`} value={money(cart.subtotal)} strong />
              <Text style={s.meta}>Shipping and tax are worked out at checkout.</Text>
            </Card>

            {cart.blockers.map((b, i) => <Notice key={i} tone="warn">{b}</Notice>)}
            <Button
              title={cart.blockers.length ? "Fix the cart to check out" : "Checkout"}
              accent={accent}
              onPress={() => { if (!cart.blockers.length) onCheckout(); }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  body: { paddingHorizontal: space.lg, gap: space.sm },
  emptyBox: { paddingVertical: space.xl, gap: space.md },
  empty: { ...type.body, color: palette.ink70, textAlign: "center" },
  line: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  thumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: palette.lineSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  name: { ...type.bodyMedium, color: palette.ink, fontSize: 14.5, lineHeight: 20 },
  meta: { ...type.small, color: palette.ink70 },
  problem: { ...type.small, color: palette.bad, marginTop: 2 },
  total: { ...type.number, color: palette.ink },
  lineActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space.sm },
  remove: { flexDirection: "row", alignItems: "center", gap: 4, padding: 6 },
  removeText: { ...type.small, color: palette.bad },
});
