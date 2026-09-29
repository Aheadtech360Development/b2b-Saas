/**
 * One door for everyone, as on the web.
 *
 * No question about which shop and no question about who you are: the email
 * finds the account, and the token that comes back says both. Asking somebody
 * to pick "I am a buyer" or "I am staff" would be asking them a question the
 * server has already answered.
 */
import { useState } from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "@/api/client";
import { requestPasswordReset, signIn, verifyTwoFactor } from "@/api/auth";
import type { Session } from "@/session/store";
import { Button, Field, Hero, Lede, Notice, TextButton } from "@/ui/components";
import { palette, space, type } from "@/ui/theme";

export function SignInScreen({
  onSignedIn, onApply,
}: {
  onSignedIn: (session: Session) => void;
  onApply: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentReset, setSentReset] = useState(false);

  const accent = palette.ink;

  async function submit() {
    setBusy(true);
    setError(null);
    setSentReset(false);
    try {
      const result = await signIn(email, password);
      if (result.requiresTwoFactor) setChallenge(result.challengeToken);
      else if (result.session) onSignedIn(result.session);
    } catch (e) {
      setError(reason(e, "Could not sign in. Check your email and password."));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await verifyTwoFactor(challenge, code, email));
    } catch (e) {
      setError(reason(e, "That code was not accepted."));
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (!email.trim()) {
      setError("Enter your email address first, then tap this again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email);
    } catch {
      // Ignored on purpose: answered the same way whether or not the address
      // is known, so this screen cannot be used to find out who has an account.
    } finally {
      setSentReset(true);
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.wordmark}>PRINTCOPILOT</Text>

        <View style={s.head}>
          <Hero>{challenge ? "One more step" : "Sign in"}</Hero>
          <Lede>
            {challenge
              ? "Enter the six digit code from your authenticator app."
              : "Your shop account, whether you run a shop or buy from one."}
          </Lede>
        </View>

        {error ? <Notice tone="bad">{error}</Notice> : null}
        {sentReset && !error ? (
          <Notice tone="ok">If that address has an account, a reset link is on its way.</Notice>
        ) : null}

        {challenge ? (
          <>
            <Field
              label="Authentication code"
              value={code}
              onChange={setCode}
              placeholder="000000"
              keyboard="number-pad"
            />
            <Button title="Continue" onPress={submitCode} busy={busy} accent={accent} />
            <View style={s.centreRow}>
              <TextButton
                title="Back"
                onPress={() => { setChallenge(null); setCode(""); setError(null); }}
              />
            </View>
          </>
        ) : (
          <>
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="you@company.com"
              keyboard="email-address"
              autoComplete="email"
            />
            <Field label="Password" value={password} onChange={setPassword} secure autoComplete="password" />

            <View style={s.forgotRow}>
              <TextButton title="Forgot your password?" onPress={forgot} />
            </View>

            <Button title="Sign in" onPress={submit} busy={busy} accent={accent} />

            <View style={s.divider}>
              <View style={s.rule} />
              <Text style={s.dividerText}>new here</Text>
              <View style={s.rule} />
            </View>

            <Button
              title="Apply for a wholesale account"
              onPress={onApply}
              accent={accent}
              variant="quiet"
            />
            <Text style={s.footHint}>You will need the shop code your supplier gave you.</Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function reason(e: unknown, fallback: string): string {
  return e instanceof ApiError && e.message ? e.message : fallback;
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.page },
  scroll: { paddingHorizontal: space.lg },
  wordmark: { ...type.section, color: palette.muted, marginBottom: space.xl },
  head: { marginBottom: space.lg },
  forgotRow: { alignItems: "flex-end", marginTop: -space.sm, marginBottom: space.xs },
  centreRow: { alignItems: "center" },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: space.lg, gap: space.sm },
  rule: { flex: 1, height: 1, backgroundColor: palette.line },
  dividerText: { ...type.small, color: palette.muted },
  footHint: { ...type.small, color: palette.muted, textAlign: "center", marginTop: space.sm },
});
