/**
 * What a signed-in buyer sees.
 *
 * The shop's name and colour come first, because on a phone there is no
 * address bar to say whose shop this is — and one person may buy from more
 * than one supplier on this platform.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { orders as fetchOrders, profile as fetchProfile, type OrderSummary, type Profile } from "@/api/account";
import { currentShop, type Shop } from "@/api/shop";
import { signOut } from "@/api/auth";
import type { Session } from "@/session/store";
import { Button, Card, Heading, Notice, Row } from "@/ui/components";
import { accentFor, palette } from "@/ui/theme";

export function AccountScreen({
  session, onSignedOut,
}: {
  session: Session;
  onSignedOut: () => void;
}) {
  const [shop, setShop] = useState<Shop | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    // Gathered together, and each allowed to fail on its own: a shop with no
    // orders yet must not render as a broken screen.
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
  const awaitingApproval = session.companyId === null;

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
      contentContainerStyle={s.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <View style={[s.brandBar, { backgroundColor: accent }]}>
        <Text style={s.brandName}>{shop?.name ?? "Your shop"}</Text>
      </View>

      <View style={s.body}>
        <Heading>
          {profile?.firstName ? `Hello, ${profile.firstName}` : "Your account"}
        </Heading>

        {error && <View style={s.spaced}><Notice tone="bad">{error}</Notice></View>}

        {awaitingApproval && (
          <View style={s.spaced}>
            <Notice tone="warn">
              Your wholesale application is still being reviewed. You will be able to
              order as soon as {shop?.name ?? "the shop"} approves it.
            </Notice>
          </View>
        )}

        <Card>
          <Row label="Email" value={profile?.email ?? session.email ?? "—"} />
          <Row
            label="Name"
            value={[profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "—"}
          />
          {profile?.phone ? <Row label="Phone" value={profile.phone} /> : null}
        </Card>

        <Text style={s.sectionTitle}>Recent orders</Text>
        {orders.length === 0 ? (
          <Card>
            <Text style={s.empty}>
              {awaitingApproval
                ? "Nothing yet — ordering opens once you are approved."
                : "No orders yet."}
            </Text>
          </Card>
        ) : (
          orders.map((o) => (
            <Card key={o.id}>
              <Row label="Order" value={o.number || "—"} />
              <Row label="Status" value={o.status || "—"} />
              <Row label="Total" value={money(o.total)} />
              {o.placedAt ? <Row label="Placed" value={dateOf(o.placedAt)} /> : null}
            </Card>
          ))
        )}

        <View style={s.spaced}>
          <Button
            title="Sign out"
            variant="quiet"
            accent={accent}
            onPress={() => {
              signOut().finally(onSignedOut);
            }}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function money(value: number): string {
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : "—";
}

/** The date only — a buyer scanning their history does not need the minute. */
function dateOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  scroll: { paddingBottom: 48 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.page },
  brandBar: { paddingTop: 64, paddingBottom: 22, paddingHorizontal: 24 },
  brandName: { color: "#fff", fontSize: 17, fontWeight: "700", letterSpacing: 0.2 },
  body: { padding: 24 },
  spaced: { marginTop: 16 },
  sectionTitle: {
    fontSize: 12, fontWeight: "700", color: palette.muted, letterSpacing: 0.6,
    textTransform: "uppercase", marginTop: 12, marginBottom: 10,
  },
  empty: { fontSize: 14, color: palette.muted, lineHeight: 20 },
});
