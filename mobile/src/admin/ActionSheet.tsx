/**
 * What can be done to one row, asked before it is done.
 *
 * Every one of these changes somebody else's order and several of them send
 * mail, so each says in full what will happen before it runs, and says back
 * what happened when it did.
 */
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "@/api/client";
import type { Action } from "@/admin/actions";
import { palette, radius, space, type } from "@/ui/theme";

export function ActionSheet({
  rowId, title, subtitle, actions, onClose, onDone,
}: {
  /** The row this sheet was opened for, fixed for as long as it is open. */
  rowId: string;
  title: string;
  subtitle?: string;
  actions: Action[];
  onClose: () => void;
  /** Called after something actually changed, so the list can reload. */
  onDone: (message: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const rise = useRef(new Animated.Value(0)).current;
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1, duration: 200,
      easing: Easing.bezier(0.2, 0, 0, 1), useNativeDriver: true,
    }).start();
  }, [rise]);

  async function run(action: Action) {
    setBusy(action.key);
    setError(null);
    try {
      await action.run(rowId);
      onDone(action.done);
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : "That did not work.");
      setBusy(null);
      setPending(null);
    }
  }

  return (
    <View style={s.root} pointerEvents="box-none">
      <Animated.View style={[s.scrim, { opacity: rise }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={busy ? undefined : onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>

      <Animated.View
        style={[
          s.sheet,
          { paddingBottom: insets.bottom + space.md },
          { transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }) }] },
        ]}
      >
        <View style={s.grabber} />
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}

        {error ? <Text style={s.error}>{error}</Text> : null}

        {pending ? (
          <>
            <Text style={s.confirmText}>{pending.confirm}</Text>
            <Pressable
              onPress={() => run(pending)}
              disabled={busy !== null}
              style={({ pressed }) => [
                s.action, s.actionSolid,
                pending.destructive && s.actionDanger,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator size="small" color="#fff" /> : (
                <Text style={s.actionSolidText}>Yes, {pending.label.toLowerCase()}</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => { setPending(null); setError(null); }}
              disabled={busy !== null}
              style={({ pressed }) => [s.action, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
            >
              <Text style={s.actionText}>Back</Text>
            </Pressable>
          </>
        ) : (
          <>
            {actions.map((a) => (
              <Pressable
                key={a.key}
                onPress={() => { setPending(a); setError(null); }}
                style={({ pressed }) => [s.action, pressed && { backgroundColor: palette.page }]}
                accessibilityRole="button"
              >
                <Text style={[s.actionText, a.destructive && { color: palette.bad }]}>{a.label}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [s.action, s.cancel, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
            >
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
          </>
        )}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, justifyContent: "flex-end" },
  scrim: {
    position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: "rgba(17,19,24,0.4)",
  },
  sheet: {
    backgroundColor: palette.paper,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: space.lg, paddingTop: space.sm,
  },
  grabber: {
    width: 38, height: 4, borderRadius: 2, backgroundColor: palette.line,
    alignSelf: "center", marginBottom: space.md,
  },
  title: { ...type.title, fontSize: 19, color: palette.ink },
  subtitle: { ...type.small, color: palette.muted, marginTop: 1, marginBottom: space.sm },
  confirmText: { ...type.body, color: palette.ink70, marginVertical: space.md },
  error: { ...type.small, color: palette.bad, marginTop: space.sm },
  action: {
    paddingVertical: 14, borderRadius: radius.md, alignItems: "center",
    borderTopWidth: 1, borderTopColor: palette.lineSoft,
  },
  actionText: { ...type.body, fontSize: 15.5, color: palette.ink },
  actionSolid: { backgroundColor: palette.ink, borderTopWidth: 0, marginBottom: space.xs },
  actionDanger: { backgroundColor: palette.bad },
  actionSolidText: { ...type.bodyMedium, fontSize: 15.5, color: "#fff" },
  cancel: { marginTop: space.xs },
  cancelText: { ...type.body, fontSize: 15.5, color: palette.muted },
});
