/**
 * The console.
 *
 * A bottom bar for the four places somebody goes daily, More for the rest,
 * and one piece of state underneath: which section is open. That is the
 * whole of the navigation, so it is written here rather than taken from a
 * library that would bring a stack, a gesture handler and a worklet to hold
 * a single string.
 */
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { signOut } from "@/api/auth";
import { currentShop } from "@/api/shop";
import { Dashboard } from "@/admin/Dashboard";
import { DetailScreen } from "@/admin/DetailScreen";
import { ListScreen } from "@/admin/ListScreen";
import { MoreScreen } from "@/admin/MoreScreen";
import { TabBar } from "@/admin/TabBar";
import { sectionByKey, type Row } from "@/admin/sections";
import type { Session } from "@/session/store";
import { palette } from "@/ui/theme";

export function AdminApp({ session, onSignedOut }: { session: Session; onSignedOut: () => void }) {
  const [current, setCurrent] = useState("dashboard");
  const [shopName, setShopName] = useState("Your shop");
  // The record being read, if any. Cleared whenever the section changes, so
  // going to a new list never opens under the previous list's record.
  const [open, setOpen] = useState<Row | null>(null);

  useEffect(() => {
    if (!session.tenantSlug) return;
    currentShop(session.tenantSlug)
      .then((shop) => { if (shop.name) setShopName(shop.name); })
      .catch(() => {
        // The shop's name is a label here. Its absence must not keep the
        // console from opening.
      });
  }, [session.tenantSlug]);

  const leave = useCallback(() => { signOut().finally(onSignedOut); }, [onSignedOut]);

  const section = sectionByKey(current);

  return (
    <View style={s.root}>
      <View style={s.body}>
        {current === "dashboard" ? (
          <Dashboard shopName={shopName} onGo={(key) => { setOpen(null); setCurrent(key); }} />
        ) : current === "more" ? (
          <MoreScreen shopName={shopName} onPick={(key) => { setOpen(null); setCurrent(key); }} onSignOut={leave} />
        ) : section && open ? (
          <DetailScreen section={section} row={open} onBack={() => setOpen(null)} />
        ) : section ? (
          // Keyed by section so moving between lists remounts rather than
          // showing the previous list's rows under the new list's title.
          <ListScreen key={section.key} section={section} onOpenRow={setOpen} />
        ) : null}
      </View>
      <TabBar current={current} onPick={(key) => { setOpen(null); setCurrent(key); }} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.page },
  body: { flex: 1 },
});
