/**
 * The console, with its menu.
 *
 * A drawer written here rather than pulled from a navigation library: there
 * is one level of navigation and one piece of state, the section currently
 * open. A navigator would bring a stack, a gesture handler and a reanimated
 * worklet to hold a single string.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated, Dimensions, Easing, Pressable, StyleSheet, View,
} from "react-native";

import { signOut } from "@/api/auth";
import { currentShop, type Shop } from "@/api/shop";
import { Dashboard } from "@/admin/Dashboard";
import { ListScreen } from "@/admin/ListScreen";
import { Sidebar } from "@/admin/Sidebar";
import { sectionByKey, SECTIONS } from "@/admin/sections";
import type { Session } from "@/session/store";
import { palette } from "@/ui/theme";

const PANEL = Math.min(300, Dimensions.get("window").width * 0.82);

export function AdminApp({ session, onSignedOut }: { session: Session; onSignedOut: () => void }) {
  const [current, setCurrent] = useState("dashboard");
  const [shop, setShop] = useState<Shop | null>(null);
  const [open, setOpen] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!session.tenantSlug) return;
    currentShop(session.tenantSlug).then(setShop).catch(() => {
      // The shop's name is decoration here. Its absence must not keep the
      // console from opening.
    });
  }, [session.tenantSlug]);

  const animate = useCallback((to: number) => {
    Animated.timing(slide, {
      toValue: to,
      duration: 220,
      // Decelerating rather than linear: a panel that stops dead reads as a
      // dropped frame even when nothing was dropped.
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: true,
    }).start();
  }, [slide]);

  const show = useCallback(() => { setOpen(true); animate(1); }, [animate]);
  const hide = useCallback(() => {
    animate(0);
    // Unmounted after the animation, so the panel does not vanish mid-slide.
    setTimeout(() => setOpen(false), 220);
  }, [animate]);

  const pick = useCallback((key: string) => {
    setCurrent(key);
    hide();
  }, [hide]);

  const section = sectionByKey(current) ?? SECTIONS[0];
  const shopName = shop?.name ?? "Your shop";

  return (
    <View style={s.root}>
      {current === "dashboard" ? (
        <Dashboard shopName={shopName} onOpenMenu={show} onGo={setCurrent} />
      ) : (
        <ListScreen key={section.key} section={section} onOpenMenu={show} />
      )}

      {open ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View
            style={[s.scrim, { opacity: slide }]}
            pointerEvents={open ? "auto" : "none"}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={hide}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
            />
          </Animated.View>

          <Animated.View
            style={[
              s.panel,
              { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-PANEL, 0] }) }] },
            ]}
          >
            <Sidebar
              current={current}
              shopName={shopName}
              onPick={pick}
              onSignOut={() => { signOut().finally(onSignedOut); }}
            />
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.page },
  scrim: {
    position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: "rgba(17,19,24,0.32)",
  },
  panel: {
    position: "absolute", top: 0, bottom: 0, left: 0, width: PANEL,
    backgroundColor: palette.paper,
    borderRightWidth: 1, borderRightColor: palette.line,
  },
});
