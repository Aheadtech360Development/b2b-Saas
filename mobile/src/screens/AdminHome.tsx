/**
 * What the shop's own people see.
 *
 * Orders first, because that is what somebody opens a phone to check. The
 * numbers sit above them for context, not as the point of the screen.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { analytics, counts, orders as fetchOrders, type AdminOrder, type Analytics, type Counts } from "@/api/admin";
import { signOut } from "@/api/auth";
import { currentShop, type Shop } from "@/api/shop";
import type { Session } from "@/session/store";
import { Button, Card, Hero, Pill, Row, SectionLabel, Stat } from "@/ui/components";
import { accentFor, palette, space, type } from "@/ui/theme";

export function AdminHome({ session, onSignedOut }: { session: Session; onSignedOut: () => void }) {
  const insets = useSafeAreaInsets();
  const [shop, setShop] = useState<Shop | null>(null);
  const [nums, setNums] = useState<Counts | null>(null);
  const [stats, setStats] = useState<Analytics | null>(null);
  const [rows, setRows] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Each panel stands on its own: a shop whose plan leaves analytics out
    // should still see its orders.
    const [shopRes, countRes, statRes, orderRes] = await Promise.allSettled([
      session.tenantSlug ? currentShop(session.tenantSlug) : Promise.resolve(null),
      counts(),
      analytics(),
      fetchOrders(),
    ]);
    if (shopRes.status === "fulfilled" && shopRes.value) setShop(shopRes.value);
    if (countRes.status === "fulfilled") setNums(countRes.value);
    if (statRes.status === "fulfilled") setStats(statRes.value);
    if (orderRes.status === "fulfilled") setRows(orderRes.value);
  }, [session.tenantSlug]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const accent = accentFor(shop?.primaryColor);

  if (loading) {
    return (
      <View style={s.centre}>
        <ActivityIndicator color={palette.muted} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={{ paddingBottom: space.xl + insets.bottom }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load().finally(() => setRefreshing(false));
          }}
          tintColor={palette.muted}
        />
      }
    >
      <View style={[s.head, { paddingTop: insets.top + space.lg }]}>
        <Text style={s.shopName}>{(shop?.name ?? "Your shop").toUpperCase()}</Text>
        <Hero>Orders</Hero>
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

        <View style={s.gap} />
        <SectionLabel>Recent orders</SectionLabel>

        {rows.length === 0 ? (
          <Card>
            <Text style={s.empty}>No orders yet.</Text>
          </Card>
        ) : (
          rows.map((o) => (
            <Card key={o.id}>
              <View style={s.orderTop}>
                <Text style={s.orderNumber}>{o.number || "Order"}</Text>
                <Text style={s.orderTotal}>{money(o.total)}</Text>
              </View>
              <Text style={s.orderCustomer} numberOfLines={1}>{o.customer}</Text>
              <View style={s.pills}>
                {o.status ? <Pill text={o.status} /> : null}
                {o.paymentStatus ? <Pill text={o.paymentStatus} /> : null}
              </View>
              <Row label="Items" value={String(o.itemCount)} />
              {o.placedAt ? <Row label="Placed" value={dateOf(o.placedAt)} /> : null}
              {o.trackingNumber ? <Row label="Tracking" value={o.trackingNumber} /> : null}
            </Card>
          ))
        )}

        <View style={s.gap} />
        <Button
          title="Sign out"
          variant="quiet"
          accent={accent}
          onPress={() => { signOut().finally(onSignedOut); }}
        />
      </View>
    </ScrollView>
  );
}

function money(value: number): string {
  return Number.isFinite(value) ? `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}` : "—";
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
  head: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  shopName: { ...type.section, color: palette.muted, marginBottom: space.xs },
  body: { paddingHorizontal: space.lg },
  statRow: { flexDirection: "row", gap: space.sm, marginBottom: space.sm },
  gap: { height: space.lg },
  empty: { ...type.small, color: palette.muted },
  orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  orderNumber: { ...type.bodyMedium, color: palette.ink },
  orderTotal: { ...type.number, color: palette.ink },
  orderCustomer: { ...type.small, color: palette.muted, marginTop: 1 },
  pills: { flexDirection: "row", gap: space.xs, marginTop: space.sm, marginBottom: space.xs, flexWrap: "wrap" },
});
