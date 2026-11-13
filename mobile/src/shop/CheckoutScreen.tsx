/**
 * Checkout, on one screen: where it goes, how it gets there, how it is paid.
 *
 * It sends what the website's checkout sends, so the server prices it the same
 * way: the address, Standard or Will Call, the shipping the shop's rules give,
 * a discount code, tax for the address, and then either a card payment
 * (Stripe's sheet, a direct charge on the shop's own account) or cash on
 * delivery when the shop takes it. A card is charged before the order is
 * placed; if placing it then fails, the button finishes that same order rather
 * than charging again.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  addresses as fetchAddresses, cardIntent, cart as fetchCart, checkCoupon, liveRates as fetchLiveRates, money,
  paymentOptions, placeOrder, shippingType as fetchShippingType, shopRules, tax as fetchTax,
  type Address, type Cart, type CheckoutFields, type Coupon, type LiveRate, type PaymentOptions, type PlacedOrder,
  type ShopRules, type Tax,
} from "@/api/shopping";
import { payByCard } from "@/shop/pay";
import { BAR_SPACE, Centre, Header, Line } from "@/shop/parts";
import { Button, Card, Field, Notice, SectionLabel } from "@/ui/components";
import { palette, radius, space, type } from "@/ui/theme";

const BLANK: Address = {
  id: null, fullName: "", line1: "", line2: "", city: "", state: "", zip: "", country: "US", phone: "", isDefault: false,
};

function attemptKey(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** An address with what a shipment needs: a street, a city, a state and a ZIP. */
export function addressProblem(a: Address): string | null {
  if (!a.line1.trim() || !a.city.trim()) return "Add the street and the city.";
  if (!/^[A-Za-z]{2}$/.test(a.state.trim())) return "Use the two-letter state, like TX.";
  if (!/^\d{5}(-\d{4})?$/.test(a.zip.trim())) return "Add a five-digit ZIP code.";
  return null;
}

