/**
 * Phase 1: getting in, and seeing your own account.
 *
 * Three screens and no navigation library yet — there are only three, and the
 * rule between them is a single question: is there a session? Browsing,
 * cart and checkout come next, and that is when routing earns its place.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { readSession, type Session } from "@/session/store";
import { refresh } from "@/api/client";
import { AccountScreen } from "@/screens/AccountScreen";
import { ApplyScreen } from "@/screens/ApplyScreen";
import { SignInScreen } from "@/screens/SignInScreen";
import { palette } from "@/ui/theme";

type View_ = "loading" | "signIn" | "apply" | "account";

export default function App() {
  const [view, setView] = useState<View_>("loading");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // A stored session is not proof of a live one: the access token may have
    // expired while the app was closed. Refreshing here means somebody who
    // opens the app after a week lands on their account, not on a sign-in
    // screen with a perfectly good session sitting in the Keychain.
    (async () => {
      const stored = await readSession();
      if (!stored?.accessToken) {
        setView("signIn");
        return;
      }
      await refresh();
      const current = await readSession();
      if (current?.accessToken) {
        setSession(current);
        setView("account");
      } else {
        setView("signIn");
      }
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      {view === "loading" && (
        <View style={s.centre}>
          <ActivityIndicator color={palette.muted} />
        </View>
      )}
      {view === "signIn" && (
        <SignInScreen
          onSignedIn={(s) => {
            setSession(s);
            setView("account");
          }}
          onApply={() => setView("apply")}
        />
      )}
      {view === "apply" && <ApplyScreen onDone={() => setView("signIn")} />}
      {view === "account" && session && (
        <AccountScreen
          session={session}
          onSignedOut={() => {
            setSession(null);
            setView("signIn");
          }}
        />
      )}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.page },
});
