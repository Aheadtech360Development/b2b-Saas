/** The pieces every screen is built from, all sized from the one scale. */
import { useState } from "react";
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";

import { palette, radius, space, type } from "@/ui/theme";

export function Hero({ children }: { children: React.ReactNode }) {
  return <Text style={s.hero}>{children}</Text>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}

export function Lede({ children }: { children: React.ReactNode }) {
  return <Text style={s.lede}>{children}</Text>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={s.section}>{String(children).toUpperCase()}</Text>;
}

export function Field({
  label, value, onChange, placeholder, secure, keyboard, autoCapitalize, autoComplete, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboard?: "default" | "email-address" | "number-pad";
  autoCapitalize?: "none" | "characters" | "sentences";
  autoComplete?: "email" | "password" | "off";
  hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  // A password box with no way to see what is in it is where most failed
  // sign-ins on a phone keyboard come from.
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={s.fieldWrap}>
      <Text style={s.label}>{label}</Text>
      <View>
        <TextInput
          style={[s.input, secure && s.inputWithButton, focused && s.inputFocused]}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={palette.muted}
          secureTextEntry={secure && !revealed}
          keyboardType={keyboard ?? "default"}
          autoCapitalize={autoCapitalize ?? "none"}
          autoCorrect={false}
          autoComplete={autoComplete}
        />
        {secure ? (
          <Pressable
            style={s.reveal}
            onPress={() => setRevealed((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
          >
            <Text style={s.revealText}>{revealed ? "Hide" : "Show"}</Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
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
        (pressed || busy) && { opacity: 0.72 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={solid ? "#fff" : palette.ink} size="small" />
      ) : (
        <Text style={[s.buttonText, !solid && { color: palette.ink }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function TextButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button">
      <Text style={s.textButton}>{title}</Text>
    </Pressable>
  );
}

export function Notice({ tone, children }: { tone: "bad" | "ok" | "warn"; children: React.ReactNode }) {
  const t = {
    bad: { bg: palette.badSoft, fg: palette.bad },
    ok: { bg: palette.okSoft, fg: palette.ok },
    warn: { bg: palette.warnSoft, fg: palette.warn },
  }[tone];
  return (
    <View style={[s.notice, { backgroundColor: t.bg }]}>
      <Text style={[s.noticeText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

export function Card({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  if (!onPress) return <View style={s.card}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      {children}
    </Pressable>
  );
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, strong && s.rowValueStrong]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

/** One number, said plainly. Four of these is a dashboard. */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

/** Order status, coloured only where colour means something. */
export function Pill({ text }: { text: string }) {
  const lower = text.toLowerCase();
  const tone =
    ["paid", "delivered", "completed", "shipped"].some((w) => lower.includes(w)) ? "ok"
    : ["cancelled", "refunded", "failed", "unpaid"].some((w) => lower.includes(w)) ? "bad"
    : "warn";
  const t = {
    ok: { bg: palette.okSoft, fg: palette.ok },
    bad: { bg: palette.badSoft, fg: palette.bad },
    warn: { bg: palette.warnSoft, fg: palette.warn },
  }[tone];
  return (
    <View style={[s.pill, { backgroundColor: t.bg }]}>
      <Text style={[s.pillText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={s.divider} />;
}

const s = StyleSheet.create({
  hero: { ...type.hero, color: palette.ink },
  title: { ...type.title, color: palette.ink },
  lede: { ...type.body, color: palette.ink70, marginTop: space.xs },
  section: { ...type.section, color: palette.muted, marginBottom: space.sm },

  fieldWrap: { marginBottom: space.md },
  label: { ...type.label, color: palette.ink, marginBottom: space.xs },
  input: {
    borderWidth: 1, borderColor: palette.line, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 14,
    fontFamily: type.body.fontFamily, fontSize: 16,
    color: palette.ink, backgroundColor: palette.paper,
  },
  inputFocused: { borderColor: palette.ink },
  inputWithButton: { paddingRight: 66 },
  reveal: { position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" },
  revealText: { ...type.label, color: palette.muted },
  hint: { ...type.small, color: palette.muted, marginTop: space.xs },

  button: {
    borderRadius: radius.md, paddingVertical: 15,
    alignItems: "center", justifyContent: "center", minHeight: 52,
  },
  buttonQuiet: { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
  buttonText: { fontFamily: type.bodyMedium.fontFamily, fontSize: 15.5, color: "#fff", letterSpacing: 0.1 },
  textButton: { ...type.label, color: palette.muted, paddingVertical: space.sm },

  notice: { borderRadius: radius.md, padding: 14, marginBottom: space.md },
  noticeText: { ...type.small, lineHeight: 20 },

  card: {
    backgroundColor: palette.paper, borderRadius: radius.lg,
    borderWidth: 1, borderColor: palette.line,
    paddingHorizontal: 18, paddingVertical: 14, marginBottom: space.sm,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, gap: space.md },
  rowLabel: { ...type.small, color: palette.muted },
  rowValue: { ...type.small, color: palette.ink, flexShrink: 1, textAlign: "right" },
  rowValueStrong: { ...type.number, color: palette.ink, textAlign: "right" },

  stat: {
    flex: 1, backgroundColor: palette.paper, borderRadius: radius.lg,
    borderWidth: 1, borderColor: palette.line, paddingVertical: 16, paddingHorizontal: 14,
  },
  statValue: { ...type.big, color: palette.ink },
  statLabel: { ...type.small, color: palette.muted, marginTop: 2 },

  pill: { alignSelf: "flex-start", borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontFamily: type.label.fontFamily, fontSize: 11.5, letterSpacing: 0.3 },

  divider: { height: 1, backgroundColor: palette.lineSoft, marginVertical: space.sm },
});
