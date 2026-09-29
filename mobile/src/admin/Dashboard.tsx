/**
 * What somebody opens the app to see.
 *
 * The same order as the website's Command Center: where the shop stands, what
 * needs doing, a box to ask, and the counts that are not urgent enough to be
 * a priority but are worth a glance.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { counts, type Counts } from "@/api/admin";
import { briefing, sectionForHref, type Briefing, type Severity } from "@/api/copilot";
import { profile as fetchProfile } from "@/api/account";
import { AskStore } from "@/admin/AskStore";
import { Icon, IconTile, tints, type IconName, type Tint } from "@/ui/Icon";
import { TAB_BAR_SPACE } from "@/admin/tabs";
import { palette, radius, space, type } from "@/ui/theme";

export function Dashboard({
  shopName, onGo,
}: {
  shopName: string;
  onGo: (key: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [nums, setNums] = useState<Counts | null>(null);
  const [firstName, setFirstName] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Each panel stands on its own. A shop whose plan leaves the assistant out
    // should still see its numbers.
    const [b, c, p] = await Promise.allSettled([briefing(), counts(), fetchProfile()]);
    if (b.status === "fulfilled") setBrief(b.value);
    if (c.status === "fulfilled") setNums(c.value);
    if (p.status === "fulfilled") setFirstName(p.value.firstName);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  if (loading) {
    return <View style={s.centre}><ActivityIndicator color={palette.muted} /></View>;
  }

  const pulse = brief?.pulse;
  const items = brief?.items ?? [];
  const attention = items.filter((i) => i.severity !== "urgent").length;

  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_SPACE }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }}
          tintColor={palette.muted}
        />
      }
    >
      <View style={[s.head, { paddingTop: insets.top + space.md }]}>
        <View style={s.brand}>
          <View style={s.mark}>
            <Ionicons name="sparkles" size={15} color="#fff" />
          </View>
          <View>
            <Text style={s.brandName} numberOfLines={1}>{shopName}</Text>
            <Text style={s.brandSub}>Command Center</Text>
          </View>
        </View>
        {items.length > 0 ? (
          <View style={s.bell}>
            <Icon name="notifications-outline" tint="slate" size={19} />
            <View style={s.dot} />
          </View>
        ) : (
          <Icon name="notifications-outline" tint="slate" size={19} />
        )}
      </View>

      <View style={s.body}>
        <Text style={s.greeting}>
          {greet()}{firstName ? `, ${firstName}` : ""} <Text style={s.wave}>👋</Text>
        </Text>
        <Text style={s.greetingSub}>Here's what's happening with your store today.</Text>

        <View style={s.statGrid}>
          <StatCard icon="receipt-outline" tint="red" label="Orders today"
            value={String(pulse?.ordersToday ?? 0)} onPress={() => onGo("orders")} />
          <StatCard icon="cash-outline" tint="green" label="Sales today"
            value={money(pulse?.revenueToday ?? 0)} onPress={() => onGo("orders")} />
        </View>
        <View style={s.statGrid}>
          <StatCard icon="calendar-outline" tint="blue" label="7-day orders"
            value={String(pulse?.orders7d ?? 0)} onPress={() => onGo("orders")} />
          <StatCard icon="trending-up-outline" tint="violet" label="7-day sales"
            value={money(pulse?.revenue7d ?? 0)} onPress={() => onGo("orders")} />
        </View>

        {items.length > 0 ? (
          <View style={s.panel}>
            <View style={s.panelHead}>
              <Icon name="sparkles-outline" tint="violet" size={15} />
              <Text style={s.eyebrow}>TODAY'S PRIORITIES</Text>
            </View>
            {items.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => onGo(sectionForHref(item.href))}
                style={({ pressed }) => [s.priority, pressed && { opacity: 0.65 }]}
                accessibilityRole="button"
              >
                <View style={[s.severity, { backgroundColor: severityColour(item.severity) }]} />
                <View style={s.priorityText}>
                  <Text style={s.priorityTitle}>{item.title}</Text>
                  <Text style={s.priorityDetail}>{item.detail}</Text>
                </View>
                <View style={[s.review, { backgroundColor: severityTint(item.severity) }]}>
                  <Text style={[s.reviewText, { color: severityColour(item.severity) }]}>Review</Text>
                  <Ionicons name="chevron-forward" size={11} color={severityColour(item.severity)} />
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={s.panel}>
            <View style={s.panelHead}>
              <Icon name="checkmark-circle-outline" tint="green" size={15} />
              <Text style={s.eyebrow}>TODAY'S PRIORITIES</Text>
            </View>
            <Text style={s.clear}>Nothing needs you right now.</Text>
          </View>
        )}

        <AskStore enabled={brief?.aiEnabled ?? false} />

        <Text style={s.sectionLabel}>NEEDS ATTENTION</Text>
        <View style={s.smallGrid}>
          <SmallStat icon="cube-outline" tint="red" value={String(attention)}
            label="To act on" onPress={() => onGo("orders")} />
          <SmallStat icon="document-text-outline" tint="amber" value={String(nums?.returns ?? 0)}
            label="Open returns" onPress={() => onGo("returns")} />
          <SmallStat icon="alert-circle-outline" tint="violet" value={String(nums?.products ?? 0)}
            label="Products" onPress={() => onGo("products")} />
        </View>
      </View>
    </ScrollView>
  );
}

function StatCard({
  icon, tint, label, value, onPress,
}: {
  icon: IconName; tint: Tint; label: string; value: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.stat, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      <View style={s.statTop}>
        <IconTile name={icon} tint={tint} />
        <Ionicons name="chevron-forward" size={14} color={palette.muted} />
      </View>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </Pressable>
  );
}

function SmallStat({
  icon, tint, value, label, onPress,
}: {
  icon: IconName; tint: Tint; value: string; label: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.small, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      <IconTile name={icon} tint={tint} size={30} />
      <Text style={[s.smallValue, { color: tints[tint].fg }]}>{value}</Text>
      <Text style={s.smallLabel} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

function greet(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Working late";
}

function severityColour(sev: Severity): string {
  return sev === "urgent" ? tints.red.fg : sev === "attention" ? tints.amber.fg : tints.blue.fg;
}
function severityTint(sev: Severity): string {
  return sev === "urgent" ? tints.red.bg : sev === "attention" ? tints.amber.bg : tints.blue.bg;
}

function money(value: number): string {
  return Number.isFinite(value)
    ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "$0.00";
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.page },

  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1 },
  mark: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: palette.ink,
    alignItems: "center", justifyContent: "center",
  },
  brandName: { ...type.bodyMedium, fontSize: 16, color: palette.ink },
  brandSub: { ...type.small, fontSize: 12, color: palette.muted },
  bell: { position: "relative" },
  dot: {
    position: "absolute", top: -1, right: -1, width: 8, height: 8,
    borderRadius: 4, backgroundColor: tints.red.fg,
    borderWidth: 1.5, borderColor: palette.page,
  },

  body: { paddingHorizontal: space.lg },
  greeting: { ...type.hero, color: palette.ink },
  wave: { fontSize: 24 },
  greetingSub: { ...type.body, color: palette.ink70, marginTop: space.xs, marginBottom: space.lg },

  statGrid: { flexDirection: "row", gap: space.sm, marginBottom: space.sm },
  stat: {
    flex: 1, backgroundColor: palette.paper, borderRadius: radius.lg,
    borderWidth: 1, borderColor: palette.line, padding: 14,
  },
  statTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm },
  statLabel: { ...type.small, fontSize: 12.5, color: palette.muted },
  statValue: { ...type.big, color: palette.ink, marginTop: 1 },

  panel: {
    backgroundColor: palette.paper, borderRadius: radius.lg,
    borderWidth: 1, borderColor: palette.line,
    padding: 18, marginTop: space.md, marginBottom: space.sm,
  },
  panelHead: { flexDirection: "row", alignItems: "center", gap: space.xs, marginBottom: space.md },
  eyebrow: { ...type.section, color: palette.muted },
  clear: { ...type.small, color: palette.muted },

  priority: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    backgroundColor: palette.page, borderRadius: radius.md,
    paddingHorizontal: 13, paddingVertical: 13, marginBottom: space.xs,
  },
  severity: { width: 8, height: 8, borderRadius: 4 },
  priorityText: { flex: 1 },
  priorityTitle: { ...type.bodyMedium, fontSize: 14, color: palette.ink },
  priorityDetail: { ...type.small, fontSize: 12.5, color: palette.muted, marginTop: 2 },
  review: {
    flexDirection: "row", alignItems: "center", gap: 2,
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 6,
  },
  reviewText: { fontFamily: type.label.fontFamily, fontSize: 12 },

  sectionLabel: { ...type.section, color: palette.muted, marginTop: space.md, marginBottom: space.sm },
  smallGrid: { flexDirection: "row", gap: space.sm },
  small: {
    flex: 1, backgroundColor: palette.paper, borderRadius: radius.lg,
    borderWidth: 1, borderColor: palette.line, padding: 13,
  },
  smallValue: { ...type.big, fontSize: 22, lineHeight: 26, marginTop: space.sm },
  smallLabel: { ...type.small, fontSize: 11.5, color: palette.muted, marginTop: 1 },
});
