/**
 * The shop: every product, with search and the shop's categories.
 *
 * Prices are the signed-in buyer's own (their tier, their discount group),
 * read from the same list the website shows. Two across, as a phone shop does,
 * and more as the list is scrolled.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { categories as fetchCategories, money, products, type Category, type ProductCard } from "@/api/shopping";
import { BAR_SPACE, Centre, Chip, Header } from "@/shop/parts";
import { palette, radius, space, type } from "@/ui/theme";

export function CatalogScreen({ shopName, accent, onOpen }: {
  shopName: string; accent: string; onOpen: (slug: string) => void;
}) {
  const [items, setItems] = useState<ProductCard[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The newest request wins: a slow answer to an old search must not replace
  // the list for the words typed since.
  const asked = useRef(0);

  const load = useCallback(async (nextPage: number, words: string, category: string) => {
    const mine = ++asked.current;
    setError(null);
    try {
      const res = await products({ q: words, category: category || undefined, page: nextPage });
      if (mine !== asked.current) return;
      setItems((prev) => (nextPage === 1 ? res.items : [...prev, ...res.items]));
      setPage(res.page);
      setPages(res.pages);
    } catch (e) {
      if (mine !== asked.current) return;
      setError(e instanceof Error ? e.message : "The products could not load.");
    }
  }, []);

  useEffect(() => {
    fetchCategories().then(setCats).catch(() => setCats([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    load(1, searched, cat).finally(() => setLoading(false));
  }, [searched, cat, load]);

  const loadMore = () => {
    if (more || loading || page >= pages) return;
    setMore(true);
    load(page + 1, searched, cat).finally(() => setMore(false));
  };

  const header = (
    <View>
      <Header kicker={shopName} title="Shop" />
      <View style={s.searchWrap}>
        <Ionicons name="search" size={18} color={palette.muted} />
        <TextInput
          style={s.search}
          placeholder="Search products"
          placeholderTextColor={palette.muted}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => setSearched(q)}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Search products"
        />
        {q ? (
          <Pressable onPress={() => { setQ(""); setSearched(""); }} hitSlop={10} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={palette.muted} />
          </Pressable>
        ) : null}
      </View>
      {cats.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catRow} contentContainerStyle={s.cats}>
          <Chip label="All" on={!cat} onPress={() => setCat("")} accent={accent} />
          {cats.map((c) => (
            <Chip key={c.id} label={c.name} on={cat === c.slug} onPress={() => setCat(cat === c.slug ? "" : c.slug)} accent={accent} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  if (loading && items.length === 0) {
    return <View style={s.page}>{header}<Centre busy /></View>;
  }

  return (
    <FlatList
      style={s.page}
      data={items}
      keyExtractor={(p) => p.id}
      numColumns={2}
      columnWrapperStyle={s.rowGap}
      contentContainerStyle={{ paddingBottom: BAR_SPACE + space.lg }}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <Text style={s.empty}>
          {error ?? (searched ? `Nothing matches “${searched}”.` : "This shop has no products yet.")}
        </Text>
      }
      ListFooterComponent={more ? <Text style={s.empty}>Loading more…</Text> : <View />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={palette.muted}
          onRefresh={() => { setRefreshing(true); load(1, searched, cat).finally(() => setRefreshing(false)); }}
        />
      }
      renderItem={({ item }) => (
        <Pressable onPress={() => onOpen(item.slug)} style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}
          accessibilityRole="button" accessibilityLabel={item.name}>
          <View style={s.imageBox}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={s.image} resizeMode="cover" />
            ) : (
              <Ionicons name="shirt-outline" size={34} color={palette.muted} />
            )}
          </View>
          <Text style={s.name} numberOfLines={2}>{item.name}</Text>
          <Text style={s.price}>{item.fromPrice !== null ? `From ${money(item.fromPrice)}` : " "}</Text>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.lg, marginBottom: space.sm,
    paddingHorizontal: space.md, height: 46, borderRadius: radius.md, backgroundColor: palette.paper,
    borderWidth: 1, borderColor: palette.line,
  },
  search: { flex: 1, ...type.body, color: palette.ink, paddingVertical: 0 },
  catRow: { flexGrow: 0, flexShrink: 0 },
  cats: { paddingHorizontal: space.lg, gap: space.xs, paddingBottom: space.md, alignItems: "center" },
  rowGap: { gap: space.sm, paddingHorizontal: space.lg, marginBottom: space.md },
  card: { flex: 1, minWidth: 0 },
  imageBox: {
    aspectRatio: 1, borderRadius: radius.md, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.lineSoft,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  name: { ...type.bodyMedium, fontSize: 14, lineHeight: 19, color: palette.ink, marginTop: space.xs },
  price: { ...type.small, color: palette.ink70, marginTop: 2 },
  empty: { ...type.small, color: palette.muted, textAlign: "center", padding: space.lg },
});
