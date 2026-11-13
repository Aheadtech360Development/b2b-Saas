/**
 * The buyer's orders, newest first, and one order opened: what is in it, what
 * it cost, whether it is paid, and where it is.
 */
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { orders as fetchOrders, type OrderSummary } from "@/api/account";
import { money, order as fetchOrder, type OrderDetail, type PlacedOrder } from "@/api/shopping";
import { BAR_SPACE, Centre, Header, Line } from "@/shop/parts";
import { Button, Card, Notice, Pill, SectionLabel } from "@/ui/components";
import { palette, space, type } from "@/ui/theme";

const STATUS: Record<string, string> = {
  pending: "Received", confirmed: "Confirmed", processing: "Being made", ready_for_pickup: "Ready to collect",
  shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded",
};
const PAID: Record<string, string> = { paid: "Paid", unpaid: "Not paid yet", pending: "Payment pending", refunded: "Refunded", failed: "Payment failed" };

export const statusWords = (s: string) => STATUS[s] ?? (s ? s.replace(/_/g, " ") : "—");

function dateOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function OrdersScreen({ shopName, canOrder, onOpen }: {
  shopName: string; canOrder: boolean; onOpen: (number: string) => void;
}) {
  const [list, setList] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try { setList(await fetchOrders()); } catch (e) { setError(e instanceof Error ? e.message : "Your orders could not load."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <View style={s.page}>
      <Header kicker={shopName} title="Orders" />
      {!list ? (error ? <Centre message={error} /> : <Centre busy />) : (
        <ScrollView contentContainerStyle={[s.body, { paddingBottom: BAR_SPACE + space.xl }]}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={palette.muted}
            onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} />}>
          {list.length === 0 ? (
            <Text style={s.empty}>{canOrder ? "No orders yet." : "Ordering opens once the shop approves your account."}</Text>
          ) : list.map((o) => (
            <Card key={o.id} onPress={() => onOpen(o.number)}>
              <View style={s.top}>
                <Text style={s.number}>Order {o.number}</Text>
                <Text style={s.total}>{money(o.total)}</Text>
              </View>
              <View style={s.metaRow}>
                {o.status ? <Pill text={statusWords(o.status)} /> : null}
                <Text style={s.meta}>{dateOf(o.placedAt ?? "")}</Text>
                <Ionicons name="chevron-forward" size={16} color={palette.muted} style={{ marginLeft: "auto" }} />
              </View>
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export function OrderScreen({ number, accent, onBack }: { number: string; accent: string; onBack: () => void }) {
  const [o, setO] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOrder(number).then(setO).catch((e) => setError(e instanceof Error ? e.message : "This order could not load."));
  }, [number]);

  if (error) return <View style={s.page}><Header title={`Order ${number}`} onBack={onBack} /><Centre message={error} /></View>;
  if (!o) return <View style={s.page}><Header title={`Order ${number}`} onBack={onBack} /><Centre busy /></View>;

  return (
    <View style={s.page}>
      <Header kicker={dateOf(o.placedAt)} title={`Order ${o.number}`} onBack={onBack} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: BAR_SPACE + space.xl }]}>
        <View style={s.metaRow}>
          <Pill text={statusWords(o.status)} />
          <Pill text={PAID[o.paymentStatus] ?? o.paymentStatus} />
        </View>

        {o.trackingNumber ? (
          <Card>
            <Line label={o.carrier ? `Tracking (${o.carrier})` : "Tracking"} value={o.trackingNumber} />
            {o.trackingUrl ? <Button title="Track the parcel" variant="quiet" accent={accent} onPress={() => { Linking.openURL(o.trackingUrl); }} /> : null}
          </Card>
        ) : null}

        <SectionLabel>What is in it</SectionLabel>
        <Card>
          {o.lines.map((l, i) => (
            <View key={i} style={[s.lineItem, i > 0 && s.lineBorder]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.itemName}>{l.name}</Text>
                <Text style={s.meta}>{[l.color, l.size].filter(Boolean).join(" · ")}{l.color || l.size ? " · " : ""}{l.quantity} × {money(l.unitPrice)}</Text>
              </View>
              <Text style={s.total}>{money(l.lineTotal)}</Text>
            </View>
          ))}
        </Card>

        <SectionLabel>Totals</SectionLabel>
        <Card>
          <Line label="Items" value={money(o.subtotal)} />
          {o.discount > 0 ? <Line label="Discount" value={`−${money(o.discount)}`} tone="ok" /> : null}
          <Line label="Shipping" value={o.shipping === 0 ? "Free" : money(o.shipping)} />
          <Line label="Tax" value={money(o.tax)} />
          <Line label="Total" value={money(o.total)} strong />
          {o.balanceDue > 0 ? <Line label="Still to pay" value={money(o.balanceDue)} /> : null}
        </Card>
      </ScrollView>
    </View>
  );
}

export function PlacedScreen({ order, accent, onView, onShop }: {
  order: PlacedOrder; accent: string; onView: () => void; onShop: () => void;
}) {
  return (
    <View style={s.page}>
      <Header title="Thank you" />
      <View style={[s.body, { gap: space.md }]}>
        <Notice tone="ok">Order {order.number} is placed. The shop has it now, and you will get an email.</Notice>
        <Card>
          <Line label="Order" value={order.number} />
          <Line label="Total" value={money(order.total)} strong />
          <Line label="Payment" value={PAID[order.paymentStatus] ?? (order.paymentStatus || "—")} />
        </Card>
        <Button title="View the order" accent={accent} onPress={onView} />
        <Button title="Keep shopping" variant="quiet" accent={accent} onPress={onShop} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  body: { paddingHorizontal: space.lg, gap: space.sm },
  empty: { ...type.body, color: palette.ink70, textAlign: "center", paddingVertical: space.xl },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  number: { ...type.bodyMedium, color: palette.ink },
  total: { ...type.number, color: palette.ink },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs, flexWrap: "wrap" },
  meta: { ...type.small, color: palette.ink70 },
  lineItem: { flexDirection: "row", gap: space.sm, paddingVertical: space.sm },
  lineBorder: { borderTopWidth: 1, borderTopColor: palette.lineSoft },
  itemName: { ...type.bodyMedium, color: palette.ink, fontSize: 14.5 },
});
