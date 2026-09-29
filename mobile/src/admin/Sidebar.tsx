/**
 * The same menu as the website's console, grouped the same way.
 *
 * A drawer rather than a bottom bar: there are five groups and twenty
 * entries, and a bottom bar holds five. Somebody who knows the website will
 * find the same thing in the same place.
 */
import { ScrollView, StyleSheet, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GROUPS, SECTIONS } from "@/admin/sections";
import { palette, radius, space, type } from "@/ui/theme";

export function Sidebar({
  current, shopName, onPick, onSignOut,
}: {
  current: string;
  shopName: string;
  onPick: (key: string) => void;
  onSignOut: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={s.panel}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.lg,
          paddingBottom: insets.bottom + space.lg,
          paddingHorizontal: space.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.shop} numberOfLines={2}>{shopName.toUpperCase()}</Text>

        {GROUPS.map((group) => (
          <View key={group} style={s.group}>
            <Text style={s.groupLabel}>{group.toUpperCase()}</Text>
            {SECTIONS.filter((x) => x.group === group).map((item) => {
              const active = item.key === current;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => onPick(item.key)}
                  style={({ pressed }) => [
                    s.item,
                    active && s.itemActive,
                    pressed && !active && s.itemPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[s.itemText, active && s.itemTextActive]} numberOfLines={1}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}

        <Pressable
          onPress={onSignOut}
          style={({ pressed }) => [s.signOut, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
        >
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  panel: { flex: 1, backgroundColor: palette.paper },
  shop: { ...type.section, color: palette.muted, paddingHorizontal: space.sm, marginBottom: space.lg },
  group: { marginBottom: space.lg },
  groupLabel: {
    ...type.section, color: palette.muted, fontSize: 10,
    paddingHorizontal: space.sm, marginBottom: space.xs,
  },
  item: { paddingHorizontal: space.sm, paddingVertical: 10, borderRadius: radius.sm },
  itemActive: { backgroundColor: palette.ink },
  itemPressed: { backgroundColor: palette.lineSoft },
  itemText: { ...type.body, fontSize: 14.5, color: palette.ink70 },
  itemTextActive: { color: "#fff", fontFamily: type.bodyMedium.fontFamily },
  signOut: {
    marginTop: space.sm, paddingHorizontal: space.sm, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: palette.lineSoft,
  },
  signOutText: { ...type.body, fontSize: 14.5, color: palette.bad },
});
