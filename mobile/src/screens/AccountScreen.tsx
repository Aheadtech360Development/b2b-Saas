/**
 * What a buyer sees.
 *
 * The shop's name sits at the top because on a phone there is no address bar
 * to say whose shop this is, and one person may buy from several suppliers on
 * this platform.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { orders as fetchOrders, profile as fetchProfile, type OrderSummary, type Profile } from "@/api/account";
import { currentShop, type Shop } from "@/api/shop";
import { signOut } from "@/api/auth";
import type { Session } from "@/session/store";
import { Button, Card, Hero, Notice, Pill, Row, SectionLabel } from "@/ui/components";
import { accentFor, palette, space, type } from "@/ui/theme";

export function AccountScreen({ session, onSignedOut, bottomSpace = 0, hideOrders = false }: {
  session: Session;
  onSignedOut: () => void;
  /** Room for a tab bar floating over the bottom of the screen. */
  bottomSpace?: number;
  /** Inside the shop app the orders have a tab of their own. */
  hideOrders?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [shop, setShop] = useState<Shop | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [shopRes, profileRes, ordersRes] = await Promise.allSettled([
      session.tenantSlug ? currentShop(session.tenantSlug) : Promise.resolve(null),
      fetchProfile(),
      fetchOrders(),
    ]);
    if (shopRes.status === "fulfilled" && shopRes.value) setShop(shopRes.value);
    if (profileRes.status === "fulfilled") setProfile(profileRes.value);
    else setError("Could not load your account.");
    if (ordersRes.status === "fulfilled") setOrders(ordersRes.value);
  }, [session.tenantSlug]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const accent = accentFor(shop?.primaryColor);

  // Only a buyer can be waiting for approval. An admin has no company either,
  // which is why reading companyId alone showed a shop's owner a message
  // about an application they never made.
  const awaitingApproval = !session.isAdmin && session.companyId === null;

  if (loading) {
    return (
      <View style={s.centre}>
        <ActivityIndicator color={palette.muted} />
      </View>
    );
  }

  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ");

  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={{ paddingBottom: space.xl + Math.max(insets.bottom, bottomSpace) }}
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
        <Hero>{profile?.firstName ? `Hello, ${profile.firstName}` : "Your account"}</Hero>
      </View>

      <View style={s.body}>
        {error ? <Notice tone="bad">{error}</Notice> : null}

        {awaitingApproval ? (
          <Notice tone="warn">
            Your wholesale application is with {shop?.name ?? "the shop"}. You will be
            able to order as soon as they approve it.
          </Notice>
        ) : null}

        <SectionLabel>Your details</SectionLabel>
        <Card>
          <Row label="Email" value={profile?.email ?? session.email ?? "—"} />
          <Row label="Name" value={name || "—"} />
          {profile?.phone ? <Row label="Phone" value={profile.phone} /> : null}
        </Card>

        {hideOrders ? null : <>
        <View style={s.gap} />
        <SectionLabel>Your orders</SectionLabel>

        {orders.length === 0 ? (
          <Card>
            <Text style={s.empty}>
              {awaitingApproval ? "Ordering opens once you are approved." : "No orders yet."}
            </Text>
          </Card>
        ) : (
          orders.map((o) => (
            <Card key={o.id}>
              <View style={s.orderTop}>
                <Text style={s.orderNumber}>{o.number || "Order"}</Text>
                <Text style={s.orderTotal}>{money(o.total)}</Text>
              </View>
              <View style={s.pills}>{o.status ? <Pill text={o.status} /> : null}</View>
              {o.placedAt ? <Row label="Placed" value={dateOf(o.placedAt)} /> : null}
            </Card>
          ))
        )}
        </>}

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
  gap: { height: space.lg },
  empty: { ...type.small, color: palette.muted },
  orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  orderNumber: { ...type.bodyMedium, color: palette.ink },
  orderTotal: { ...type.number, color: palette.ink },
  pills: { flexDirection: "row", gap: space.xs, marginTop: space.sm },
});
