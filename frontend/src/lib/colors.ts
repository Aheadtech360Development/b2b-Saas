/**
 * A colour's name, turned into the colour.
 *
 * Seven screens each carried their own copy of an eighty-name list and looked
 * a colour up by its exact spelling, capitals included — so "Heather Royal",
 * "navy" or "Safety Green" drew as a grey dot, and a colour added in the admin
 * under a name the list did not have was saved as grey. This is the one place
 * a name becomes a colour now:
 *
 *   colorHex("Heather Royal")        a heathered royal blue
 *   colorHex("Seafoam", "#888888")   seafoam — the grey once saved as a stand-in gives way to the name
 *   colorHex("Our Teal", "#0D7C80")  #0D7C80 — a colour the shop chose always wins
 *   colorHex("#1F3A93")              that colour — a hex written as the name is the colour
 *   knownColor("Xyzzy")              null — never guessed; the admin is asked for it instead
 *
 * Names are read the way people write them: any capitals, grey or gray,
 * "Lt" / "Dk" / "Hthr", "White/Black" (the body colour comes first), and
 * words about the cloth rather than the colour — Solid, Triblend, Heather,
 * Vintage, Neon — shade the colour instead of hiding it.
 */

type RGB = [number, number, number];

/** Drawn when a colour has neither a hex of its own nor a name anybody knows. */
export const UNKNOWN_COLOR = "#D9D9D6";

/** Greys that were saved as a stand-in when a name was not known — nobody's choice of colour. */
const STAND_INS = new Set(["#888888", "#CCCCCC"]);

