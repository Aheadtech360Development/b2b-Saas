/**
 * The four places somebody goes every day, and a way to the rest.
 *
 * A floating bar rather than one bolted to the bottom edge: the list scrolls
 * under it, which keeps the last row from sitting in a dead strip, and the
 * shape reads as a control rather than as the end of the screen.
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
    <View
      style={[s.wrap, { paddingBottom: Math.max(insets.bottom, space.sm) }]}
      pointerEvents="box-none"
    >
      <View style={s.bar}>
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
              <View style={[s.iconWrap, active && s.iconWrapOn]}>
                <Ionicons
                  name={active ? tab.iconActive : tab.icon}
                  size={20}
                  color={active ? "#fff" : palette.ink70}
                />
              </View>
              <Text style={[s.label, active && s.labelOn]} numberOfLines={1}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: space.md,
  },
  bar: {
    flexDirection: "row",
    backgroundColor: palette.paper,
    borderRadius: 26,
    borderWidth: 1, borderColor: palette.line,
    paddingVertical: 9, paddingHorizontal: space.xs,
    // Lifts it off the list underneath, which is what makes it read as
    // floating rather than as a strip that happens to be pale.
    shadowColor: "#111318",
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  tab: { flex: 1, alignItems: "center", gap: 2 },
  iconWrap: {
    width: 40, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  iconWrapOn: { backgroundColor: palette.ink },
  label: { ...type.small, fontSize: 10, color: palette.muted },
  labelOn: { color: palette.ink, fontFamily: type.label.fontFamily },
});
