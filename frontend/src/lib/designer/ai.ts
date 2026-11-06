/**
 * "Create AI design": a prompt in, a few finished layouts out.
 *
 * Behind an interface so the real thing can replace it in one place. Today it
 * composes layouts from the buyer's own words, a matching graphic and four
 * house styles, entirely in the browser. Later `designer` becomes a call to
 * the copilot service that returns the same `ObjectSpec`s.
 */
import { GRAPHICS } from "./graphics";
import { luminance } from "./mockups";

/** One object to place, in print space (inches from the top-centre of the print area). */
export type ObjectSpec =
  | {
      type: "text";
      text: string;
      font: string;
      /** Cap height to aim for, in inches. */
      heightIn: number;
      /** Widest the text may be, in inches. */
      maxWidthIn: number;
      fill: string;
      stroke?: string;
      strokeWidth?: number;
      charSpacing?: number;
      curve?: number;
      xIn: number;
      yIn: number;
    }
  | {
      type: "graphic";
      graphicId: string;
      widthIn: number;
      fill: string;
      xIn: number;
      yIn: number;
    };

export interface AiVariation {
  id: string;
  label: string;
  objects: ObjectSpec[];
}

export interface AiRequest {
  prompt: string;
  style: AiStyle;
  garmentHex: string;
  /** Print area width, so layouts fit the garment they are made for. */
  areaWidthIn: number;
}

export type AiStyle = "Varsity" | "Bold" | "Retro" | "Script";
export const AI_STYLES: AiStyle[] = ["Varsity", "Bold", "Retro", "Script"];

export interface AiDesigner {
  generate(req: AiRequest): Promise<AiVariation[]>;
}

const FILLER = new Set([
  "a", "an", "the", "for", "with", "and", "of", "to", "in", "on", "my", "our", "your",
  "design", "designs", "shirt", "shirts", "tee", "tees", "t-shirt", "tshirt", "make", "create",
  "logo", "please", "want", "need", "some", "that", "says", "say", "text", "cool", "style",
]);

const GRAPHIC_WORDS: [RegExp, string][] = [
  [/basket|hoop|ball(er)?s?\b/, "basketball"],
  [/baseball|softball/, "baseball"],
  [/football|gridiron/, "football"],
  [/champ|trophy|win|cup|league/, "trophy"],
  [/medal|award|finish|marathon|race|run/, "medal"],
  [/fire|flame|hot|heat|burn/, "flame"],
  [/king|queen|royal|crown/, "crown"],
  [/mountain|hike|trail|outdoor|camp|summit/, "mountain"],
  [/sun|summer|beach|surf/, "sun"],
  [/dog|cat|paw|pet|wild|lion|tiger|bear|cub/, "paw"],
  [/music|band|choir|concert|tour/, "note"],
  [/love|heart|family|valentine/, "heart"],
  [/power|energy|electric|storm|bolt|lightning/, "bolt"],
  [/nature|green|eco|garden|plant/, "leaf"],
  [/sail|boat|navy|sea|ocean|anchor/, "anchor"],
];

function pickGraphic(prompt: string): string {
  const p = prompt.toLowerCase();
  return GRAPHIC_WORDS.find(([re]) => re.test(p))?.[1] ?? "star";
}

