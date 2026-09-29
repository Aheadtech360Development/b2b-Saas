/**
 * Applying for a wholesale account, from a phone.
 *
 * Two steps, because the app has to know which shop before it can show the
 * form: a shop code first, then the details. The code is how a supplier
 * hands out their shop when there is no address bar to type into.
 *
 * The password is set here, by the applicant, exactly as on the web — so
 * that when the shop approves them, they already have a way in.
 */
import { useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";

import { ApiError, call } from "@/api/client";
import { findByCode, type Shop } from "@/api/shop";
import { Button, Field, Heading, Lede, Notice } from "@/ui/components";
import { accentFor, palette } from "@/ui/theme";

export function ApplyScreen({ onDone }: { onDone: () => void }) {
  const [shop, setShop] = useState<Shop | null>(null);
  const [code, setCode] = useState("");
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    company_name: "", business_type: "", password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const accent = accentFor(shop?.primaryColor);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function lookUp() {
    setBusy(true);
    setError(null);
    try {
      const found = await findByCode(code);
      if (!found.acceptsWholesaleSignup) {
        // A retail-only shop has no screen where such an application would be
        // read, so it must not be taken. Better refused here than left to sit
        // somewhere nobody looks.
        setError(`${found.name} does not take wholesale applications.`);
        return;
      }
      setShop(found);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? "No shop has that code. Check it with your supplier."
          : reason(e, "Could not look that code up. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!shop) return;
    setBusy(true);
    setError(null);
    try {
      await call("/api/v1/register-wholesale", {
        method: "POST",
        anonymous: true,
        tenantSlug: shop.slug,
        body: form,
      });
      setSubmitted(true);
    } catch (e) {
      setError(reason(e, "Could not send your application. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <View style={s.done}>
        <Heading>Application sent</Heading>
        <Lede>
          {shop?.name} will review it and email you. Once approved, sign in with the
          email and password you just set.
        </Lede>
        <View style={s.gap} />
        <Button title="Back to sign in" onPress={onDone} accent={accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Heading>{shop ? `Apply to ${shop.name}` : "Find your shop"}</Heading>
        <Lede>
          {shop
            ? "They will review this and email you when it is approved."
            : "Enter the shop code your supplier gave you."}
        </Lede>
        <View style={s.gap} />

        {error && <Notice tone="bad">{error}</Notice>}

        {!shop ? (
          <>
            <Field
              label="Shop code"
              value={code}
              onChange={setCode}
              placeholder="e.g. 7K2QWM"
              autoCapitalize="characters"
            />
            <Button title="Continue" onPress={lookUp} busy={busy} accent={accent} />
          </>
        ) : (
          <>
            <Field label="First name" value={form.first_name} onChange={set("first_name")} autoCapitalize="sentences" />
            <Field label="Last name" value={form.last_name} onChange={set("last_name")} autoCapitalize="sentences" />
            <Field label="Email" value={form.email} onChange={set("email")} keyboard="email-address" autoComplete="email" />
            <Field label="Phone" value={form.phone} onChange={set("phone")} keyboard="number-pad" />
            <Field label="Company name" value={form.company_name} onChange={set("company_name")} autoCapitalize="sentences" />
            <Field
              label="Business type"
              value={form.business_type}
              onChange={set("business_type")}
              placeholder="Retailer, decorator, promo…"
              autoCapitalize="sentences"
            />
            <Field label="Choose a password" value={form.password} onChange={set("password")} secure />
            <Text style={s.hint}>At least 8 characters. This is how you will sign in.</Text>
            <View style={s.gap} />
            <Button title="Send application" onPress={submit} busy={busy} accent={accent} />
          </>
        )}

        <Pressable onPress={shop ? () => setShop(null) : onDone} hitSlop={8}>
          <Text style={s.link}>{shop ? "Use a different shop code" : "Back to sign in"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function reason(e: unknown, fallback: string): string {
  return e instanceof ApiError && e.message ? e.message : fallback;
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.page },
  scroll: { padding: 24, paddingTop: 72, paddingBottom: 48 },
  done: { flex: 1, backgroundColor: palette.page, padding: 24, paddingTop: 120 },
  gap: { height: 16 },
  hint: { fontSize: 13, color: palette.muted, marginTop: -8, marginBottom: 4 },
  link: { fontSize: 14, fontWeight: "600", color: palette.muted, textAlign: "center", marginTop: 20 },
});
