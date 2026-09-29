/** The handful of pieces every screen is built from. */
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useState } from "react";

import { palette, radius } from "@/ui/theme";

export function Heading({ children }: { children: React.ReactNode }) {
  return <Text style={s.heading}>{children}</Text>;
}

export function Lede({ children }: { children: React.ReactNode }) {
  return <Text style={s.lede}>{children}</Text>;
}

export function Field({
  label, value, onChange, placeholder, secure, keyboard, autoCapitalize, autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboard?: "default" | "email-address" | "number-pad";
  autoCapitalize?: "none" | "characters" | "sentences";
  autoComplete?: "email" | "password" | "off";
}) {
  // A password box with no way to see what is in it is where most failed
  // sign-ins come from on a phone keyboard.
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={s.fieldWrap}>
      <Text style={s.label}>{label}</Text>
      <View>
        <TextInput
          style={[s.input, secure && s.inputWithButton]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#A1A1AA"
          secureTextEntry={secure && !revealed}
          keyboardType={keyboard ?? "default"}
          autoCapitalize={autoCapitalize ?? "none"}
          autoCorrect={false}
          autoComplete={autoComplete}
        />
        {secure && (
          <Pressable
            style={s.reveal}
            onPress={() => setRevealed((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
          >
            <Text style={s.revealText}>{revealed ? "Hide" : "Show"}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function Button({
  title, onPress, busy, accent, variant = "solid",
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  accent: string;
  variant?: "solid" | "quiet";
}) {
  const solid = variant === "solid";
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!busy }}
      style={({ pressed }) => [
        s.button,
        solid ? { backgroundColor: accent } : s.buttonQuiet,
        (pressed || busy) && { opacity: 0.7 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={solid ? "#fff" : palette.ink} />
      ) : (
        <Text style={[s.buttonText, !solid && { color: palette.ink }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Notice({ tone, children }: { tone: "bad" | "ok" | "warn"; children: React.ReactNode }) {
  const tones = {
    bad: { bg: palette.badSoft, fg: palette.bad },
    ok: { bg: palette.okSoft, fg: palette.ok },
    warn: { bg: palette.warnSoft, fg: palette.warn },
  }[tone];
  return (
    <View style={[s.notice, { backgroundColor: tones.bg }]}>
      <Text style={[s.noticeText, { color: tones.fg }]}>{children}</Text>
    </View>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  heading: { fontSize: 28, fontWeight: "700", color: palette.ink, letterSpacing: -0.4 },
  lede: { fontSize: 15, color: palette.muted, marginTop: 6, lineHeight: 22 },
  fieldWrap: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: palette.ink, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: palette.line, borderRadius: radius,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 16,
    color: palette.ink, backgroundColor: palette.paper,
  },
  inputWithButton: { paddingRight: 64 },
  reveal: { position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" },
  revealText: { fontSize: 13, fontWeight: "600", color: palette.muted },
  button: {
    borderRadius: radius, paddingVertical: 15, alignItems: "center", justifyContent: "center",
    minHeight: 50,
  },
  buttonQuiet: { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  notice: { borderRadius: radius, padding: 13, marginBottom: 16 },
  noticeText: { fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: palette.paper, borderRadius: 14, borderWidth: 1,
    borderColor: palette.line, padding: 18, marginBottom: 16,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, gap: 16 },
  rowLabel: { fontSize: 14, color: palette.muted },
  rowValue: { fontSize: 14, color: palette.ink, fontWeight: "600", flexShrink: 1, textAlign: "right" },
});
