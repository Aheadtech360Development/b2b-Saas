/**
 * Every list in the console, from one screen.
 *
 * The sections differ in where their rows come from and how a row reads, and
 * in nothing else, so they share this: the chips, the search, the paging, the
 * pull to refresh, the empty state, and what happens when a request fails.
 * Twenty hand-written lists would have differed in all six, which is where
 * the small wrongnesses live.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, call } from "@/api/client";
import type { Row, Section } from "@/admin/sections";
import { actionsFor } from "@/admin/actions";
import { ActionSheet } from "@/admin/ActionSheet";
import { Notice, Pill } from "@/ui/components";
import { TAB_BAR_SPACE } from "@/admin/tabs";
import { palette, radius, space, type } from "@/ui/theme";

const PAGE_SIZE = 25;
/** Long enough that a word typed at speed is one request, short enough that
 *  the list does not feel like it is lagging behind the keyboard. */
const SEARCH_PAUSE = 350;

/** A date heading, or nothing, before a run of rows that share one. */
type Entry = { kind: "header"; key: string; label: string } | { kind: "row"; key: string; row: Row };

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
  const [applied, setApplied] = useState("");
  const [filter, setFilter] = useState(0);
  const [acting, setActing] = useState<Row | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const actions = actionsFor(section.key);
  // Guards the end-of-list callback, which FlatList fires more than once
  // while a fetch is already in flight.
  const fetching = useRef(false);

  // Typing does not fetch; pausing does.
  useEffect(() => {
    if (!section.serverSearch) { setApplied(query); return; }
    const id = setTimeout(() => setApplied(query), SEARCH_PAUSE);
    return () => clearTimeout(id);
  }, [query, section.serverSearch]);

  const url = useCallback((wanted: number) => {
    const base = section.path ?? "";
    const parts = [`page=${wanted}`, `page_size=${PAGE_SIZE}`];
    const chip = section.filters?.[filter]?.query;
    if (chip) parts.push(chip);
    if (section.serverSearch && applied.trim()) {
      parts.push(`q=${encodeURIComponent(applied.trim())}`);
    }
    return `${base}${base.includes("?") ? "&" : "?"}${parts.join("&")}`;
  }, [section, filter, applied]);

  const fetchPage = useCallback(async (wanted: number): Promise<Row[]> => {
    if (!section.path || !section.row || !section.pick) return [];
    const body = await call<any>(url(wanted));
    // The count comes from the response where there is one, so the header can
    // say 25 of 340 rather than just 25.
    setTotal(typeof body?.total === "number" ? body.total : null);
    const got = section.pick(body).map(section.row).filter((r) => r.id || r.title);
    // A short page means the end, which is also the answer for the endpoints
    // that return a bare array and no count at all.
    setMore(got.length >= PAGE_SIZE);
    return got;
  }, [section, url]);

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
    setMore(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (fetching.current || !more || loading || error) return;
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
  }, [fetchPage, more, loading, error, page]);

  // Client-side filtering only for the lists the server will not search.
  const shown = useMemo(() => {
    const q = section.serverSearch ? "" : query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.title, r.subtitle, r.badge, ...(r.pills ?? [])]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, query, section.serverSearch]);

  // Headings are woven in rather than using SectionList, which would have
  // wanted the data reshaped and the paging callback moved with it.
  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    let last = "";
    for (const row of shown) {
      if (row.group && row.group !== last) {
        last = row.group;
        out.push({ kind: "header", key: `h:${row.group}`, label: row.group });
      }
      out.push({ kind: "row", key: row.id || `${out.length}`, row });
    }
    return out;
  }, [shown]);

  const searching = query.trim().length > 0;
  const countText = loading ? ""
    : searching && !section.serverSearch ? `${shown.length} of ${rows.length}`
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
          <Ionicons name="search" size={16} color={palette.muted} style={s.searchIcon} />
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
          {searching ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10} style={s.clear} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={palette.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {section.filters?.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
          keyboardShouldPersistTaps="handled"
        >
          {section.filters.map((f, i) => {
            const on = i === filter;
            return (
              <Pressable
                key={f.label}
                onPress={() => setFilter(i)}
                style={({ pressed }) => [s.chip, on && s.chipOn, pressed && !on && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {loading ? (
        <View style={s.centre}><ActivityIndicator color={palette.muted} /></View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.key}
          contentContainerStyle={{
            paddingHorizontal: space.lg,
            paddingBottom: insets.bottom + TAB_BAR_SPACE,
          }}
          keyboardShouldPersistTaps="handled"
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
              <Text style={s.empty}>
                {searching ? "Nothing matches that." : section.empty ?? "Nothing here yet."}
              </Text>
            )
          }
          ListFooterComponent={
            paging ? (
              <View style={s.footer}><ActivityIndicator size="small" color={palette.muted} /></View>
            ) : !more && rows.length >= PAGE_SIZE ? (
              <Text style={s.footerText}>That is all of them.</Text>
            ) : null
          }
          renderItem={({ item }) =>
            item.kind === "header" ? (
              <Text style={s.groupHeader}>{item.label}</Text>
            ) : (
              <RowCard
                row={item.row}
                openable={Boolean(section.detail) && Boolean(onOpenRow)}
                onPress={
                  section.detail && onOpenRow ? () => onOpenRow(item.row)
                  : actions.length ? () => setActing(item.row)
                  : undefined
                }
              />
            )
          }
        />
      )}

      {said ? (
        <View style={[s.said, { bottom: insets.bottom + TAB_BAR_SPACE }]} pointerEvents="none">
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
    <View style={s.rowInner}>
      {row.image !== undefined ? (
        row.image ? (
          <Image source={{ uri: row.image }} style={s.thumb} resizeMode="cover" />
        ) : (
          // A placeholder rather than nothing, so a list of products with one
          // picture missing does not go ragged down the left edge.
          <View style={[s.thumb, s.thumbEmpty]}>
            <Ionicons name="image-outline" size={17} color={palette.muted} />
          </View>
        )
      ) : null}

      <View style={s.rowBody}>
        <View style={s.rowTop}>
          <Text style={s.rowTitle} numberOfLines={1}>{row.title}</Text>
          {row.amount !== undefined && row.amount !== 0 ? (
            <Text style={s.rowAmount}>{money(row.amount)}</Text>
          ) : row.badge ? (
            <Pill text={row.badge} />
          ) : null}
        </View>

        {row.subtitle ? <Text style={s.rowSubtitle} numberOfLines={1}>{row.subtitle}</Text> : null}
        {row.warn ? <Text style={s.rowWarn} numberOfLines={1}>({row.warn})</Text> : null}

        {(row.pills?.length || (row.amount !== undefined && row.amount !== 0 && row.badge)) ? (
          <View style={s.pills}>
            {row.amount !== undefined && row.amount !== 0 && row.badge ? <Pill text={row.badge} /> : null}
            {row.pills?.map((p, i) => <Pill key={i} text={p} />)}
          </View>
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
      </View>

      {openable ? <Ionicons name="chevron-forward" size={15} color={palette.muted} /> : null}
    </View>
  );

  if (!onPress) return <View style={s.card}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && { backgroundColor: palette.lineSoft }]}
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

  searchWrap: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: space.lg, marginBottom: space.sm,
    borderWidth: 1, borderColor: palette.line, borderRadius: radius.md,
    backgroundColor: palette.paper, paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  search: {
    flex: 1, paddingVertical: 11,
    fontFamily: type.body.fontFamily, fontSize: 15, color: palette.ink,
  },
  clear: { paddingLeft: 8 },

  chips: { paddingHorizontal: space.lg, gap: space.xs, paddingBottom: space.sm },
  chip: {
    borderWidth: 1, borderColor: palette.line, borderRadius: 100,
    paddingHorizontal: 14, paddingVertical: 7, backgroundColor: palette.paper,
  },
  chipOn: { backgroundColor: palette.ink, borderColor: palette.ink },
  chipText: { ...type.small, fontSize: 13, color: palette.ink70 },
  chipTextOn: { color: "#fff", fontFamily: type.label.fontFamily },

  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { ...type.small, color: palette.muted, textAlign: "center", marginTop: space.xl },
  footer: { paddingVertical: space.md, alignItems: "center" },
  footerText: { ...type.small, color: palette.muted, textAlign: "center", paddingVertical: space.md },
  groupHeader: {
    ...type.section, color: palette.muted,
    marginTop: space.md, marginBottom: space.xs,
  },

  card: {
    backgroundColor: palette.paper, borderRadius: radius.lg,
    borderWidth: 1, borderColor: palette.line,
    paddingHorizontal: 14, paddingVertical: 13, marginBottom: space.xs,
  },
  rowInner: { flexDirection: "row", alignItems: "center", gap: space.sm },
  thumb: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: palette.lineSoft },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  rowTitle: { ...type.bodyMedium, color: palette.ink, flex: 1 },
  rowAmount: { ...type.number, color: palette.ink },
  rowSubtitle: { ...type.small, color: palette.muted, marginTop: 1 },
  rowWarn: { ...type.small, fontSize: 12.5, color: palette.bad, marginTop: 1 },
  pills: { flexDirection: "row", gap: space.xs, marginTop: space.xs, flexWrap: "wrap" },
  meta: { marginTop: space.xs },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, gap: space.md },
  metaLabel: { ...type.small, fontSize: 12, color: palette.muted },
  metaValue: { ...type.small, fontSize: 12, color: palette.ink70, flexShrink: 1, textAlign: "right" },

  said: {
    position: "absolute", left: space.lg, right: space.lg,
    backgroundColor: palette.ink, borderRadius: radius.md,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  saidText: { ...type.small, color: "#fff" },
});
