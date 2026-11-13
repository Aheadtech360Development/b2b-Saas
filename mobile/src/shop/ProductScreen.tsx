/**
 * One product: its pictures, its colours and sizes, and Add to cart.
 *
 * A colour is picked first, then a size within it, the way the website's buy
 * box works; a size with none left is shown and cannot be picked when the shop
 * counts this product's stock. Products the app cannot put together (options,
 * gang sheets) say so and open on the shop's website instead.
 */
import { useEffect, useMemo, useState } from "react";
import { Dimensions, Image, Linking, ScrollView, StyleSheet, Text, View } from "react-native";

import { ApiError } from "@/api/client";
import { addToCart, money, product as fetchProduct, shopWebsite, type Cart, type ProductDetail, type Variant } from "@/api/shopping";
import { BAR_SPACE, Centre, Chip, Header, Stepper } from "@/shop/parts";
import { Button, Notice } from "@/ui/components";
import { palette, space, type } from "@/ui/theme";

const WIDTH = Dimensions.get("window").width;

export function ProductScreen({ slug, tenantSlug, canOrder, accent, onBack, onAdded, onCart }: {
  slug: string; tenantSlug: string | null; canOrder: boolean; accent: string;
  onBack: () => void; onAdded: (cart: Cart) => void; onCart: () => void;
}) {
  const [p, setP] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchProduct(slug)
      .then((d) => {
        setP(d);
        const first = d.variants.find((v) => !d.tracksStock || v.stock > 0) ?? d.variants[0];
        if (first) { setColor(first.color); setSize(first.size); }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "This product could not load."));
  }, [slug]);

  const colors = useMemo(() => {
    const seen = new Map<string, string | null>();
    for (const v of p?.variants ?? []) if (!seen.has(v.color)) seen.set(v.color, v.colorHex);
    return [...seen.entries()];
  }, [p]);
  const sizes = useMemo(() => (p?.variants ?? []).filter((v) => v.color === color), [p, color]);
  const chosen: Variant | undefined = sizes.find((v) => v.size === size) ?? (sizes.length === 1 ? sizes[0] : undefined);
  const soldOut = (v: Variant) => !!p?.tracksStock && v.stock <= 0;

  if (error) return <View style={s.page}><Header title="Product" onBack={onBack} /><Centre message={error} /></View>;
  if (!p) return <View style={s.page}><Header title="" onBack={onBack} /><Centre busy /></View>;

  async function add() {
    if (!chosen || !p) return;
    setBusy(true);
    setNote(null);
    try {
      const cart = await addToCart(p.id, chosen.id, qty);
      onAdded(cart);
      setNote({ ok: true, text: `Added ${qty} to your cart.` });
    } catch (e) {
      setNote({ ok: false, text: e instanceof ApiError || e instanceof Error ? e.message : "That did not go into the cart." });
    }
    setBusy(false);
  }

  const web = shopWebsite(tenantSlug, `/products/${p.slug}`);
  const price = chosen?.price ?? null;

  return (
    <View style={s.page}>
      <Header title={p.name} onBack={onBack} />
      <ScrollView contentContainerStyle={{ paddingBottom: BAR_SPACE + space.xl }}>
        {p.images.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {p.images.map((src, i) => (
              <Image key={i} source={{ uri: src }} style={s.image} resizeMode="cover" accessibilityLabel={`${p.name}, picture ${i + 1}`} />
            ))}
          </ScrollView>
        ) : null}

        <View style={s.body}>
          <View style={s.priceRow}>
            <Text style={s.price}>{price !== null ? money(price) : "—"}</Text>
            {chosen?.comparePrice && price !== null && chosen.comparePrice > price ? (
              <Text style={s.compare}>{money(chosen.comparePrice)}</Text>
            ) : null}
          </View>

          {p.websiteOnly ? (
            <View style={s.block}>
              <Notice tone="warn">{p.websiteOnly}</Notice>
              {web ? <Button title="Open on the website" accent={accent} onPress={() => { Linking.openURL(web); }} /> : null}
            </View>
          ) : (
            <View style={s.block}>
              {colors.length > 1 || (colors[0] && colors[0][0]) ? (
                <>
                  <Text style={s.label}>Colour{color ? `: ${color}` : ""}</Text>
                  <View style={s.chips}>
                    {colors.map(([c, hex]) => {
                      const left = (p.variants ?? []).filter((v) => v.color === c).some((v) => !soldOut(v));
                      return (
                        <Chip key={c || "-"} label={c || "One colour"} swatch={hex} on={c === color} off={!left} accent={accent}
                          onPress={() => {
                            setColor(c);
                            const keep = p.variants.find((v) => v.color === c && v.size === size && !soldOut(v));
                            const first = p.variants.find((v) => v.color === c && !soldOut(v));
                            setSize((keep ?? first ?? p.variants.find((v) => v.color === c))?.size ?? "");
                          }} />
                      );
                    })}
                  </View>
                </>
              ) : null}

              {sizes.length > 1 || (sizes[0] && sizes[0].size) ? (
                <>
                  <Text style={s.label}>Size{size ? `: ${size}` : ""}</Text>
                  <View style={s.chips}>
                    {sizes.map((v) => (
                      <Chip key={v.id} label={v.size || "One size"} on={v.size === size} off={soldOut(v)} accent={accent}
                        onPress={() => { if (!soldOut(v)) setSize(v.size); }} />
                    ))}
                  </View>
                </>
              ) : null}

              {chosen && p.tracksStock ? (
                <Text style={s.stock}>{soldOut(chosen) ? "Sold out" : `${chosen.stock} in stock`}</Text>
              ) : null}

              <Text style={s.label}>Quantity</Text>
              <Stepper value={qty} onChange={setQty} max={chosen && p.tracksStock ? Math.max(1, chosen.stock) : undefined} />
              {p.moq > 1 ? <Text style={s.hint}>The shop takes at least {p.moq} of this product in an order.</Text> : null}

              <View style={{ height: space.md }} />
              {!canOrder ? (
                <Notice tone="warn">You can order once the shop has approved your account.</Notice>
              ) : (
                <Button
                  title={!chosen ? "Pick a size" : soldOut(chosen) ? "Sold out" : `Add to cart · ${money((price ?? 0) * qty)}`}
                  accent={accent}
                  busy={busy}
                  onPress={() => { if (chosen && !soldOut(chosen)) add(); }}
                />
              )}
              {note ? (
                <View style={{ marginTop: space.sm }}>
                  <Notice tone={note.ok ? "ok" : "bad"}>{note.text}</Notice>
                  {note.ok ? <Button title="View cart" variant="quiet" accent={accent} onPress={onCart} /> : null}
                </View>
              ) : null}
            </View>
          )}

          {p.description ? (
            <View style={s.block}>
              <Text style={s.label}>About it</Text>
              <Text style={s.desc}>{p.description}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  image: { width: WIDTH, height: WIDTH, backgroundColor: palette.paper },
  body: { paddingHorizontal: space.lg, paddingTop: space.md },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  price: { ...type.big, color: palette.ink },
  compare: { ...type.body, color: palette.muted, textDecorationLine: "line-through" },
  block: { marginTop: space.md, gap: space.xs },
  label: { ...type.label, color: palette.ink70, marginTop: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  stock: { ...type.small, color: palette.ink70, marginTop: space.xs },
  hint: { ...type.small, color: palette.muted },
  desc: { ...type.body, color: palette.ink70 },
});

