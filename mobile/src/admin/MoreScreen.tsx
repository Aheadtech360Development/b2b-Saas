/**
 * Everything the bottom bar has no room for.
 *
 * The website's menu, in its groups and its order, so somebody who knows the
 * console finds the same thing under the same heading.
 */
import { ScrollView, StyleSheet, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GROUPS, SECTIONS } from "@/admin/sections";
import { TABS, TAB_BAR_SPACE } from "@/admin/tabs";
import { Icon, IconTile, type IconName, type Tint } from "@/ui/Icon";
import { palette, radius, space, type } from "@/ui/theme";

/** An icon and a tint per entry, so a long menu is scannable. */
const LOOK: Record<string, { icon: IconName; tint: Tint }> = {
  dashboard: { icon: "grid-outline", tint: "slate" },
  orders: { icon: "receipt-outline", tint: "red" },
  drafts: { icon: "create-outline", tint: "slate" },
  abandoned: { icon: "cart-outline", tint: "amber" },
  returns: { icon: "return-down-back-outline", tint: "amber" },
  "purchase-orders": { icon: "clipboard-outline", tint: "blue" },
  products: { icon: "cube-outline", tint: "violet" },
  collections: { icon: "albums-outline", tint: "violet" },
  reviews: { icon: "star-outline", tint: "amber" },
  inventory: { icon: "layers-outline", tint: "blue" },
  suppliers: { icon: "business-outline", tint: "slate" },
  "gang-sheets": { icon: "color-palette-outline", tint: "violet" },
  customers: { icon: "people-outline", tint: "green" },
  applications: { icon: "person-add-outline", tint: "green" },
  segments: { icon: "pie-chart-outline", tint: "blue" },
  messages: { icon: "chatbubble-outline", tint: "blue" },
  discounts: { icon: "pricetag-outline", tint: "red" },
  "discount-groups": { icon: "pricetags-outline", tint: "red" },
  users: { icon: "shield-outline", tint: "slate" },
  "audit-log": { icon: "time-outline", tint: "slate" },
  billing: { icon: "card-outline", tint: "green" },
  theme: { icon: "brush-outline", tint: "violet" },
};

export function MoreScreen({
  shopName, onPick, onSignOut,
}: {
  shopName: string;
  onPick: (key: string) => void;
  onSignOut: () => void;
}) {
  const insets = useSafeAreaInsets();
  // The four already in the bar are not repeated here.
  const inBar = new Set(TABS.map((t) => t.key));

  return (
    <View style={s.page}>
      <View style={[s.head, { paddingTop: insets.top + space.md }]}>
        <Text style={s.shop}>{shopName.toUpperCase()}</Text>
        <Text style={s.title}>More</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingBottom: insets.bottom + TAB_BAR_SPACE,
        }}
        showsVerticalScrollIndicator={false}
      >
        {GROUPS.map((group) => {
          const entries = SECTIONS.filter((x) => x.group === group && !inBar.has(x.key));
          if (!entries.length) return null;
          return (
            <View key={group} style={s.group}>
              <Text style={s.groupLabel}>{group.toUpperCase()}</Text>
              <View style={s.card}>
                {entries.map((item, i) => {
                  const look = LOOK[item.key] ?? { icon: "ellipse-outline" as IconName, tint: "slate" as Tint };
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => onPick(item.key)}
                      style={({ pressed }) => [
                        s.item,
                        i > 0 && s.itemBorder,
                        pressed && { backgroundColor: palette.page },
                      ]}
                      accessibilityRole="button"
                    >
                      <IconTile name={look.icon} tint={look.tint} size={32} />
                      <Text style={s.itemText}>{item.label}</Text>
                      {item.desktopOnly ? (
                        <Text style={s.deskTag}>desktop</Text>
                      ) : null}
                      <Ionicons name="chevron-forward" size={15} color={palette.muted} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}

        <Pressable
          onPress={onSignOut}
          style={({ pressed }) => [s.signOut, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
        >
          <Icon name="log-out-outline" tint="red" size={17} />
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  head: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  shop: { ...type.section, color: palette.muted, marginBottom: space.xs },
  title: { ...type.hero, color: palette.ink },
  group: { marginBottom: space.lg },
  groupLabel: { ...type.section, fontSize: 10, color: palette.muted, marginBottom: space.xs },
  card: {
    backgroundColor: palette.paper, borderRadius: radius.lg,
    borderWidth: 1, borderColor: palette.line, overflow: "hidden",
  },
  item: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  itemBorder: { borderTopWidth: 1, borderTopColor: palette.lineSoft },
  itemText: { ...type.body, fontSize: 14.5, color: palette.ink, flex: 1 },
  deskTag: {
    ...type.small, fontSize: 10.5, color: palette.muted,
    backgroundColor: palette.page, borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  signOut: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs,
    paddingVertical: 14, marginTop: space.xs,
  },
  signOutText: { ...type.body, fontSize: 14.5, color: palette.bad },
});
