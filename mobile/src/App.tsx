/**
 * Which app you get, decided by who signed in.
 *
 * A shop's own people and a shop's customers want entirely different things,
 * so they get entirely different screens. The token says which, and nobody is
 * asked to pick.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { Fraunces_400Regular, Fraunces_600SemiBold } from "@expo-google-fonts/fraunces";

import { readSession, type Session } from "@/session/store";
import { refresh } from "@/api/client";
import { AccountScreen } from "@/screens/AccountScreen";
import { AdminApp } from "@/admin/AdminApp";
import { ApplyScreen } from "@/screens/ApplyScreen";
import { SignInScreen } from "@/screens/SignInScreen";
import { palette } from "@/ui/theme";

type Screen = "loading" | "signIn" | "apply" | "home";

export default function App() {
  const [fontsReady] = useFonts({
    DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
    Fraunces_400Regular, Fraunces_600SemiBold,
  });
  const [screen, setScreen] = useState<Screen>("loading");
  const [session, setSession] = useState<Session | null>(null);

  const restore = useCallback(async () => {
    // A stored session is not proof of a live one: the access token may have
    // expired while the app was closed. Refreshing here is what lets somebody
    // who opens the app after a week land on their own screen rather than on
    // a sign-in form with a perfectly good session in the Keychain.
    const stored = await readSession();
    if (!stored?.accessToken) {
      setScreen("signIn");
      return;
    }
    await refresh();
    const current = await readSession();
    if (current?.accessToken) {
      setSession(current);
      setScreen("home");
    } else {
      setScreen("signIn");
    }
  }, []);

  useEffect(() => { restore(); }, [restore]);

  // Text rendered before the fonts arrive would appear in the system face and
  // then jump, which is worse than a moment of nothing.
  const busy = !fontsReady || screen === "loading";

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      {busy ? (
        <View style={s.centre}>
          <ActivityIndicator color={palette.muted} />
        </View>
      ) : screen === "signIn" ? (
        <SignInScreen
          onSignedIn={(next) => { setSession(next); setScreen("home"); }}
          onApply={() => setScreen("apply")}
        />
      ) : screen === "apply" ? (
        <ApplyScreen onDone={() => setScreen("signIn")} />
      ) : session ? (
        session.isAdmin ? (
          <AdminApp
            session={session}
            onSignedOut={() => { setSession(null); setScreen("signIn"); }}
          />
        ) : (
          <AccountScreen
            session={session}
            onSignedOut={() => { setSession(null); setScreen("signIn"); }}
          />
        )
      ) : null}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.page },
});
