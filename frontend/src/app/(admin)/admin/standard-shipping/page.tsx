"use client";

/**
 * Settings, Shipping and pickup: how orders leave the shop.
 *
 * Everything here is the shop's own saved setting, and each is read by the
 * checkout the moment it is saved:
 * - carriers: the shop's own UPS, FedEx and USPS accounts (ConnectCarrierDialog, design 35);
 * - the ship-from address live rates and labels are worked out from;
 * - the standard rate, for customers without a shipping tier or discount
 *   group: one price, live carrier rates, or steps by order size. "Free
 *   shipping above" is saved as two order-value steps, which is how the
 *   checkout has always known it, so no second rule had to be taught to it;
 * - pickup (Will Call): offered or not, where it is, its hours and a note;
 * - the same-day cutoff and the clock it is read on (the Production screen
 *   counts down to it, and Reports measures on-time against it).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { CarrierList } from "@/components/admin/shipping/ConnectCarrierDialog";
import { TrackingPageCard } from "@/components/admin/shipping/TrackingPageCard";
import { SettingsFrame } from "@/components/admin/settings/SettingsFrame";
import { cutoffWords, productionService } from "@/services/production.service";
import { US_ZONES, allZones, forgetShopZone, offsetWords } from "@/lib/shopClock";
import { rateWords as describeRate, readRate, writeRate, type Bracket, type RateCalc as Calc, type RateMode as Mode } from "@/lib/shippingRate";

const COUNTRY_NAMES: Record<string, string> = { US: "United States", CA: "Canada" };
/** Every half hour of the day, as "HH:MM". */
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

