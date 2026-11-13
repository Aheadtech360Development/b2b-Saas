/**
 * Pieces the buyer's screens share: a header with a way back, a quantity
 * stepper, a choice chip, and a full-screen state for loading and errors.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette, radius, space, type } from "@/ui/theme";

/** Room a scrolling screen leaves at its bottom for the floating tab bar. */
export const BAR_SPACE = 92;

export function Header({ title, kicker, onBack, right }: {
  title: string; kicker?: string; onBack?: () => void; right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + space.sm }]}>
      <View style={s.headerRow}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={s.back}>
            <Ionicons name="chevron-back" size={22} color={palette.ink} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          {kicker ? <Text style={s.kicker} numberOfLines={1}>{kicker.toUpperCase()}</Text> : null}
          <Text style={s.title} numberOfLines={2}>{title}</Text>
        </View>
        {right}
      </View>
    </View>
  );
}

export function Stepper({ value, onChange, min = 1, max, busy }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number; busy?: boolean;
}) {
  const canDown = value > min && !busy;
  const canUp = (max === undefined || value < max) && !busy;
  return (
    <View style={s.stepper}>
      <Pressable onPress={() => canDown && onChange(value - 1)} hitSlop={8} accessibilityRole="button"
        accessibilityLabel="One fewer" style={[s.stepBtn, !canDown && s.stepOff]}>
        <Ionicons name="remove" size={18} color={palette.ink} />
      </Pressable>
      <Text style={s.stepValue} accessibilityLabel={`Quantity ${value}`}>{value}</Text>
      <Pressable onPress={() => canUp && onChange(value + 1)} hitSlop={8} accessibilityRole="button"
        accessibilityLabel="One more" style={[s.stepBtn, !canUp && s.stepOff]}>
        <Ionicons name="add" size={18} color={palette.ink} />
      </Pressable>
    </View>
  );
}

export function Chip({ label, on, off, onPress, swatch, accent }: {
  label: string; on: boolean; off?: boolean; onPress: () => void; swatch?: string | null; accent: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on, disabled: !!off }}
      style={[s.chip, on && { borderColor: accent, backgroundColor: palette.paper }, off && s.chipOff]}>
      {swatch ? <View style={[s.swatch, { backgroundColor: swatch }]} /> : null}
      <Text style={[s.chipText, on && { color: palette.ink, fontFamily: type.bodyMedium.fontFamily }, off && s.chipTextOff]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Centre({ busy, message, action }: { busy?: boolean; message?: string; action?: React.ReactNode }) {
  return (
    <View style={s.centre}>
      {busy ? <ActivityIndicator color={palette.muted} /> : null}
      {message ? <Text style={s.centreText}>{message}</Text> : null}
      {action}
    </View>
  );
}

export function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "ok" }) {
  return (
    <View style={s.line}>
      <Text style={[s.lineLabel, strong && s.lineStrong]}>{label}</Text>
      <Text style={[s.lineValue, strong && s.lineStrong, tone === "ok" && { color: palette.ok }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingBottom: space.md, backgroundColor: palette.page },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  back: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
  kicker: { ...type.section, color: palette.muted, marginBottom: 2 },
  title: { ...type.title, color: palette.ink },
  stepper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: palette.line, borderRadius: radius.md, backgroundColor: palette.paper, alignSelf: "flex-start" },
  stepBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  stepOff: { opacity: 0.3 },
  stepValue: { ...type.number, minWidth: 34, textAlign: "center", color: palette.ink },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: palette.line, backgroundColor: palette.lineSoft },
  chipOff: { opacity: 0.45 },
  chipText: { ...type.small, color: palette.ink70 },
  chipTextOff: { textDecorationLine: "line-through" },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: "rgba(0,0,0,0.15)" },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg, gap: space.md, backgroundColor: palette.page },
  centreText: { ...type.body, color: palette.ink70, textAlign: "center" },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, gap: space.md },
  lineLabel: { ...type.body, color: palette.ink70, flexShrink: 1 },
  lineValue: { ...type.number, color: palette.ink },
  lineStrong: { fontFamily: type.bodyMedium.fontFamily, color: palette.ink, fontSize: 17 },
});
