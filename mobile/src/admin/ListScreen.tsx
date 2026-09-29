/**
 * Every list in the console, from one screen.
 *
 * The sections differ in where their rows come from and how a row reads, and
 * in nothing else, so they share this: the same search, the same pull to
 * refresh, the same empty state, and the same behaviour when a request
 * fails. Twenty hand-written lists would have differed in all four.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, call } from "@/api/client";
import type { Row, Section } from "@/admin/sections";
import { actionsFor } from "@/admin/actions";
import { ActionSheet } from "@/admin/ActionSheet";
import { Notice, Pill } from "@/ui/components";
import { palette, radius, space, type } from "@/ui/theme";

export function ListScreen({ section }: { section: Section }) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // The row whose actions are open, and what the last one did.
  const [acting, setActing] = useState<Row | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const actions = actionsFor(section.key);

  const load = useCallback(async () => {
    if (!section.path || !section.row || !section.pick) {
      setRows([]);
      return;
    }
    setError(null);
    try {
      const sep = section.path.includes("?") ? "&" : "?";
      const body = await call<unknown>(`${section.path}${sep}page=1&page_size=50`);
      setRows(section.pick(body).map(section.row).filter((r) => r.id || r.title));
    } catch (e) {
      // A plan that does not include this section answers 403. That is not a
      // failure to report as one; it is an answer.
      if (e instanceof ApiError && e.status === 403) {
        setError("Your plan does not include this.");
      } else {
        setError(e instanceof ApiError && e.message ? e.message : "Could not load this.");
      }
      setRows([]);
    }
  }, [section]);

  useEffect(() => {
    setLoading(true);
    setQuery("");
    load().finally(() => setLoading(false));
  }, [load]);

  // Filtered here rather than re-fetched: fifty rows is a list somebody is
  // scanning, and a round trip per keystroke would lag behind the typing.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.title, r.subtitle, ...(r.pills ?? [])].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, query]);

  return (
    <View style={s.page}>
      <View style={[s.head, { paddingTop: insets.top + space.sm }]}>
        <Text style={s.title}>{section.label}</Text>
        <Text style={s.count}>
          {loading ? "" : shown.length === rows.length ? `${rows.length}` : `${shown.length}/${rows.length}`}
        </Text>
      </View>

      {section.search ? (
        <View style={s.searchWrap}>
          <TextInput
            style={s.search}
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${section.label.toLowerCase()}`}
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
      ) : null}

      {loading ? (
        <View style={s.centre}><ActivityIndicator color={palette.muted} /></View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(r, i) => r.id || String(i)}
          contentContainerStyle={{
            paddingHorizontal: space.lg,
            paddingBottom: insets.bottom + space.xl,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }}
              tintColor={palette.muted}
            />
          }
          ListHeaderComponent={
            section.desktopOnly ? <Notice tone="warn">{section.desktopOnly}</Notice>
            : error ? <Notice tone="warn">{error}</Notice>
            : null
          }
          ListEmptyComponent={
            error || section.desktopOnly ? null : (
              <Text style={s.empty}>{section.empty ?? "Nothing here yet."}</Text>
            )
          }
          renderItem={({ item }) => (
            <RowCard row={item} onPress={actions.length ? setActing : undefined} />
          )}
        />
      )}
      {said ? (
        <View style={s.said} pointerEvents="none">
          <Text style={s.saidText}>{said}</Text>
        </View>
      ) : null}

      {acting ? (
        <ActionSheet
          rowId={acting.id}
          title={acting.title}
          subtitle={acting.subtitle}
          actions={actions}
          onClose={() => setActing(null)}
          onDone={(message) => {
            setActing(null);
            setSaid(message);
            setTimeout(() => setSaid(null), 2600);
            load();
          }}
        />
      ) : null}
    </View>
  );
}

function RowCard({ row, onPress }: { row: Row; onPress?: (r: Row) => void }) {
  const meta = (row.meta ?? []).filter((m) => m.value);
  const body = (
    <>
      <View style={s.rowTop}>
        <Text style={s.rowTitle} numberOfLines={1}>{row.title}</Text>
        {row.amount !== undefined && row.amount !== 0 ? (
          <Text style={s.rowAmount}>{money(row.amount)}</Text>
        ) : null}
      </View>
      {row.subtitle ? <Text style={s.rowSubtitle} numberOfLines={1}>{row.subtitle}</Text> : null}
      {row.pills?.length ? (
        <View style={s.pills}>{row.pills.map((p, i) => <Pill key={i} text={p} />)}</View>
      ) : null}
      {meta.length ? (
        <View style={s.meta}>
          {meta.map((m, i) => (
            <View key={i} style={s.metaRow}>
              <Text style={s.metaLabel}>{m.label}</Text>
              <Text style={s.metaValue} numberOfLines={1}>{m.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );

  if (!onPress) return <View style={s.card}>{body}</View>;
  return (
    <Pressable
      onPress={() => onPress(row)}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      {body}
    </Pressable>
  );
}

function money(value: number): string {
  return Number.isFinite(value)
    ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "";
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  head: {
    flexDirection: "row", alignItems: "center", gap: space.md,
    paddingHorizontal: space.lg, paddingBottom: space.md,
  },
  menuButton: { width: 24, height: 24, justifyContent: "center", gap: 4 },
  bar: { height: 1.8, backgroundColor: palette.ink, borderRadius: 2 },
  title: { ...type.title, color: palette.ink, flex: 1 },
  count: { ...type.small, color: palette.muted },
  searchWrap: { paddingHorizontal: space.lg, paddingBottom: space.md },
  search: {
    borderWidth: 1, borderColor: palette.line, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 11,
    fontFamily: type.body.fontFamily, fontSize: 15,
    color: palette.ink, backgroundColor: palette.paper,
  },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { ...type.small, color: palette.muted, textAlign: "center", marginTop: space.xl },
  said: {
    position: "absolute", left: space.lg, right: space.lg, bottom: space.lg,
    backgroundColor: palette.ink, borderRadius: radius.md,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  saidText: { ...type.small, color: "#fff" },

  card: {
    backgroundColor: palette.paper, borderRadius: radius.lg,
    borderWidth: 1, borderColor: palette.line,
    paddingHorizontal: 18, paddingVertical: 14, marginBottom: space.sm,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.sm },
  rowTitle: { ...type.bodyMedium, color: palette.ink, flexShrink: 1 },
  rowAmount: { ...type.number, color: palette.ink },
  rowSubtitle: { ...type.small, color: palette.muted, marginTop: 1 },
  pills: { flexDirection: "row", gap: space.xs, marginTop: space.sm, flexWrap: "wrap" },
  meta: { marginTop: space.sm, borderTopWidth: 1, borderTopColor: palette.lineSoft, paddingTop: space.xs },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, gap: space.md },
  metaLabel: { ...type.small, color: palette.muted },
  metaValue: { ...type.small, color: palette.ink, flexShrink: 1, textAlign: "right" },
});