// The first block is the list the shop has always drawn from: those shades are
// kept exactly, so nothing that was right changes. The rest are the names the
// blank-garment mills use (Gildan, Bella+Canvas, Comfort Colors, Next Level,
// Port & Company), then the web's own colour names.
const NAMES = `
white FFFFFF | black 111111 | navy 1E3A5F | red E8242A | blue 1A5CFF | royal 2251CC | royal blue 2251CC
gray 9CA3AF | dark gray 4B5563 | light gray D1D5DB | charcoal 374151 | sport gray 9CA3AF | heather gray B0B7C3
athletic heather B0B7C3 | heather B0B7C3 | dark heather 6B7280 | sand C6A67F | natural F5F0E8 | tan C9A96E
brown 78350F | maroon 7F1D1D | burgundy 881337 | green 166534 | forest 1B4332 | forest green 14532D
kelly green 15803D | lime 65A30D | yellow EAB308 | gold F69D0B | mustard D4A843 | orange EA580C | purple 7C3AED
pink FFCFCE | hot pink DB2777 | coral F87171 | teal 0CAFCC | turquoise 06B6D4 | mint 6EE7B7 | olive 4D7C0F
cream FEF3C7 | ivory FFFFF0 | sky blue 38BDF8 | lavender A78BFA | light blue 7DD3FC | stonewash blue 5B8FA8
dark navy 0F1F3D | indigo 3730A3 | cardinal 7B1520 | crimson 9F0712 | carolina blue 56A0D3 | columbia blue 9BC4E2
silver C0C0C0 | ash gray B2B2B2 | ash B2B2B2 | stone A8A29E | mocha 7C5C48 | chocolate 5C3D2E | caramel B5651D
camo 78866B | oatmeal heather D6CFC7 | sports gray C4C4C4 | charcoal heather 4A4A4A | texas orange BF5700
baby pink F4C2C2 | moss green 305040 | lime green 32CD32 | rust B7410E | peach FFDAB9 | pacific blue 1CA9C9
dust EBDCC8 | military green 4B5320 | neon yellow FFFF33 | neon orange FF5F1F | denim 1560BD
salt and pepper 8E8E8E | powder blue B0E0E6 | pure navy 373F53 | sawana brown 7D6C5B | decadent chocolate 723638
wine 722F37 | sage 9CAF88 | deep teal 0F4C4C | dusty rose C08497 | dusk 8B7B9B

off white FAF9F6 | vintage white F4F0E6 | antique white FAEBD7 | soft cream F3E9D2 | bone E3DAC9 | ecru F0EAD6
eggshell F0EAD6 | pearl EAE0C8 | snow FFFAFA | oatmeal D9CBB5 | linen E9DCC9 | vanilla F3E5AB | champagne F7E7CE
beige E1D2B8 | almond EADDCA | parchment F1E9D2 | putty CDBFA7 | sandstone C5B9A5 | khaki C3B091
british khaki A89F7B | latte C8AD8D | mushroom B8A99A | taupe 8B7E74 | camel C19A6B | toast C68A4B | nude E3BC9A
desert sand EDC9AF | hemp 8E8566 | prairie dust 7A7256 | brown savana 7A6855 | pebble brown 8A7968 | pebble 9A9186
heather dust E5D9C8

butter FBE8A6 | banana FFE135 | cornsilk F0EC74 | daisy FED141 | yellow haze F5E1A4 | pale yellow FDFD96
light yellow FFF59D | lemon FFF44F | maize F2C649 | maize yellow F2C649 | sunflower FFC512 | athletic gold FFB81C
yellow gold FFC72C | old gold C39B3C | vegas gold C5B358 | antique gold B8963E | metallic gold D4AF37
citron D8E24A | safety yellow E8E01F | canary FFEF00 | honey EBA937 | amber FFBF00 | mango FFC324
marigold EAA221 | sunshine FFD23F

safety orange FF6720 | tennessee orange FF8200 | burnt orange BE5A26 | bright orange FF7A00 | sunset DC6B2F
tangerine FF8A3D | pumpkin FF7518 | apricot FBCEB1 | melon FEBAAD | salmon FA8072 | coral silk FB637E
yam C8703C | terracotta C4674A | terra cotta C4674A | autumn C06B3E | copper B87333 | clay B66A50
cinnamon A0522D | bronze A97142 | paprika 9E2A2B

cherry red AC2B37 | antique cherry red 971B2F | cardinal red 8A1538 | garnet 7D2935 | cranberry 9B1B30
brick A04A45 | brick red A23C2E | chili 9E2B2F | scarlet C8102E | true red D0021B | canvas red 9D2235
fire red CE2029 | poppy E4002B | deep red B31B1B | dark red 8B0000 | ruby 9B111E | black cherry 4B1D2B
oxblood 4A0404 | red pepper C0392B | sangria A6325A | mahogany 5B2A22

rose E8909C | rose gold B76E79 | berry 85345C | raspberry B3446C | watermelon DE5D6A | crunchberry E0457B
strawberry FC5A8D | flamingo FC8EAC | bubblegum FFC1CC | blossom F5C8D0 | blush F4C7C3 | charity pink F8A3BC
candy pink F5A3C7 | light pink E4C6D4 | pale pink F9D3DC | soft pink F6C6CF | azalea DD74A1 | heliconia DB3E79
safety pink E16F8F | neon pink FF4FA3 | fuchsia C724B1 | magenta D0006F | mauve BF6E6E | heather mauve C49B9B

orchid C5B4E3 | radiant orchid B565A7 | heather radiant orchid A15A95 | lilac C8A2C8 | violet 8094DD
grape 6B5B95 | plum 5A315D | eggplant 3D2946 | blackberry 221C35 | team purple 4B2E83 | amethyst 9966CC
dark lavender 8A7AA6 | lavender blue 9AA7E0 | periwinkle 8E9CCB | wisteria C9A0DC | mulberry 70193D
heather prism lilac D9C7E8

true navy 1F2B4D | j navy 1F2A44 | classic navy 1C2B4A | deep navy 111D3C | midnight navy 1C2541
midnight 1B2A49 | navy blazer 1F2A44 | ink 1F2A44 | true royal 1F4E9E | deep royal 1D3F8A | athletic royal 24459B
cobalt 0047AB | sapphire 0077B5 | antique sapphire 006A8E | iris 3975B7 | indigo blue 486D87 | stone blue 7E93A7
sky 71B2DB | baby blue A8C9E5 | ice blue B9D3DC | blue jean 5E7A93 | chambray A9BDD6 | china blue 3F62A5
flo blue 6C7FC6 | blue dusk 253746 | metro blue 485CC7 | neon blue 307FE2 | electric blue 0892D0
french blue 0072BB | airforce blue 5D8AA8 | air force blue 5D8AA8 | steel blue 4A708B | slate blue 5B7C99
dusty blue 7A9CB5 | ocean blue 1B6B93 | ocean 1B6B93 | deep marine 1F5B7A | marine 1F5B7A | aquatic blue 57B7DC
caribbean blue 00A9CE | tropical blue 00859B | galapagos blue 005D6F | lagoon blue 51BFE2 | topaz blue 00A3C4
cyan 00AEEF | aqua 2EC4C6 | ultramarine 2B3FA0 | medium blue 2A6EBB | azure 2B8FD9 | cornflower 6495ED
peacock 1B6F7B | heather prism ice blue C7E3F0 | heather prism dusty blue A9C6D6

jade dome 008E85 | jade 00A86B | seafoam 9FD5B8 | sea foam 9FD5B8 | seafoam green 9FD5B8 | chalky mint A6DDD0
island reef 8FE2B8 | mint green A0CFA8 | celadon ACE1AF | dark teal 0F5257 | irish green 00A74A | kelly 15803D
turf green 007A3E | electric green 43B02A | neon green AADB1E | safety green C6D219 | kiwi 89A84F
pistachio A9C47F | bay B5C4B1 | moss 6B6F4E | army 5E6142 | army green 4B5320 | olive drab 5B5B3A
olive green 5E6738 | evergreen 1E4D3B | emerald 0F8A5F | emerald green 0F8A5F | grass 5AAB61 | grass green 4C9A2A
light green 98D6A5 | leaf 5CA04A | leaf green 5CA04A | hunter green 1F4D3A | hunter 1F4D3A | dark green 1B4D3E
bottle green 0B4F36 | pine 2A5D4E | pine green 2A5D4E | spruce 1D5448 | avocado 6A7B41 | fern 4F7942
cactus 5B8C5A | shamrock 009E60 | apple green 8DB600 | heather prism mint B5E5CF

dark chocolate 382F2D | chestnut 83635C | russet 512F2E | espresso 4E3B31 | coffee 6F4E37 | cocoa 5C4033
walnut 5D432C | saddle 8B5A2B | tobacco 6D5843 | woodland brown 5A4A3A | sepia 704214

ice gray D7D6D3 | light steel C3C7CB | steel 71797E | steel gray 71797E | graphite 4B4F54
graphite heather 707372 | granite 676C6F | gravel 8A8D8F | pepper 5F605B | smoke 848884 | smoke gray 848884
storm 5E6770 | asphalt 50555C | slate 5A6772 | slate gray 5A6772 | gunmetal 53565A | pewter 8E9294
iron 48494B | iron gray 48494B | tweed 5E5D59 | dark gray heather 474A51 | deep heather 757575
gray heather B0B7C3 | light heather gray C9CDD2 | dark heather gray 5F6062 | heather charcoal 4A4A4A
black heather 3A3A3C | heather black 3A3A3C | vintage black 2E2E30 | jet black 0A0A0A | onyx 1B1B1B
coal 333333 | anthracite 383E42 | carbon 3B3B3D | cement B7B6B0 | concrete A7A8AA | gray concrete A7A8AA
zinc 9A9B9C | platinum D4D4D4 | titanium 878681 | shadow 5A5A5A | aluminum A9ACB6 | fog C4C8CB | oxford A7A9AC

aquamarine 7FFFD4 | bisque FFE4C4 | burlywood DEB887 | cadet blue 5F9EA0 | chartreuse 7FFF00
cornflower blue 6495ED | dodger blue 1E90FF | firebrick B22222 | gainsboro DCDCDC | goldenrod DAA520
honeydew F0FFF0 | lemon chiffon FFFACD | midnight blue 191970 | mint cream F5FFFA | misty rose FFE4E1
moccasin FFE4B5 | navajo white FFDEAD | old lace FDF5E6 | orange red FF4500 | pale green 98FB98
pale turquoise AFEEEE | papaya whip FFEFD5 | peach puff FFDAB9 | peru CD853F | rosy brown BC8F8F
saddle brown 8B4513 | sandy brown F4A460 | sea green 2E8B57 | seashell FFF5EE | sienna A0522D
spring green 00FF7F | thistle D8BFD8 | tomato FF6347 | wheat F5DEB3 | white smoke F5F5F5
yellow green 9ACD32 | rebecca purple 663399 | medium purple 9370DB | dark orchid 9932CC | dark violet 9400D3
dark magenta 8B008B | deep pink FF1493 | light coral F08080 | light salmon FFA07A | dark salmon E9967A
light sea green 20B2AA | dark sea green 8FBC8F | medium sea green 3CB371 | dark cyan 008B8B
dark turquoise 00CED1 | medium turquoise 48D1CC | light cyan E0FFFF | dark slate gray 2F4F4F | dim gray 696969
light slate gray 778899 | dark goldenrod B8860B | pale goldenrod EEE8AA | dark orange FF8C00
dark khaki BDB76B | lawn green 7CFC00
`;

