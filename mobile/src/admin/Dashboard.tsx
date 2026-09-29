/**
 * What somebody opens the app to check.
 *
 * The numbers, then what needs doing, then the orders that just came in. The
 * website calls this the Command Center and puts the same things in the same
 * order.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { analytics, counts, orders as fetchOrders, type AdminOrder, type Analytics, type Counts } from "@/api/admin";
import { Card, Hero, Pill, Row, SectionLabel, Stat } from "@/ui/components";
import { palette, space, type } from "@/ui/theme";

export function Dashboard({
  shopName, onOpenMenu, onGo,
}: {
  shopName: string;
  onOpenMenu: () => void;
  onGo: (key: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [nums, setNums] = useState<Counts | null>(null);
  const [stats, setStats] = useState<Analytics | null>(null);
  const [rows, setRows] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Each panel stands on its own, so a shop whose plan leaves analytics out
    // still sees its orders.
    const [c, a, o] = await Promise.allSettled([counts(), analytics(), fetchOrders(8)]);
    if (c.status === "fulfilled") setNums(c.value);
    if (a.status === "fulfilled") setStats(a.value);
    if (o.status === "fulfilled") setRows(o.value);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const unpaid = rows.filter((o) => (o.paymentStatus || "").toLowerCase() !== "paid").length;
  const unshipped = rows.filter((o) => {
    const st = (o.status || "").toLowerCase();
    return (o.paymentStatus || "").toLowerCase() === "paid"
      && !["shipped", "delivered", "cancelled", "completed"].includes(st);
  }).length;

  if (loading) {
    return <View style={s.centre}><ActivityIndicator color={palette.muted} /></View>;
  }

  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }}
          tintColor={palette.muted}
        />
      }
    >
      <View style={[s.head, { paddingTop: insets.top + space.sm }]}>
        <Pressable onPress={onOpenMenu} hitSlop={12} style={s.menuButton} accessibilityRole="button" accessibilityLabel="Open menu">
          <View style={s.bar} /><View style={s.bar} /><View style={s.bar} />
        </Pressable>
        <View style={s.headText}>
          <Text style={s.shop}>{shopName.toUpperCase()}</Text>
          <Hero>Command Center</Hero>
        </View>
      </View>

      <View style={s.body}>
        <View style={s.statRow}>
          <Stat label="Orders" value={String(nums?.orders ?? 0)} />
          <Stat label="Customers" value={String(nums?.customers ?? 0)} />
        </View>
        <View style={s.statRow}>
          <Stat label="Products" value={String(nums?.products ?? 0)} />
          <Stat
            label={stats ? "Revenue, 30 days" : "Returns"}
            value={stats ? money(stats.revenue) : String(nums?.returns ?? 0)}
          />
        </View>

        {(unpaid > 0 || unshipped > 0 || (nums?.returns ?? 0) > 0) ? (
          <>
            <View style={s.gap} />
            <SectionLabel>Needs attention</SectionLabel>
            {unpaid > 0 ? (
              <Card onPress={() => onGo("orders")}>
                <Text style={s.attnTitle}>{unpaid} {unpaid === 1 ? "order" : "orders"} not paid</Text>
                <Text style={s.attnBody}>Among the most recent ones.</Text>
              </Card>
            ) : null}
            {unshipped > 0 ? (
              <Card onPress={() => onGo("orders")}>
                <Text style={s.attnTitle}>{unshipped} paid, not shipped</Text>
                <Text style={s.attnBody}>Paid for and still waiting to go out.</Text>
              </Card>
            ) : null}
            {(nums?.returns ?? 0) > 0 ? (
              <Card onPress={() => onGo("returns")}>
                <Text style={s.attnTitle}>{nums?.returns} {nums?.returns === 1 ? "return" : "returns"} open</Text>
                <Text style={s.attnBody}>Waiting on a decision.</Text>
              </Card>
            ) : null}
          </>
        ) : null}

        <View style={s.gap} />
        <SectionLabel>Recent orders</SectionLabel>
        {rows.length === 0 ? (
          <Card><Text style={s.empty}>No orders yet.</Text></Card>
        ) : (
          rows.map((o) => (
            <Card key={o.id} onPress={() => onGo("orders")}>
              <View style={s.orderTop}>
                <Text style={s.orderNumber}>{o.number || "Order"}</Text>
                <Text style={s.orderTotal}>{money(o.total)}</Text>
              </View>
              <Text style={s.orderCustomer} numberOfLines={1}>{o.customer}</Text>
              <View style={s.pills}>
                {o.status ? <Pill text={o.status} /> : null}
                {o.paymentStatus ? <Pill text={o.paymentStatus} /> : null}
              </View>
              {o.placedAt ? <Row label="Placed" value={dateOf(o.placedAt)} /> : null}
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function money(value: number): string {
  return Number.isFinite(value)
    ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
}

function dateOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.page },
  head: { flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.lg },
  menuButton: { width: 24, height: 24, justifyContent: "center", gap: 4, marginTop: 6 },
  bar: { height: 1.8, backgroundColor: palette.ink, borderRadius: 2 },
  headText: { flex: 1 },
  shop: { ...type.section, color: palette.muted, marginBottom: space.xs },
  body: { paddingHorizontal: space.lg },
  statRow: { flexDirection: "row", gap: space.sm, marginBottom: space.sm },
  gap: { height: space.lg },
  empty: { ...type.small, color: palette.muted },
  attnTitle: { ...type.bodyMedium, color: palette.ink },
  attnBody: { ...type.small, color: palette.muted, marginTop: 1 },
  orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  orderNumber: { ...type.bodyMedium, color: palette.ink },
  orderTotal: { ...type.number, color: palette.ink },
  orderCustomer: { ...type.small, color: palette.muted, marginTop: 1 },
  pills: { flexDirection: "row", gap: space.xs, marginTop: space.sm, flexWrap: "wrap" },
});
