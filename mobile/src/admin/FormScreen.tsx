/**
 * Changing a record.
 *
 * One screen for all of them, because a form differs from another form in its
 * fields and its endpoint and in nothing else. Save sends only what changed,
 * so editing one field on a record somebody else is also editing does not
 * write back their work as it was when this screen opened.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, call } from "@/api/client";
import { apiValue, changedOnly, valueOf, type Field, type Form } from "@/admin/forms";
import { TAB_BAR_SPACE } from "@/admin/tabs";
import { Notice } from "@/ui/components";
import { palette, radius, space, type } from "@/ui/theme";

type Values = Record<string, string | boolean>;

export function FormScreen({
  form, id, title, subtitle, onBack, onSaved,
}: {
  form: Form;
  /** Empty for the settings forms, which have no record. */
  id: string;
  title: string;
  subtitle?: string;
  onBack: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState<Record<string, unknown> | null>(null);
  const [values, setValues] = useState<Values>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const raw = await call<any>(form.load(id));
      const flat = form.read ? form.read(raw) : (raw ?? {});
      setLoaded(flat);
      const next: Values = {};
      for (const f of form.fields) next[f.key] = valueOf(f, flat[f.key]);
      setValues(next);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403 ? "Your plan does not include this."
        : e instanceof ApiError && e.message ? e.message
        : "Could not load this.",
      );
    }
  }, [form, id]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  // What the save would send, which is also what decides whether Save is on.
  const changes = useMemo(() => {
    if (!loaded) return {};
    const after: Record<string, unknown> = {};
    for (const f of form.fields) after[f.key] = apiValue(f, values[f.key]);
    const before: Record<string, unknown> = {};
    for (const f of form.fields) before[f.key] = apiValue(f, valueOf(f, loaded[f.key]));
    return changedOnly(before, after);
  }, [form.fields, values, loaded]);

  const dirty = Object.keys(changes).length > 0;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await call(form.save(id), { method: form.method, body: changes });
      setSaid("Saved.");
      setTimeout(() => setSaid(null), 2200);
      // Reloaded so the screen shows what the server kept, not what was
      // typed: a field the server trims or rejects would otherwise look saved.
      await load();
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.head, { paddingTop: insets.top + space.sm }]}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={palette.ink} />
        </Pressable>
        <View style={s.headText}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <Pressable
          onPress={save}
          disabled={!dirty || saving}
          style={({ pressed }) => [s.save, !dirty && s.saveOff, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={s.saveText}>Save</Text>
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={s.centre}><ActivityIndicator color={palette.muted} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: space.lg,
            paddingBottom: insets.bottom + TAB_BAR_SPACE,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {error ? <Notice tone="bad">{error}</Notice> : null}

          {form.fields.map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
            />
          ))}

          {dirty ? (
            <Text style={s.dirtyNote}>
              {Object.keys(changes).length} {Object.keys(changes).length === 1 ? "change" : "changes"} not saved yet.
            </Text>
          ) : null}
        </ScrollView>
      )}

      {said ? (
        <View style={[s.said, { bottom: insets.bottom + TAB_BAR_SPACE }]} pointerEvents="none">
          <Text style={s.saidText}>{said}</Text>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function FieldRow({
  field, value, onChange,
}: {
  field: Field;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}) {
  if (field.kind === "switch") {
    return (
      <View style={s.switchRow}>
        <View style={s.switchText}>
          <Text style={s.label}>{field.label}</Text>
          {field.hint ? <Text style={s.hint}>{field.hint}</Text> : null}
        </View>
        <Switch
          value={value === true}
          onValueChange={onChange}
          trackColor={{ true: palette.ink, false: palette.line }}
          thumbColor="#fff"
        />
      </View>
    );
  }

  if (field.kind === "select") {
    return (
      <View style={s.field}>
        <Text style={s.label}>{field.label}</Text>
        <View style={s.options}>
          {(field.options ?? []).map((o) => {
            const on = String(value) === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => onChange(o.value)}
                style={({ pressed }) => [s.option, on && s.optionOn, pressed && !on && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[s.optionText, on && s.optionTextOn]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {field.hint ? <Text style={s.hint}>{field.hint}</Text> : null}
      </View>
    );
  }

  const multiline = field.kind === "multiline";
  return (
    <View style={s.field}>
      <Text style={s.label}>{field.label}</Text>
      <TextInput
        style={[s.input, multiline && s.inputTall]}
        value={String(value ?? "")}
        onChangeText={onChange}
        placeholder={field.placeholder}
        placeholderTextColor={palette.muted}
        multiline={multiline}
        keyboardType={field.kind === "number" || field.kind === "money" ? "decimal-pad" : "default"}
        autoCapitalize={multiline ? "sentences" : "none"}
        autoCorrect={multiline}
      />
      {field.hint ? <Text style={s.hint}>{field.hint}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  head: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    paddingHorizontal: space.md, paddingBottom: space.md,
  },
  headText: { flex: 1 },
  title: { ...type.title, fontSize: 20, color: palette.ink },
  subtitle: { ...type.small, color: palette.muted },
  save: {
    backgroundColor: palette.ink, borderRadius: radius.md,
    paddingHorizontal: 18, paddingVertical: 10, minWidth: 74, alignItems: "center",
  },
  saveOff: { backgroundColor: palette.line },
  saveText: { ...type.bodyMedium, fontSize: 14.5, color: "#fff" },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },

  field: { marginBottom: space.md },
  label: { ...type.label, color: palette.ink, marginBottom: space.xs },
  hint: { ...type.small, fontSize: 12.5, color: palette.muted, marginTop: space.xs, lineHeight: 18 },
  input: {
    borderWidth: 1, borderColor: palette.line, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 13,
    fontFamily: type.body.fontFamily, fontSize: 15.5,
    color: palette.ink, backgroundColor: palette.paper,
  },
  inputTall: { minHeight: 96, textAlignVertical: "top" },

  switchRow: {
    flexDirection: "row", alignItems: "center", gap: space.md,
    backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13,
    marginBottom: space.md,
  },
  switchText: { flex: 1 },

  options: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  option: {
    borderWidth: 1, borderColor: palette.line, borderRadius: 100,
    paddingHorizontal: 14, paddingVertical: 9, backgroundColor: palette.paper,
  },
  optionOn: { backgroundColor: palette.ink, borderColor: palette.ink },
  optionText: { ...type.small, fontSize: 13.5, color: palette.ink70 },
  optionTextOn: { color: "#fff", fontFamily: type.label.fontFamily },

  dirtyNote: { ...type.small, color: palette.muted, textAlign: "center", marginTop: space.sm },
  said: {
    position: "absolute", left: space.lg, right: space.lg,
    backgroundColor: palette.ink, borderRadius: radius.md,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  saidText: { ...type.small, color: "#fff" },
});