const TABLE = new Map<string, string>();
/** The same names with the spaces taken out, for "SkyBlue" and "forestgreen". */
const SQUASHED = new Map<string, string>();
for (const entry of NAMES.split(/[|\n]/)) {
  const m = /^\s*(.+?)\s+([0-9A-F]{6})\s*$/.exec(entry);
  if (!m || TABLE.has(m[1]!)) continue;
  TABLE.set(m[1]!, `#${m[2]}`);
  const squashed = m[1]!.replace(/ /g, "");
  if (!SQUASHED.has(squashed)) SQUASHED.set(squashed, `#${m[2]}`);
}

/** How names get shortened on a spec sheet. */
const SHORT: Record<string, string> = {
  grey: "gray", hthr: "heather", htr: "heather", hth: "heather", heathered: "heather", lt: "light", lite: "light",
  dk: "dark", drk: "dark", blk: "black", wht: "white", nvy: "navy", gry: "gray", grn: "green", blu: "blue",
  yel: "yellow", org: "orange", prpl: "purple", ppl: "purple", brn: "brown", burg: "burgundy", char: "charcoal",
  roy: "royal", pnk: "pink", slvr: "silver", gld: "gold", nat: "natural", crm: "cream", trq: "turquoise",
  olv: "olive", ath: "athletic", med: "medium",
};