export default function ShippingAndPickupPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);

  const [mode, setMode] = useState<Mode>("flat");
  const [amount, setAmount] = useState("0");
  const [freeOver, setFreeOver] = useState("");
  const [calc, setCalc] = useState<Calc>("order_value");
  const [steps, setSteps] = useState<Bracket[]>([]);
  // A line the old screen saved with the steps; kept as it is, nothing shows it.
  const [oldCutoffText, setOldCutoffText] = useState("");
  const [shipFrom, setShipFrom] = useState({ name: "", street1: "", city: "", state: "", zip: "", phone: "" });
  const [pickupOn, setPickupOn] = useState(true);
  const [pickupOwn, setPickupOwn] = useState(false);
  const [pickup, setPickup] = useState({ name: "", street1: "", city: "", state: "", zip: "", hours: "", note: "" });
  const [cutoff, setCutoff] = useState("");
  const [zone, setZone] = useState("");
  // As loaded, so an unchanged cutoff is not saved again.
  const [savedClock, setSavedClock] = useState({ cutoff: "", zone: "" });
  const [countries, setCountries] = useState<string[]>(["US", "CA"]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [settings, production] = await Promise.allSettled([
        apiClient.get<Record<string, string>>("/api/v1/admin/settings"),
        productionService.settings(),
      ]);
      if (cancelled) return;
      if (settings.status === "fulfilled") {
        const s = settings.value ?? {};
        const read = (key: string) => { try { return s[key] ? JSON.parse(s[key]!) : null; } catch { return null; } };
        const cfg = read("standard_shipping");
        if (cfg) {
          const rate = readRate(cfg);
          setOldCutoffText(cfg.cutoff_time ?? "");
          setMode(rate.mode); setCalc(rate.calc); setSteps(rate.steps);
          setAmount(String(rate.amount)); setFreeOver(rate.freeOver ? String(rate.freeOver) : "");
        }
        const from = read("ship_from");
        if (from) setShipFrom({ name: from.name ?? "", street1: from.street1 ?? "", city: from.city ?? "", state: from.state ?? "", zip: from.zip ?? "", phone: from.phone ?? "" });
        const place = read("pickup_location");
        if (place) {
          setPickup({ name: place.name ?? "", street1: place.street1 ?? "", city: place.city ?? "", state: place.state ?? "", zip: place.zip ?? "", hours: place.hours ?? "", note: place.note ?? "" });
          setPickupOwn(!!String(place.street1 ?? "").trim());
        }
        // Offered unless the shop has said no: the rule the checkout applies.
        setPickupOn(!["false", "0", "no", "off"].includes(String(s.pickup_enabled ?? "").trim().toLowerCase()));
        const markets = read("markets");
        if (Array.isArray(markets?.countries)) setCountries(["US", ...markets.countries.filter((c: string) => c === "CA")]);
      } else {
        setFlash({ text: "The saved settings could not be loaded. Reload before changing anything.", bad: true });
      }
      if (production.status === "fulfilled") {
        const c = production.value.cutoff ?? "", z = production.value.timezone ?? "";
        setCutoff(c); setZone(z); setSavedClock({ cutoff: c, zone: z });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const flatAmount = Number(amount) || 0;
  const over = Number(freeOver) || 0;
  // The rate as it stands on the screen, in the shape that is saved and read.
  const current = { mode, amount: flatAmount, freeOver: over, calc, steps };

  async function save() {
    if (mode === "flat" && over > 0 && flatAmount > 0 && over <= 0.01) { setFlash({ text: "Free shipping needs an order amount above one cent.", bad: true }); return; }
    setSaving(true); setFlash(null);
    try {
      await apiClient.patch("/api/v1/admin/settings", {
        standard_shipping: JSON.stringify(writeRate(current, { cutoff_time: oldCutoffText })),
        ship_from: JSON.stringify(shipFrom),
        // Its own address only when one was asked for: left out, the ship-from address is used.
        pickup_location: JSON.stringify(pickupOwn ? pickup : { hours: pickup.hours, note: pickup.note }),
        pickup_enabled: pickupOn ? "true" : "false",
      });
      if (cutoff !== savedClock.cutoff || zone !== savedClock.zone) {
        try {
          const saved = await productionService.saveSettings(cutoff, zone);
          const c = saved.cutoff ?? "", z = saved.timezone ?? "";
          setCutoff(c); setZone(z); setSavedClock({ cutoff: c, zone: z });
          forgetShopZone();
        } catch (e) {
          setFlash({ text: `Shipping and pickup are saved. The production cutoff is not: ${e instanceof Error && e.message ? e.message : "try again"}.`, bad: true });
          setSaving(false);
          return;
        }
      }
      setFlash({ text: "Saved. Checkout uses these from now on." });
    } catch (e) {
      setFlash({ text: e instanceof Error && e.message ? e.message : "The settings could not be saved. Try again.", bad: true });
    }
    setSaving(false);
  }

  const rateWords = describeRate(current);
  const sellsTo = countries.map((c) => COUNTRY_NAMES[c] ?? c).join(", ");
  // The same choice the server makes, shown before it is saved.
  const place = pickupOwn && pickup.street1.trim() ? pickup : shipFrom;
  const placeLine = [place.street1.trim(), place.city.trim(), [place.state.trim(), place.zip.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const cutoffTimes = cutoff && !HALF_HOURS.includes(cutoff) ? [cutoff, ...HALF_HOURS].sort() : HALF_HOURS;
  const everyZone = allZones().filter((z) => !US_ZONES.some(([known]) => known === z));

  return (
    <SettingsFrame active="shipping" title="Shipping and pickup" sub="How orders leave your shop."
      actions={<button type="button" className="pc-btn" data-kind="primary" onClick={save} disabled={saving || loading}>{saving ? "Saving…" : "Save"}</button>}>
      {flash && (
        <div className="pc-flash" data-bad={flash.bad ? "" : undefined} role="status">
          <span>{flash.text}</span>
          <button type="button" className="pc-x" aria-label="Dismiss" onClick={() => setFlash(null)} style={{ color: "inherit" }}><X size={16} strokeWidth={2.2} /></button>
        </div>
      )}

      <div style={{ display: "grid", gap: "18px" }} data-shipping aria-busy={loading}>
        {/* Carrier accounts: each shop connects its own, so postage bills to it. */}
        <section className="pc-card" style={{ padding: "18px 20px" }} data-card="carriers">
          <h2 className="pc-h2">Carriers</h2>
          <p className="pc-sub-line" style={{ margin: "6px 0 14px" }}>
            Connect your own account. Rates at checkout and every label you buy go through it, at your negotiated prices.
          </p>
          <CarrierList />
        </section>

        {/* The buyer's tracking page: on or off, and the shop's message on it. */}
        <TrackingPageCard />

        {/* Where parcels leave from: live rates and labels are worked out from here. */}
        <section className="pc-card" style={{ padding: "18px 20px" }} data-card="ship-from">
          <h2 className="pc-h2">Ship-from address</h2>
          <p className="pc-sub-line" style={{ margin: "6px 0 14px" }}>Live carrier rates and shipping labels are worked out from here, so use where parcels really leave from. It is a United States address.</p>
          <div className="pc-form3">
            <label><span className="pc-label">Business name</span>
              <input className="pc-input" value={shipFrom.name} onChange={(e) => setShipFrom({ ...shipFrom, name: e.target.value })} placeholder="Acme Apparel Warehouse" /></label>
            <label><span className="pc-label">Street</span>
              <input className="pc-input" value={shipFrom.street1} onChange={(e) => setShipFrom({ ...shipFrom, street1: e.target.value })} placeholder="123 Main St" /></label>
            <label><span className="pc-label">City</span>
              <input className="pc-input" value={shipFrom.city} onChange={(e) => setShipFrom({ ...shipFrom, city: e.target.value })} /></label>
            <label><span className="pc-label">State</span>
              <input className="pc-input" value={shipFrom.state} maxLength={2} placeholder="TX" onChange={(e) => setShipFrom({ ...shipFrom, state: e.target.value.toUpperCase().slice(0, 2) })} /></label>
            <label><span className="pc-label">ZIP code</span>
              <input className="pc-input" value={shipFrom.zip} onChange={(e) => setShipFrom({ ...shipFrom, zip: e.target.value })} /></label>
            <label><span className="pc-label">Phone</span>
              <input className="pc-input" value={shipFrom.phone} onChange={(e) => setShipFrom({ ...shipFrom, phone: e.target.value })} placeholder="Carriers ask for one" /></label>
          </div>
        </section>

        {/* The standard rate: what a customer with no tier of their own pays. */}
        <section className="pc-card" data-card="rates">
          <div className="pc-card-head" style={{ display: "block" }}>
            <h2 className="pc-h2">Shipping rates</h2>
            <p className="pc-sub-line" style={{ margin: "4px 0 0" }}>The standard rate, for customers without a shipping tier or a discount group of their own.</p>
          </div>
          <div className="pc-scroll-x">
            <table className="pc-table" style={{ minWidth: "480px" }}>
              <thead><tr><th>Zone</th><th>Countries</th><th>Rate</th></tr></thead>
              <tbody>
                <tr data-zone>
                  <td style={{ fontWeight: 600 }}>{countries.length > 1 ? "Everywhere you ship" : "Domestic"}</td>
                  <td>{sellsTo} <Link href="/admin/settings/markets" className="pc-inline" style={{ marginLeft: "6px" }}>Change</Link></td>
                  <td data-rate-words>{rateWords}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ padding: "18px 20px", display: "grid", gap: "16px", borderTop: "1px solid var(--pc-line)" }}>
            <div>
              <span className="pc-label">How shipping is charged</span>
              <div className="pc-seg" role="group" aria-label="How shipping is charged">
                {([["flat", "One price"], ["live", "Live carrier rates"], ["steps", "By order size"]] as const).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={mode === k} onClick={() => {
                    // Steps start from the price the shop has now, so switching loses nothing.
                    if (k === "steps" && mode === "flat" && steps.length === 0) {
                      const now = writeRate({ ...current, mode: "flat" });
                      setCalc("order_value");
                      setSteps(now.brackets.length ? now.brackets : [{ min_units: 0, max_units: null, min_order_value: 0, max_order_value: null, cost: flatAmount }]);
                    }
                    setMode(k);
                  }}>{label}</button>
                ))}
              </div>
            </div>

            {mode === "flat" && (
              <div className="pc-form2" style={{ maxWidth: "520px" }}>
                <label><span className="pc-label">Shipping price ($)</span>
                  <input className="pc-input" type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <span className="pc-sub-line" style={{ fontSize: "12.5px", marginTop: "6px", display: "block" }}>0 makes shipping free on every order.</span></label>
                <label><span className="pc-label">Free shipping above ($)</span>
                  <input className="pc-input" type="number" min="0" step="0.01" inputMode="decimal" value={freeOver} placeholder="Leave empty for none"
                    disabled={flatAmount === 0} onChange={(e) => setFreeOver(e.target.value)} />
                  <span className="pc-sub-line" style={{ fontSize: "12.5px", marginTop: "6px", display: "block" }}>Orders of this much or more ship free.</span></label>
              </div>
            )}

            {mode === "live" && (
              <p className="pc-sub-line" style={{ margin: 0, maxWidth: "640px" }}>
                Customers see each service your connected carriers offer, with its live price, and pick one before they pay.
                Until you connect a carrier, live rates are quoted through the platform&apos;s account, so the prices are standard published rates and not yours.
              </p>
            )}

            {mode === "steps" && (
              <div style={{ display: "grid", gap: "12px" }}>
                <div>
                  <span className="pc-label">Steps go by</span>
                  <div className="pc-seg" role="group" aria-label="Steps go by">
                    {([["order_value", "Order value"], ["units", "Number of units"]] as const).map(([k, label]) => (
                      <button key={k} type="button" aria-pressed={calc === k} onClick={() => { if (calc !== k) { setCalc(k); setSteps([]); } }}>{label}</button>
                    ))}
                  </div>
                </div>
                <div className="pc-scroll-x" style={{ border: "1px solid var(--pc-line)", borderRadius: "10px" }}>
                  <table className="pc-table" style={{ minWidth: "460px" }}>
                    <thead><tr>
                      <th>{calc === "units" ? "From units" : "From order ($)"}</th>
                      <th>{calc === "units" ? "To units" : "To order ($)"}</th>
                      <th>Shipping ($)</th><th aria-label="Remove" />
                    </tr></thead>
                    <tbody>
                      {steps.length === 0 && <tr><td colSpan={4} className="pc-empty">No steps yet. Add the first one.</td></tr>}
                      {steps.map((b, i) => {
                        const lo = calc === "units" ? "min_units" : "min_order_value";
                        const hi = calc === "units" ? "max_units" : "max_order_value";
                        const change = (field: keyof Bracket, raw: string) => setSteps(steps.map((row, j) => j !== i ? row : {
                          ...row, [field]: field === "cost" ? Number(raw) || 0 : raw === "" ? (field === lo ? 0 : null) : Number(raw) || 0,
                        }));
                        return (
                          <tr key={i} data-step>
                            <td><input className="pc-input" type="number" min="0" step={calc === "units" ? "1" : "0.01"} value={b[lo] ?? ""} onChange={(e) => change(lo, e.target.value)} aria-label="From" /></td>
                            <td><input className="pc-input" type="number" min="0" step={calc === "units" ? "1" : "0.01"} value={b[hi] ?? ""} placeholder="No limit" onChange={(e) => change(hi, e.target.value)} aria-label="To" /></td>
                            <td><input className="pc-input" type="number" min="0" step="0.01" value={b.cost} onChange={(e) => change("cost", e.target.value)} aria-label="Shipping" /></td>
                            <td><button type="button" className="pc-x" aria-label="Remove this step" onClick={() => setSteps(steps.filter((_, j) => j !== i))}><X size={16} /></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" className="pc-btn" onClick={() => setSteps([...steps, { min_units: 0, max_units: null, min_order_value: null, max_order_value: null, cost: 0 }])}>+ Add a step</button>
                  <span className="pc-sub-line" style={{ fontSize: "12.5px" }}>Leave the last step&apos;s &quot;to&quot; empty to cover everything above it. A step that costs 0 ships free.</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Pickup: whether the checkout offers it, and what a customer is told. */}
        <section className="pc-card" style={{ padding: "18px 20px" }} data-card="pickup">
          <h2 className="pc-h2">Pickup</h2>
          <div className="pc-switch-row" style={{ margin: "14px 0 0", alignItems: "center" }}>
            <span>Offer pickup (Will Call)
              <div className="pc-sub-line" style={{ fontSize: "12.5px", fontWeight: 400 }}>Customers can choose to collect their order at checkout, with no shipping charged.</div>
            </span>
            <button type="button" className="pc-switch" role="switch" aria-label="Offer pickup" aria-checked={pickupOn} data-on={pickupOn ? "" : undefined} onClick={() => setPickupOn(!pickupOn)} />
          </div>
          {pickupOn && (
            <div style={{ display: "grid", gap: "14px", marginTop: "16px" }}>
              <div>
                <span className="pc-label">Where customers collect</span>
                <div className="pc-seg" role="group" aria-label="Where customers collect">
                  <button type="button" aria-pressed={!pickupOwn} onClick={() => setPickupOwn(false)}>My ship-from address</button>
                  <button type="button" aria-pressed={pickupOwn} onClick={() => setPickupOwn(true)}>A different address</button>
                </div>
              </div>
              {pickupOwn && (
                <div className="pc-form3">
                  <label><span className="pc-label">Name of the place</span>
                    <input className="pc-input" value={pickup.name} onChange={(e) => setPickup({ ...pickup, name: e.target.value })} placeholder="Acme Print Shop" /></label>
                  <label><span className="pc-label">Street</span>
                    <input className="pc-input" value={pickup.street1} onChange={(e) => setPickup({ ...pickup, street1: e.target.value })} /></label>
                  <label><span className="pc-label">City</span>
                    <input className="pc-input" value={pickup.city} onChange={(e) => setPickup({ ...pickup, city: e.target.value })} /></label>
                  <label><span className="pc-label">State</span>
                    <input className="pc-input" value={pickup.state} maxLength={2} onChange={(e) => setPickup({ ...pickup, state: e.target.value.toUpperCase().slice(0, 2) })} /></label>
                  <label><span className="pc-label">ZIP code</span>
                    <input className="pc-input" value={pickup.zip} onChange={(e) => setPickup({ ...pickup, zip: e.target.value })} /></label>
                </div>
              )}
              <div className="pc-form2">
                <label><span className="pc-label">Hours</span>
                  <input className="pc-input" value={pickup.hours} onChange={(e) => setPickup({ ...pickup, hours: e.target.value })} placeholder="Mon to Fri, 9 AM to 5 PM" /></label>
                <label><span className="pc-label">Note for the customer</span>
                  <input className="pc-input" value={pickup.note} onChange={(e) => setPickup({ ...pickup, note: e.target.value })} placeholder="Bring your order number and a photo ID" /></label>
              </div>
              <div className="pc-note" data-tone="blue" data-pickup-preview>
                <div className="pc-small-head" style={{ marginBottom: "4px" }}>What your customers see</div>
                {placeLine
                  ? <div style={{ fontWeight: 600 }}>{place.name.trim() ? `${place.name.trim()}, ` : ""}{placeLine}</div>
                  : <div>No address yet. Customers are told the pickup address comes with their order confirmation.</div>}
                {pickup.hours.trim() && <div>{pickup.hours.trim()}</div>}
                {pickup.note.trim() && <div>{pickup.note.trim()}</div>}
              </div>
            </div>
          )}
        </section>

        {/* The same-day cutoff, and the clock it is read on. */}
        <section className="pc-card" style={{ padding: "18px 20px" }} data-card="cutoff">
          <h2 className="pc-h2">Production cutoff</h2>
          <div className="pc-form2" style={{ marginTop: "14px" }}>
            <label><span className="pc-label">Artwork approved by</span>
              <select className="pc-input" value={cutoff} onChange={(e) => setCutoff(e.target.value)} data-cutoff-select>
                <option value="">No cutoff</option>
                {cutoffTimes.map((t) => <option key={t} value={t}>{cutoffWords(t)}</option>)}
              </select>
              <span className="pc-sub-line" style={{ fontSize: "12.5px", marginTop: "6px", display: "block" }}>Ships the same day. The Production screen counts down to it.</span></label>
            <label><span className="pc-label">Time zone</span>
              <select className="pc-input" value={zone} onChange={(e) => setZone(e.target.value)} data-zone-select>
                <option value="">Each person&apos;s own clock</option>
                <optgroup label="United States">
                  {US_ZONES.map(([z, name]) => <option key={z} value={z}>{name} ({offsetWords(z)})</option>)}
                </optgroup>
                <optgroup label="Everywhere">
                  {everyZone.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
                </optgroup>
              </select>
              <span className="pc-sub-line" style={{ fontSize: "12.5px", marginTop: "6px", display: "block" }}>The cutoff and the days in Reports are read on this clock.</span></label>
          </div>
        </section>
      </div>
    </SettingsFrame>
  );
}