/** The words worth printing, in order. */
export function keyWords(prompt: string): string[] {
  return prompt
    .replace(/["“”]/g, " ")
    .split(/[^A-Za-z0-9'&#-]+/)
    .filter((w) => w && !FILLER.has(w.toLowerCase()));
}

/**
 * The words to print, by role: `title` is the name (the first word), `tag`
 * the rest of the line, `full` the first two words, `extra` anything after.
 */
function headline(prompt: string) {
  const year = "EST. " + new Date().getFullYear();
  const words = keyWords(prompt).map((w) => w.toUpperCase());
  if (!words.length) return { title: "TEAM", tag: year, full: "YOUR TEAM", stacked: "YOUR\nTEAM", extra: year };
  const full = words.slice(0, 2).join(" ");
  return {
    title: words[0]!,
    tag: words.slice(1, 5).join(" ") || year,
    full,
    stacked: words.slice(0, 2).join("\n"),
    extra: words.slice(2, 6).join(" ") || year,
  };
}

/** Colours that read on this garment. */
function inks(garmentHex: string) {
  const dark = luminance(garmentHex) < 0.35;
  return {
    ink: dark ? "#F5F3EE" : "#16181D",
    accent: dark ? "#F2B630" : "#C8322B",
    second: dark ? "#7FB2E8" : "#1F3E8A",
  };
}

function layouts(req: AiRequest): AiVariation[] {
  const { title, tag, full, stacked, extra } = headline(req.prompt);
  const g = pickGraphic(req.prompt);
  const w = Math.min(req.areaWidthIn, 12);
  const { ink, accent, second } = inks(req.garmentHex);
  const gfx = GRAPHICS.some((x) => x.id === g) ? g : "star";

  const byStyle: Record<AiStyle, [ObjectSpec[], ObjectSpec[]]> = {
    Varsity: [
      [
        { type: "text", text: tag, font: "Graduate", heightIn: w * 0.07, maxWidthIn: w * 0.85, fill: ink, curve: 30, xIn: 0, yIn: w * 0.1 },
        { type: "text", text: title, font: "Graduate", heightIn: w * 0.22, maxWidthIn: w * 0.95, fill: accent, stroke: ink, strokeWidth: 8, xIn: 0, yIn: w * 0.36 },
        { type: "graphic", graphicId: gfx, widthIn: w * 0.2, fill: ink, xIn: 0, yIn: w * 0.66 },
      ],
      [
        { type: "text", text: title, font: "Alfa Slab One", heightIn: w * 0.2, maxWidthIn: w * 0.95, fill: ink, curve: 24, xIn: 0, yIn: w * 0.2 },
        { type: "text", text: tag, font: "Oswald", heightIn: w * 0.07, maxWidthIn: w * 0.75, fill: accent, charSpacing: 300, xIn: 0, yIn: w * 0.5 },
      ],
    ],
    Bold: [
      [
        { type: "text", text: stacked, font: "Anton", heightIn: w * 0.2, maxWidthIn: w * 0.9, fill: ink, xIn: 0, yIn: w * 0.32 },
        { type: "text", text: extra, font: "Bebas Neue", heightIn: w * 0.07, maxWidthIn: w * 0.8, fill: accent, charSpacing: 500, xIn: 0, yIn: w * 0.7 },
      ],
      [
        { type: "graphic", graphicId: gfx, widthIn: w * 0.34, fill: accent, xIn: 0, yIn: w * 0.2 },
        { type: "text", text: full, font: "Archivo Black", heightIn: w * 0.12, maxWidthIn: w * 0.95, fill: ink, xIn: 0, yIn: w * 0.5 },
      ],
    ],
    Retro: [
      [
        { type: "graphic", graphicId: "sun", widthIn: w * 0.5, fill: accent, xIn: 0, yIn: w * 0.25 },
        { type: "text", text: title, font: "Righteous", heightIn: w * 0.17, maxWidthIn: w * 0.95, fill: ink, stroke: req.garmentHex, strokeWidth: 12, xIn: 0, yIn: w * 0.42 },
        { type: "text", text: tag, font: "Righteous", heightIn: w * 0.06, maxWidthIn: w * 0.75, fill: second, charSpacing: 200, xIn: 0, yIn: w * 0.6 },
      ],
      [
        { type: "graphic", graphicId: gfx, widthIn: w * 0.22, fill: ink, xIn: 0, yIn: w * 0.1 },
        { type: "text", text: full, font: "Bungee", heightIn: w * 0.11, maxWidthIn: w * 0.95, fill: accent, curve: -22, xIn: 0, yIn: w * 0.36 },
      ],
    ],
    Script: [
      [
        { type: "text", text: titleCase(title), font: "Pacifico", heightIn: w * 0.2, maxWidthIn: w * 0.95, fill: ink, xIn: 0, yIn: w * 0.22 },
        { type: "text", text: tag, font: "Montserrat", heightIn: w * 0.055, maxWidthIn: w * 0.75, fill: accent, charSpacing: 400, xIn: 0, yIn: w * 0.46 },
      ],
      [
        { type: "text", text: titleCase(full), font: "Lobster", heightIn: w * 0.16, maxWidthIn: w * 0.95, fill: accent, curve: 20, xIn: 0, yIn: w * 0.24 },
        { type: "graphic", graphicId: gfx, widthIn: w * 0.15, fill: ink, xIn: 0, yIn: w * 0.5 },
      ],
    ],
  };

  // The chosen style first, then one from each of two others for range.
  const [s1, s2, s3] = [req.style, ...AI_STYLES.filter((s) => s !== req.style)] as [AiStyle, AiStyle, AiStyle];
  const picks: [AiStyle, ObjectSpec[]][] = [
    [s1, byStyle[s1][0]],
    [s1, byStyle[s1][1]],
    [s2, byStyle[s2][0]],
    [s3, byStyle[s3][0]],
  ];
  return picks.map(([style, objects], i) => ({ id: `${style}-${i}`, label: style, objects }));
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Composes layouts locally. Replace with the copilot service when it is connected. */
export const presetDesigner: AiDesigner = {
  async generate(req) {
    await new Promise((r) => setTimeout(r, 700));
    return layouts(req);
  },
};