// Words that say something about the cloth or the shade, not which colour it is.
const DARK = new Set(["dark", "deep"]);
const LIGHT = new Set(["light", "pale", "baby", "pastel", "soft", "powder"]);
const FROST = new Set(["frost", "frosted", "ice", "icy", "mist", "misty", "snow", "prism", "haze"]);
const HEATHER = new Set(["heather", "melange", "marl", "marled", "triblend", "tri"]);
const SOFT = new Set([
  "vintage", "antique", "washed", "faded", "dusty", "muted", "smoky", "smokey", "stonewash", "stonewashed",
  "weathered", "distressed", "pigment", "mineral", "ash",
]);
const VIVID = new Set(["neon", "safety", "electric", "fluorescent", "fluo", "highlighter", "bright", "vivid", "hot", "ultra"]);
const NOISE = new Set([
  "solid", "blend", "cvc", "slub", "marble", "marbled", "fleck", "flecked", "speckle", "speckled", "wash", "dye",
  "dyed", "garment", "pfd", "ringspun", "premium", "classic", "true", "team", "athletic", "sport", "sports", "new",
  "color", "colour", "tone", "and", "with", "w", "metallic", "matte", "gloss", "glossy", "satin", "shiny", "opaque",
  "medium", "the", "hi", "vis",
]);
const SHADING = new Set([...DARK, ...LIGHT, ...FROST, ...HEATHER, ...SOFT, ...VIVID, ...NOISE]);

const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const hexOf = (c: RGB) => "#" + c.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0")).join("").toUpperCase();
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * t) as RGB;
const light = (c: RGB) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
/** More of the colour (k above 1) or less of it (below), around its own grey. */
const sat = (c: RGB, k: number): RGB => { const g = light(c); return c.map((n) => g + (n - g) * k) as RGB; };

/** A named colour, shaded by the other words in its name. */
function shade(base: string, extra: string[]): string {
  if (!extra.length) return base;
  const has = (set: Set<string>) => extra.some((w) => set.has(w));
  let c = rgb(base);
  if (has(VIVID)) { c = sat(c, 1.5); if (light(c) < 90) c = mix(c, [255, 255, 255], 0.15); }
  if (has(DARK)) c = mix(c, [0, 0, 0], 0.3);
  if (has(LIGHT)) c = mix(c, [255, 255, 255], 0.45);
  if (has(FROST)) c = mix(c, [255, 255, 255], 0.3);
  if (has(HEATHER)) c = mix(sat(c, 0.82), [201, 204, 209], 0.24);
  if (has(SOFT)) c = mix(sat(c, 0.72), [184, 180, 170], 0.14);
  return hexOf(c);
}

/** A name as plain lower-case words: no accents or punctuation, short forms written out. */
function words(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim().split(" ").filter(Boolean)
    .map((w) => SHORT[w] ?? w);
}

/**
 * The longest run of words that is a colour's name — the later one when two
 * are as long, since the colour usually comes last ("Heather Deep Royal").
 * A run of shading words alone is passed over first, so "Navy Heather" is navy
 * and only "Heather" by itself is the grey.
 */
