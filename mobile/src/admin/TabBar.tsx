/**
 * The four places somebody goes every day, and a way to the rest.
 *
 * A bottom bar rather than only a drawer: the daily work is orders, products
 * and messages, and reaching them should not cost a menu. Everything else
 * lives behind More, grouped as the website groups it.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette, space, type } from "@/ui/theme";
import { isTabActive, TABS } from "@/admin/tabs";


export function TabBar({
  current, onPick,
}: {
  current: string;
  onPick: (key: string) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, space.xs) }]}>
      {TABS.map((tab) => {
        const active = isTabActive(tab.key, current);
        return (
          <Pressable
            key={tab.key}
            onPress={() => onPick(tab.key)}
            style={s.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
          >
            <Ionicons
              name={active ? tab.iconActive : tab.icon}
              size={21}
              color={active ? palette.ink : palette.muted}
            />
            <Text style={[s.label, active && s.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: palette.paper,
    borderTopWidth: 1, borderTopColor: palette.line,
    paddingTop: space.sm,
  },
  tab: { flex: 1, alignItems: "center", gap: 3 },
  label: { ...type.small, fontSize: 10.5, color: palette.muted },
  labelActive: { color: palette.ink, fontFamily: type.label.fontFamily },
});
