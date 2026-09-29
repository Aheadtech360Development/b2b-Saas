/**
 * Every list in the console, from one screen.
 *
 * The sections differ in where their rows come from and how a row reads, and
 * in nothing else, so they share this: the same search, the same paging, the
 * same pull to refresh, the same empty state, and the same behaviour when a
 * request fails. Twenty hand-written lists would have differed in all five,
 * which is where the small wrongnesses live.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, call } from "@/api/client";
import type { Row, Section } from "@/admin/sections";
import { actionsFor } from "@/admin/actions";
import { ActionSheet } from "@/admin/ActionSheet";
import { Notice, Pill } from "@/ui/components";
import { palette, radius, space, type } from "@/ui/theme";

const PAGE_SIZE = 25;

export function ListScreen({
  section, onOpenRow,
}: {
  section: Section;
  onOpenRow?: (row: Row) => void;
}) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [acting, setActing] = useState<Row | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const actions = actionsFor(section.key);
  // Guards the end-of-list callback, which FlatList fires more than once
  // while a fetch is already in flight.
  const fetching = useRef(false);

  const fetchPage = useCallback(async (wanted: number): Promise<Row[]> => {
    if (!section.path || !section.row || !section.pick) return [];
    const sep = section.path.includes("?") ? "&" : "?";
    const body = await call<any>(`${section.path}${sep}page=${wanted}&page_size=${PAGE_SIZE}`);
    // The count comes from the response where there is one, so the header can
    // say 25 of 340 rather than just 25.
    if (typeof body?.total === "number") setTotal(body.total);
    const got = section.pick(body).map(section.row).filter((r) => r.id || r.title);
    // Short page means the end, which is also the answer for the endpoints
    // that return a bare array and no count at all.
    setMore(got.length >= PAGE_SIZE);
    return got;
  }, [section]);

  const reload = useCallback(async () => {
    setError(null);
    fetching.current = true;
    try {
      const first = await fetchPage(1);
      setRows(first);
      setPage(1);
    } catch (e) {
      // A plan that does not include this section answers 403. That is not a
      // failure to report as one; it is an answer.
      setError(
        e instanceof ApiError && e.status === 403 ? "Your plan does not include this."
        : e instanceof ApiError && e.message ? e.message
        : "Could not load this.",
      );
      setRows([]);
      setMore(false);
    } finally {
      fetching.current = false;
    }
  }, [fetchPage]);

  useEffect(() => {
    setLoading(true);
    setQuery("");
    setTotal(null);
    setMore(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  const loadMore = useCallback(async () => {
    // Not while searching: the filter runs over what is loaded, and paging
    // underneath it would make the visible count jump for no visible reason.
    if (fetching.current || !more || loading || error || query.trim()) return;
    fetching.current = true;
    setPaging(true);
    try {
      const next = await fetchPage(page + 1);
      if (next.length) {
        // Keyed by id, because a row added while paging shifts the offset and
        // the same record comes back on two pages.
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...next.filter((r) => !seen.has(r.id))];
        });
        setPage((p) => p + 1);
      }
    } catch {
      // Stop asking rather than reporting: what is already on screen is still
      // good, and an error bar over a working list helps nobody.
      setMore(false);
    } finally {
      setPaging(false);
      fetching.current = false;
    }
  }, [fetchPage, more, loading, error, query, page]);

  // Filtered here rather than re-fetched: this is a list somebody is scanning,
  // and a round trip per keystroke would lag behind the typing.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.title, r.subtitle, ...(r.pills ?? [])].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const countText = loading ? ""
    : query.trim() ? `${shown.length} of ${rows.length}`
    : total !== null && total > rows.length ? `${rows.length} of ${total}`
    : String(rows.length);

  return (
    <View style={s.page}>
      <View style={[s.head, { paddingTop: insets.top + space.sm }]}>
        <Text style={s.title}>{section.label}</Text>
        <Text style={s.count}>{countText}</Text>
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
              onRefresh={() => { setRefreshing(true); reload().finally(() => setRefreshing(false)); }}
              tintColor={palette.muted}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
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
          ListFooterComponent={
            paging ? (
              <View style={s.footer}><ActivityIndicator size="small" color={palette.muted} /></View>
            ) : !more && rows.length >= PAGE_SIZE && !query.trim() ? (
              <Text style={s.footerText}>That is all of them.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <RowCard
              row={item}
              openable={Boolean(section.detail) && Boolean(onOpenRow)}
              onPress={
                section.detail && onOpenRow ? () => onOpenRow(item)
                : actions.length ? () => setActing(item)
                : undefined
              }
            />
          )}
        />
      )}

      {said ? (
        <View style={[s.said, { bottom: insets.bottom + space.lg }]} pointerEvents="none">
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
            reload();
          }}
        />
      ) : null}
    </View>
  );
}

function RowCard({
  row, onPress, openable,
}: {
  row: Row;
  onPress?: () => void;
  openable?: boolean;
}) {
  const meta = (row.meta ?? []).filter((m) => m.value);
  const body = (
    <>
      <View style={s.rowTop}>
        <Text style={s.rowTitle} numberOfLines={1}>{row.title}</Text>
        {row.amount !== undefined && row.amount !== 0 ? (
          <Text style={s.rowAmount}>{money(row.amount)}</Text>
        ) : null}
        {openable ? <Ionicons name="chevron-forward" size={14} color={palette.muted} /> : null}
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
      onPress={onPress}
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
    flexDirection: "row", alignItems: "baseline", gap: space.md,
    paddingHorizontal: space.lg, paddingBottom: space.md,
  },
  title: { ...type.hero, fontSize: 27, color: palette.ink, flex: 1 },
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
  footer: { paddingVertical: space.md, alignItems: "center" },
  footerText: { ...type.small, color: palette.muted, textAlign: "center", paddingVertical: space.md },

  card: {
    backgroundColor: palette.paper, borderRadius: radius.lg,
    borderWidth: 1, borderColor: palette.line,
    paddingHorizontal: 18, paddingVertical: 14, marginBottom: space.sm,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  rowTitle: { ...type.bodyMedium, color: palette.ink, flex: 1 },
  rowAmount: { ...type.number, color: palette.ink },
  rowSubtitle: { ...type.small, color: palette.muted, marginTop: 1 },
  pills: { flexDirection: "row", gap: space.xs, marginTop: space.sm, flexWrap: "wrap" },
  meta: { marginTop: space.sm, borderTopWidth: 1, borderTopColor: palette.lineSoft, paddingTop: space.xs },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, gap: space.md },
  metaLabel: { ...type.small, color: palette.muted },
  metaValue: { ...type.small, color: palette.ink, flexShrink: 1, textAlign: "right" },

  said: {
    position: "absolute", left: space.lg, right: space.lg,
    backgroundColor: palette.ink, borderRadius: radius.md,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  saidText: { ...type.small, color: "#fff" },
});