function find(ws: string[]): string | null {
  if (!ws.length) return null;
  const whole = TABLE.get(ws.join(" "));
  if (whole) return whole;
  for (const strict of [true, false]) {
    for (let n = Math.min(ws.length, 4); n >= 1; n--) {
      for (let at = ws.length - n; at >= 0; at--) {
        const run = ws.slice(at, at + n);
        if (strict && run.every((w) => SHADING.has(w))) continue;
        const hit = TABLE.get(run.join(" "));
        if (hit) return shade(hit, [...ws.slice(0, at), ...ws.slice(at + n)]);
      }
    }
  }
  return SQUASHED.get(ws.join("")) ?? null;
}

/** "#1f3a93", "1F3A93", "#abc" or "#1f3a93ff" as "#1F3A93"; anything else null. */
export function normalizeHex(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  const six = /^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(s);
  if (six) return `#${six[1]!.toUpperCase()}`;
  const three = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  return three ? `#${three[1]}${three[1]}${three[2]}${three[2]}${three[3]}${three[3]}`.toUpperCase() : null;
}

const known = new Map<string, string | null>();

/** The colour a name means, or null when nobody could say — it is never guessed. */
export function knownColor(name: unknown): string | null {
  const raw = typeof name === "string" ? name.trim() : "";
  if (!raw) return null;
  const cached = known.get(raw);
  if (cached !== undefined) return cached;

  let out: string | null = null;
  // A hex written as the name: with its #, or bare when it could not be a word.
  if (raw.startsWith("#") || /\d/.test(raw)) out = normalizeHex(raw);
  if (!out) {
    const ws = words(raw);
    out = TABLE.get(ws.join(" ")) ?? null;
    if (!out) {
      // "White/Black", "Navy w/ Gold", "Pink & Grey": the body colour is named first.
      const parts = raw.split(/\s*(?:\/|\+|&|,|\bwith\b|\band\b|\bon\b)\s*/i).filter((p) => p.trim());
      if (parts.length > 1) {
        for (const part of parts) { out = find(words(part)); if (out) break; }
      } else {
        out = find(ws);
      }
    }
  }
  if (known.size > 5000) known.clear();
  known.set(raw, out);
  return out;
}

/**
 * The colour for a variant, or null when there is nothing to go on: the shop's
 * own hex when it chose one, else what the name means. A grey saved as a
 * stand-in is not a choice, so a name that is known is used instead of it.
 */
export function resolveColor(name: unknown, own?: string | null): string | null {
  const mine = normalizeHex(own);
  if (mine && !STAND_INS.has(mine)) return mine;
  return knownColor(name) ?? mine;
}

/** The colour to draw for a variant — a quiet neutral when there is nothing to go on. */
export function colorHex(name: unknown, own?: string | null): string {
  return resolveColor(name, own) ?? UNKNOWN_COLOR;
}

/** Every name known here, written the way people write them — to suggest as an admin types. */
export function colorNames(): string[] {
  return [...TABLE.keys()].map((k) => k.replace(/\b[a-z]/g, (c) => c.toUpperCase()));
}

/** Whether a swatch of this colour needs an edge to be seen on a white page. */
export function isLightColor(hex: string): boolean {
  const h = normalizeHex(hex);
  return !!h && light(rgb(h)) > 205;
}

/**
 * What was typed for a colour, as a name and (when one was given) a hex:
 * "Seafoam #9FD5B8", "Seafoam (#9FD5B8)", "Seafoam: #9fd5b8" or just "#9FD5B8".
 */
export function parseColorEntry(text: string): { name: string; hex: string | null } {
  const raw = (text || "").trim();
  const token = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z])/i.exec(raw);
  if (token) {
    const hex = normalizeHex(token[0]);
    const name = (raw.slice(0, token.index) + " " + raw.slice(token.index + token[0].length))
      .replace(/[\s:;,=()[\]–—-]+$/g, "").replace(/^[\s:;,=()[\]–—-]+/g, "").replace(/\s*[([]\s*[)\]]\s*/g, " ").replace(/\s+/g, " ").trim();
    return { name: name || hex || raw, hex };
  }
  if (/^[0-9a-f]{6}$/i.test(raw) && /\d/.test(raw)) return { name: `#${raw.toUpperCase()}`, hex: `#${raw.toUpperCase()}` };
  return { name: raw, hex: null };
}
