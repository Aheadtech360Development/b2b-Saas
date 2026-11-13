/**
 * The console.
 *
 * A bottom bar for the four places somebody goes daily, More for the rest,
 * and three pieces of state underneath: which section is open, which record
 * inside it, and whether that record is being read or changed. That is the
 * whole of the navigation, so it is written here rather than taken from a
 * library that would bring a stack, a gesture handler and a worklet along
 * with it.
 */
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { signOut } from "@/api/auth";
import { currentShop } from "@/api/shop";
import { Dashboard } from "@/admin/Dashboard";
import { DetailScreen } from "@/admin/DetailScreen";
import { FormScreen } from "@/admin/FormScreen";
import { ListScreen } from "@/admin/ListScreen";
import { MoreScreen } from "@/admin/MoreScreen";
import { TabBar } from "@/admin/TabBar";
import { FORMS } from "@/admin/forms";
import { sectionByKey, type Row } from "@/admin/sections";
import type { Session } from "@/session/store";
import { palette } from "@/ui/theme";

export function AdminApp({ session, onSignedOut }: { session: Session; onSignedOut: () => void }) {
  const [current, setCurrent] = useState("dashboard");
  const [shopName, setShopName] = useState("Your shop");
  // The record being looked at, and whether it is open for changes. Both are
  // cleared whenever the section changes, so a new list never opens under the
  // previous list's record.
  const [open, setOpen] = useState<Row | null>(null);
  const [editing, setEditing] = useState(false);
  // Bumped after a save, so the list behind re-reads rather than showing the
  // row as it was before the change.
  const [version, setVersion] = useState(0);

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

  const go = useCallback((key: string) => {
    setOpen(null);
    setEditing(false);
    setCurrent(key);
  }, []);

  const section = sectionByKey(current);
  // A settings screen is a form with no record behind it.
  const settingsForm = section?.form ? FORMS[section.form] : undefined;
  const recordForm = section && FORMS[section.key];

  return (
    <View style={s.root}>
      <View style={s.body}>
        {current === "dashboard" ? (
          <Dashboard shopName={shopName} onGo={go} />
        ) : current === "more" ? (
          <MoreScreen shopName={shopName} onPick={go} onSignOut={leave} />
        ) : settingsForm ? (
          <FormScreen
            key={section!.key}
            form={settingsForm}
            id=""
            title={section!.label}
            subtitle={shopName}
            onBack={() => go("more")}
            onSaved={() => setVersion((v) => v + 1)}
          />
        ) : section && open && editing && recordForm ? (
          <FormScreen
            form={recordForm}
            id={open.id}
            title={open.title}
            subtitle={section.label}
            onBack={() => setEditing(false)}
            onSaved={() => setVersion((v) => v + 1)}
          />
        ) : section && open ? (
          <DetailScreen
            key={`${section.key}:${open.id}:${version}`}
            section={section}
            row={open}
            onBack={() => setOpen(null)}
            onEdit={recordForm ? () => setEditing(true) : undefined}
          />
        ) : section ? (
          // Keyed by section and version so moving between lists remounts,
          // and so a saved change is reflected rather than left stale.
          <ListScreen key={`${section.key}:${version}`} section={section} onOpenRow={setOpen} />
        ) : null}
      </View>
      <TabBar current={current} onPick={go} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.page },
  body: { flex: 1 },
});