export function CheckoutScreen({ shopName, accent, onBack, onPlaced }: {
  shopName: string; accent: string; onBack: () => void; onPlaced: (order: PlacedOrder) => void;
}) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [saved, setSaved] = useState<Address[]>([]);
  const [pick, setPick] = useState<string>("new");
  const [form, setForm] = useState<Address>(BLANK);
  const [rules, setRules] = useState<ShopRules>({ pickup: false, pickupWhere: "" });
  const [shipType, setShipType] = useState("store_default");
  const [method, setMethod] = useState<"standard" | "will_call">("standard");
  const [rates, setRates] = useState<LiveRate[] | null>(null);
  const [rateId, setRateId] = useState<string | null>(null);
  const [ratesBusy, setRatesBusy] = useState(false);
  const [code, setCode] = useState("");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponErr, setCouponErr] = useState<string | null>(null);
  const [tax, setTax] = useState<Tax | null>(null);
  const [ways, setWays] = useState<PaymentOptions | null>(null);
  const [pay, setPay] = useState<"card" | "cod">("card");
  const [notes, setNotes] = useState("");
  const [po, setPo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // A card already charged for this checkout: placing the order again uses it.
  const [paidIntent, setPaidIntent] = useState<string | null>(null);
  const attempt = useRef(attemptKey());

  useEffect(() => {
    Promise.all([fetchCart(), fetchAddresses().catch(() => []), shopRules(), fetchShippingType(), paymentOptions().catch(() => ({ card: true, cod: false }))])
      .then(([c, a, r, t, w]) => {
        setCart(c);
        setSaved(a);
        const first = a.find((x) => x.isDefault) ?? a[0];
        if (first?.id) setPick(first.id);
        setRules(r);
        setShipType(t);
        setWays(w);
        setPay(w.card ? "card" : "cod");
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Checkout could not load."));
  }, []);

  const address: Address = pick === "new" ? form : (saved.find((a) => a.id === pick) ?? form);
  const addrProblem = addressProblem(address);
  const live = shipType === "live_shippo" && method === "standard";

  // Live carrier rates, once there is an address to quote for.
  const quote = useCallback(async () => {
    if (!cart || !live || addressProblem(address)) return;
    setRatesBusy(true);
    setRates(null);
    try {
      const items = cart.lines.filter((l) => l.variantId).map((l) => ({ variant_id: l.variantId, quantity: l.quantity }));
      const got = await fetchLiveRates({ zip: address.zip.trim(), state: address.state.trim(), city: address.city.trim() }, items);
      setRates(got);
      setRateId(got[0]?.id ?? null);
    } catch {
      setRates([]);
    }
    setRatesBusy(false);
  }, [cart, live, address]);

  useEffect(() => { if (live) quote(); }, [live, address.zip, address.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const rate = rates?.find((r) => r.id === rateId) ?? null;
  const subtotal = cart?.subtotal ?? 0;
  const discount = coupon && coupon.type !== "free_shipping" ? coupon.amount : 0;
  // What shipping costs, as the website works it out: nothing for Will Call,
  // the chosen carrier rate, or the shop's tier for this cart (unknown until
  // the shop prices it when there are no tiers).
  const shipping: number | null = method === "will_call" ? 0
    : coupon?.type === "free_shipping" ? 0
    : live ? (rate ? rate.cost : null)
    : cart?.tierShipping ?? null;

  // Tax for the address, on what is left after the discount.
  useEffect(() => {
    if (!cart || addressProblem(address) || subtotal <= 0) { setTax(null); return; }
    let gone = false;
    fetchTax(subtotal, address.zip.trim(), address.state.trim(), discount)
      .then((t) => { if (!gone) setTax(t); })
      .catch(() => { if (!gone) setTax(null); });
    return () => { gone = true; };
  }, [cart, address.zip, address.state, subtotal, discount]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => subtotal - discount + (shipping ?? 0) + (tax?.amount ?? 0), [subtotal, discount, shipping, tax]);

  async function applyCode() {
    if (!code.trim()) return;
    setCouponBusy(true);
    setCouponErr(null);
    try {
      setCoupon(await checkCoupon(code, subtotal));
    } catch (e) {
      setCoupon(null);
      setCouponErr(e instanceof Error ? e.message : "That code does not work.");
    }
    setCouponBusy(false);
  }

  function fields(): CheckoutFields {
    return {
      address, shippingMethod: method, shippingCost: shipping ?? 0, liveRate: live ? rate : null,
      couponCode: coupon?.code ?? null, tax, notes, poNumber: po,
    };
  }

  async function place() {
    if (addrProblem) { setError(addrProblem); return; }
    if (live && !rate) { setError("Pick how it ships."); return; }
    setBusy(true);
    setError(null);
    try {
      if (pay === "cod") {
        onPlaced(await placeOrder(fields(), { method: "cod" }, attempt.current));
        return;
      }
      let intentId = paidIntent;
      if (!intentId) {
        const intent = await cardIntent(fields());
        const paid = await payByCard(intent, shopName);
        if (!paid.ok) {
          if (!paid.cancelled) setError(paid.message);
          setBusy(false);
          return;
        }
        intentId = intent.paymentIntentId;
        setPaidIntent(intentId);
      }
      onPlaced(await placeOrder(fields(), { method: "card", intentId }, attempt.current));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The order did not go through. Try again.");
      setBusy(false);
    }
  }

  if (loadError) return <View style={s.page}><Header title="Checkout" onBack={onBack} /><Centre message={loadError} /></View>;
  if (!cart || !ways) return <View style={s.page}><Header title="Checkout" onBack={onBack} /><Centre busy /></View>;
  if (!cart.lines.length) return <View style={s.page}><Header title="Checkout" onBack={onBack} /><Centre message="Your cart is empty." /></View>;
  if (!ways.card && !ways.cod) {
    return (
      <View style={s.page}><Header title="Checkout" onBack={onBack} />
        <Centre message={`${shopName} cannot take payments yet. Please contact the shop.`} /></View>
    );
  }

  const set = (k: keyof Address) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const locked = busy || !!paidIntent;

  return (
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Header kicker={shopName} title="Checkout" onBack={locked ? undefined : onBack} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: BAR_SPACE + space.xl }]} keyboardShouldPersistTaps="handled">
        {cart.blockers.map((b, i) => <Notice key={i} tone="warn">{b}</Notice>)}

        <SectionLabel>Ship to</SectionLabel>
        {saved.map((a) => (
          <Choice key={a.id} on={pick === a.id} disabled={locked} onPress={() => setPick(a.id!)}
            title={a.fullName || a.line1} sub={[a.line1, a.line2, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean).join(", ")} accent={accent} />
        ))}
        {saved.length > 0 ? (
          <Choice on={pick === "new"} disabled={locked} onPress={() => setPick("new")} title="A new address" accent={accent} />
        ) : null}
        {pick === "new" ? (
          <Card>
            <Field label="Full name" value={form.fullName} onChange={set("fullName")} autoCapitalize="sentences" />
            <Field label="Street address" value={form.line1} onChange={set("line1")} autoCapitalize="sentences" />
            <Field label="Apartment, suite (optional)" value={form.line2} onChange={set("line2")} autoCapitalize="sentences" />
            <Field label="City" value={form.city} onChange={set("city")} autoCapitalize="sentences" />
            <View style={s.twoUp}>
              <View style={{ flex: 1 }}><Field label="State" value={form.state} onChange={(v) => set("state")(v.toUpperCase().slice(0, 2))} autoCapitalize="characters" placeholder="TX" /></View>
              <View style={{ flex: 1.4 }}><Field label="ZIP code" value={form.zip} onChange={set("zip")} keyboard="number-pad" placeholder="78701" /></View>
            </View>
            <Field label="Phone (optional)" value={form.phone} onChange={set("phone")} keyboard="number-pad" />
          </Card>
        ) : null}

        <SectionLabel>Delivery</SectionLabel>
        <Choice on={method === "standard"} disabled={locked} onPress={() => setMethod("standard")} accent={accent}
          title="Standard Ground" sub="3 to 5 business days"
          right={live ? (rate ? money(rate.cost) : ratesBusy ? "…" : "") : shipping === null ? "Priced by the shop" : shipping === 0 ? "Free" : money(shipping)} />
        {rules.pickup ? (
          <Choice on={method === "will_call"} disabled={locked} onPress={() => setMethod("will_call")} accent={accent}
            title="Will Call Pickup" sub={`Collect it yourself${rules.pickupWhere ? `: ${rules.pickupWhere}` : ""}`} right="Free" />
        ) : null}
        {live && method === "standard" ? (
          addrProblem ? <Text style={s.hint}>Carrier rates show once the address is complete.</Text>
          : ratesBusy ? <Text style={s.hint}>Getting carrier rates…</Text>
          : rates && rates.length === 0 ? <Notice tone="warn">No carrier rates came back for this address. Check the ZIP code.</Notice>
          : (rates ?? []).map((r) => (
            <Choice key={r.id} on={r.id === rateId} disabled={locked} onPress={() => setRateId(r.id)} accent={accent} small
              title={`${r.carrier} ${r.service}`} sub={r.days ? `${r.days} business days` : undefined} right={money(r.cost)} />
          ))
        ) : null}

        <SectionLabel>Discount code</SectionLabel>
        <View style={s.codeRow}>
          <TextInput style={s.codeInput} value={code} onChangeText={setCode} placeholder="Code" placeholderTextColor={palette.muted}
            autoCapitalize="characters" autoCorrect={false} editable={!locked && !coupon} accessibilityLabel="Discount code" />
          {coupon ? (
            <Pressable onPress={() => { if (!locked) { setCoupon(null); setCode(""); } }} style={s.codeBtn} accessibilityRole="button">
              <Text style={s.codeBtnText}>Remove</Text>
            </Pressable>
          ) : (
            <Pressable onPress={applyCode} style={s.codeBtn} accessibilityRole="button" disabled={couponBusy || locked}>
              <Text style={s.codeBtnText}>{couponBusy ? "…" : "Apply"}</Text>
            </Pressable>
          )}
        </View>
        {coupon ? <Text style={[s.hint, { color: palette.ok }]}>{coupon.message || `${coupon.code} applied.`}</Text> : null}
        {couponErr ? <Text style={[s.hint, { color: palette.bad }]}>{couponErr}</Text> : null}

        <SectionLabel>Payment</SectionLabel>
        {ways.card ? (
          <Choice on={pay === "card"} disabled={locked} onPress={() => setPay("card")} accent={accent}
            title="Card" sub="Pay now, securely, by credit or debit card." />
        ) : null}
        {ways.cod ? (
          <Choice on={pay === "cod"} disabled={locked} onPress={() => setPay("cod")} accent={accent}
            title="Cash on delivery" sub="Pay in cash when your order arrives." />
        ) : null}

        <SectionLabel>Notes (optional)</SectionLabel>
        <Card>
          <Field label="PO number" value={po} onChange={setPo} autoCapitalize="characters" />
          <Field label="Note for the shop" value={notes} onChange={setNotes} autoCapitalize="sentences" />
        </Card>

        <SectionLabel>Order</SectionLabel>
        <Card>
          <Line label={`Items (${cart.units})`} value={money(subtotal)} />
          {coupon ? <Line label={`Discount ${coupon.code}`} value={coupon.type === "free_shipping" ? "Free shipping" : `−${money(discount)}`} tone="ok" /> : null}
          <Line label="Shipping" value={shipping === null ? "Priced by the shop" : shipping === 0 ? "Free" : money(shipping)} />
          <Line label={tax?.region ? `Tax (${tax.region})` : "Tax"} value={tax ? money(tax.amount) : addrProblem ? "With the address" : "…"} />
          <Line label="Total" value={shipping === null ? `${money(total)} + shipping` : money(total)} strong />
          {pay === "card" ? <Text style={s.hint}>The card is charged the total the shop works out, shown before you pay.</Text> : null}
        </Card>

        {error ? <Notice tone="bad">{error}</Notice> : null}
        {paidIntent ? <Notice tone="ok">Your card was charged. Finish placing the order below.</Notice> : null}
        <Button
          title={paidIntent ? "Finish placing the order" : pay === "card" ? "Pay and place order" : "Place order"}
          accent={accent} busy={busy}
          onPress={() => { if (!cart.blockers.length) place(); }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Choice({ on, title, sub, right, onPress, accent, disabled, small }: {
  on: boolean; title: string; sub?: string; right?: string; onPress: () => void; accent: string; disabled?: boolean; small?: boolean;
}) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="radio" accessibilityState={{ checked: on, disabled }}
      style={[s.choice, on && { borderColor: accent }, small && s.choiceSmall]}>
      <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? accent : palette.muted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.choiceTitle}>{title}</Text>
        {sub ? <Text style={s.choiceSub}>{sub}</Text> : null}
      </View>
      {right ? <Text style={s.choiceRight}>{right}</Text> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  body: { paddingHorizontal: space.lg, gap: space.sm },
  twoUp: { flexDirection: "row", gap: space.sm },
  hint: { ...type.small, color: palette.muted },
  choice: {
    flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: palette.line, backgroundColor: palette.paper,
  },
  choiceSmall: { paddingVertical: space.sm, marginLeft: space.lg },
  choiceTitle: { ...type.bodyMedium, color: palette.ink },
  choiceSub: { ...type.small, color: palette.ink70 },
  choiceRight: { ...type.number, color: palette.ink },
  codeRow: { flexDirection: "row", gap: space.sm },
  codeInput: {
    flex: 1, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper,
    paddingHorizontal: space.md, ...type.body, color: palette.ink,
  },
  codeBtn: { height: 46, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: palette.ink, alignItems: "center", justifyContent: "center", backgroundColor: palette.paper },
  codeBtnText: { ...type.bodyMedium, color: palette.ink },
});
