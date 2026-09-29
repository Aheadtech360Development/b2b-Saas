/**
 * One record, opened.
 *
 * What a row is scanned for and what a record is acted on are different
 * readings, so this spells out the lines, the addresses and the money the
 * list had no room for, and puts the actions at the bottom where they follow
 * from what was just read rather than preceding it.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, call } from "@/api/client";
import { actionsFor } from "@/admin/actions";
import { ActionSheet } from "@/admin/ActionSheet";
import type { DetailBlock, Row, Section } from "@/admin/sections";
import { Notice, Pill } from "@/ui/components";
import { TAB_BAR_SPACE } from "@/admin/tabs";
import { palette, radius, space, type } from "@/ui/theme";

export function DetailScreen({
  section, row, onBack,
}: {
  section: Section;
  row: Row;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [blocks, setBlocks] = useState<DetailBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const actions = actionsFor(section.key);
  const detail = section.detail;

  const load = useCallback(async () => {
    if (!detail) return;
    setError(null);
    try {
      setBlocks(detail.render(await call<unknown>(detail.path(row.id))));
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403 ? "Your plan does not include this."
        : e instanceof ApiError && e.message ? e.message
        : "Could not load this record.",
      );
    }
  }, [detail, row.id]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  return (
    <View style={s.page}>
      <View style={[s.head, { paddingTop: insets.top + space.sm }]}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={palette.ink} />
        </Pressable>
        <View style={s.headText}>
          <Text style={s.title} numberOfLines={1}>{row.title}</Text>
          {row.subtitle ? <Text style={s.subtitle} numberOfLines={1}>{row.subtitle}</Text> : null}
        </View>
      </View>

      {loading ? (
        <View style={s.centre}><ActivityIndicator color={palette.muted} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + TAB_BAR_SPACE }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }}
              tintColor={palette.muted}
            />
          }
        >
          {error ? <Notice tone="warn">{error}</Notice> : null}

          {row.pills?.length ? (
            <View style={s.pills}>{row.pills.map((p, i) => <Pill key={i} text={p} />)}</View>
          ) : null}

          {blocks.map((block, bi) => (
            <View key={bi} style={s.block}>
              <Text style={s.blockTitle}>{block.title.toUpperCase()}</Text>
              {block.images?.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.gallery}
                >
                  {block.images.map((uri, ii) => (
                    <Image key={ii} source={{ uri }} style={s.photo} resizeMode="cover" />
                  ))}
                </ScrollView>
              ) : null}

              {block.tags?.length ? (
                <View style={s.tags}>
                  {block.tags.map((t, ti) => (
                    <View key={ti} style={s.tag}><Text style={s.tagText}>{t}</Text></View>
                  ))}
                </View>
              ) : null}

              {block.images?.length || block.tags?.length ? null : (
              <View style={s.card}>
                {block.lines?.map((line, li) => (
                  <View key={li} style={[s.line, li > 0 && s.divided]}>
                    <View style={s.lineText}>
                      <Text style={s.lineTitle}>{line.title}</Text>
                      {line.sub ? <Text style={s.lineSub}>{line.sub}</Text> : null}
                    </View>
                    {line.qty ? <Text style={s.lineQty}>×{line.qty}</Text> : null}
                    {line.amount ? <Text style={s.lineAmount}>{fmt(line.amount)}</Text> : null}
                  </View>
                ))}
                {block.text ? <Text style={s.text}>{block.text}</Text> : null}
                {block.rows?.map((r, ri) => (
                  <View key={ri} style={s.row}>
                    <Text style={s.rowLabel}>{r.label}</Text>
                    <Text style={s.rowValue}>{r.value}</Text>
                  </View>
                ))}
              </View>
              )}
            </View>
          ))}

          {!error && blocks.length === 0 ? (
            <Text style={s.empty}>Nothing more to show for this one.</Text>
          ) : null}

          {actions.length ? (
            <Pressable
              onPress={() => setActing(true)}
              style={({ pressed }) => [s.actionButton, pressed && { opacity: 0.75 }]}
              accessibilityRole="button"
            >
              <Text style={s.actionButtonText}>Actions</Text>
              <Ionicons name="chevron-up" size={14} color="#fff" />
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      {said ? (
        <View style={[s.said, { bottom: insets.bottom + TAB_BAR_SPACE }]} pointerEvents="none">
          <Text style={s.saidText}>{said}</Text>
        </View>
      ) : null}

      {acting ? (
        <ActionSheet
          rowId={row.id}
          title={row.title}
          subtitle={row.subtitle}
          actions={actions}
          onClose={() => setActing(false)}
          onDone={(message) => {
            setActing(false);
            setSaid(message);
            setTimeout(() => setSaid(null), 2600);
            // Reloaded rather than closed: whoever just changed a status wants
            // to see it changed, not to be sent back to the list.
            load();
          }}
        />
      ) : null}
    </View>
  );
}

function fmt(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  head: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    paddingHorizontal: space.md, paddingBottom: space.md,
  },
  headText: { flex: 1 },
  title: { ...type.title, fontSize: 21, color: palette.ink },
  subtitle: { ...type.small, color: palette.muted },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  pills: { flexDirection: "row", gap: space.xs, marginBottom: space.md, flexWrap: "wrap" },

  block: { marginBottom: space.md },
  gallery: { gap: space.sm, paddingRight: space.lg },
  photo: {
    width: 150, height: 150, borderRadius: radius.md,
    backgroundColor: palette.lineSoft,
    borderWidth: 1, borderColor: palette.line,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  tag: {
    borderWidth: 1, borderColor: palette.line, borderRadius: 100,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: palette.paper,
  },
  tagText: { ...type.small, fontSize: 12.5, color: palette.ink70 },
  blockTitle: { ...type.section, color: palette.muted, marginBottom: space.xs },
  card: {
    backgroundColor: palette.paper, borderRadius: radius.lg,
    borderWidth: 1, borderColor: palette.line,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 9 },
  divided: { borderTopWidth: 1, borderTopColor: palette.lineSoft },
  lineText: { flex: 1 },
  lineTitle: { ...type.bodyMedium, fontSize: 14, color: palette.ink },
  lineSub: { ...type.small, fontSize: 12.5, color: palette.muted, marginTop: 1 },
  lineQty: { ...type.number, fontSize: 13.5, color: palette.muted },
  lineAmount: { ...type.number, fontSize: 14, color: palette.ink, minWidth: 72, textAlign: "right" },

  row: { flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: 6 },
  rowLabel: { ...type.small, color: palette.muted },
  rowValue: { ...type.small, color: palette.ink, flexShrink: 1, textAlign: "right" },
  text: { ...type.small, color: palette.ink, lineHeight: 21, paddingVertical: 4 },
  empty: { ...type.small, color: palette.muted, textAlign: "center", marginTop: space.lg },

  actionButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs,
    backgroundColor: palette.ink, borderRadius: radius.md,
    paddingVertical: 15, marginTop: space.sm,
  },
  actionButtonText: { ...type.bodyMedium, fontSize: 15.5, color: "#fff" },

  said: {
    position: "absolute", left: space.lg, right: space.lg,
    backgroundColor: palette.ink, borderRadius: radius.md,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  saidText: { ...type.small, color: "#fff" },
});
