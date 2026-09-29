/**
 * Icons, with the tint they carry.
 *
 * A flat grey icon beside a number reads as decoration. Each one here comes
 * with a soft background of its own colour, which is what makes a row of
 * figures scannable rather than uniform.
 */
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

export type IconName = keyof typeof Ionicons.glyphMap;

export const tints = {
  red: { fg: "#C0342B", bg: "#FCEEEC" },
  green: { fg: "#1F6F4A", bg: "#EAF6EF" },
  blue: { fg: "#2B5FA8", bg: "#EBF1FB" },
  violet: { fg: "#5B4BB5", bg: "#F0EEFB" },
  amber: { fg: "#8A5A00", bg: "#FBF2E2" },
  slate: { fg: "#4A4E57", bg: "#F0F0EC" },
} as const;

export type Tint = keyof typeof tints;

export function Icon({
  name, tint = "slate", size = 18,
}: {
  name: IconName;
  tint?: Tint;
  size?: number;
}) {
  return <Ionicons name={name} size={size} color={tints[tint].fg} />;
}

/** An icon in its own rounded tile, as the stat cards use. */
export function IconTile({
  name, tint = "slate", size = 38,
}: {
  name: IconName;
  tint?: Tint;
  size?: number;
}) {
  return (
    <View
      style={[
        s.tile,
        { width: size, height: size, borderRadius: size / 3, backgroundColor: tints[tint].bg },
      ]}
    >
      <Ionicons name={name} size={size * 0.48} color={tints[tint].fg} />
    </View>
  );
}

const s = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center" },
});
