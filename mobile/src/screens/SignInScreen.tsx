/**
 * One door, as on the web.
 *
 * No question about which shop: the email finds the account and the token
 * that comes back names the brand. Asking somebody to remember their shop's
 * code before they can sign in would be a question the server can answer.
 */
import { useState } from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, Pressable,
} from "react-native";

import { ApiError } from "@/api/client";
import { requestPasswordReset, signIn, verifyTwoFactor } from "@/api/auth";
import type { Session } from "@/session/store";
import { Button, Field, Heading, Lede, Notice } from "@/ui/components";
import { palette } from "@/ui/theme";

export function SignInScreen({
  onSignedIn, onApply,
}: {
  onSignedIn: (session: Session) => void;
  onApply: () => void;
}) {
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
    try {
      const result = await signIn(email, password);
      if (result.requiresTwoFactor) {
        setChallenge(result.challengeToken);
      } else if (result.session) {
        onSignedIn(result.session);
      }
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
      // Said the same way whether or not the address is known, so this screen
      // cannot be used to find out who has an account.
      setSentReset(true);
    } catch {
      setSentReset(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Heading>{challenge ? "One more step" : "Sign in"}</Heading>
          <Lede>
            {challenge
              ? "Enter the six-digit code from your authenticator app."
              : "Your shop account, wherever you bought from."}
          </Lede>
        </View>

        {error && <Notice tone="bad">{error}</Notice>}
        {sentReset && !error && (
          <Notice tone="ok">
            If that address has an account, a reset link is on its way.
          </Notice>
        )}

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
            <Pressable onPress={() => { setChallenge(null); setCode(""); setError(null); }} hitSlop={8}>
              <Text style={s.link}>Back</Text>
            </Pressable>
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
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              secure
              autoComplete="password"
            />
            <Pressable onPress={forgot} hitSlop={8}>
              <Text style={s.link}>Forgot your password?</Text>
            </Pressable>
            <View style={s.gap} />
            <Button title="Sign in" onPress={submit} busy={busy} accent={accent} />

            <View style={s.divider}>
              <View style={s.rule} />
              <Text style={s.dividerText}>or</Text>
              <View style={s.rule} />
            </View>

            <Button
              title="Apply for a wholesale account"
              onPress={onApply}
              accent={accent}
              variant="quiet"
            />
            <Text style={s.hint}>
              You will need the shop code your supplier gave you.
            </Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** What the server said, when it said something worth reading. */
function reason(e: unknown, fallback: string): string {
  return e instanceof ApiError && e.message ? e.message : fallback;
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.page },
  scroll: { padding: 24, paddingTop: 72, paddingBottom: 48 },
  header: { marginBottom: 28 },
  gap: { height: 8 },
  link: { fontSize: 14, fontWeight: "600", color: palette.muted, marginTop: 4, marginBottom: 8 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 24, gap: 12 },
  rule: { flex: 1, height: 1, backgroundColor: palette.line },
  dividerText: { fontSize: 13, color: palette.muted },
  hint: { fontSize: 13, color: palette.muted, textAlign: "center", marginTop: 12, lineHeight: 19 },
});
