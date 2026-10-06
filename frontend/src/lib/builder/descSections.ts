/**
 * A long product description, cut into sections at its own headings.
 *
 * A description written with headings — Product Details, Features, Pressing
 * Instructions, Shipping & Returns — took half the page's height laid out in
 * full. Each heading becomes a section that opens and closes; whatever comes
 * before the first heading stays in view above them.
 *
 * Works on the markup as text, the same on the server as in the browser. The
 * markup is cleaned before it gets here.
 */

export interface DescSection {
  /** The heading's own words (markup inside it kept, tags around it gone). */
  title: string;
  /** Everything under it, up to the next heading of the same rank. */
  html: string;
}

export interface DescSplit {
  intro: string;
  sections: DescSection[];
}

const HEADING = /<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
/** A line that is nothing but bold words — how many descriptions mark a heading. */
const BOLD_LINE = /<p\b[^>]*>\s*<(strong|b)\b[^>]*>([^<]{2,80}?)<\/\1>\s*:?\s*(?:<br\s*\/?>\s*)?<\/p>/gi;

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
const blank = (markup: string) => !textOf(markup) && !/<(img|video|iframe|table)\b/i.test(markup);

/**
 * The description's sections, or null when it has fewer than two headings —
 * then there is nothing worth folding away and it is shown as written.
 */
export function splitDescription(markup: string): DescSplit | null {
  if (!markup) return null;
  // Boxes that only group things, and rules drawn between sections, are not
  // needed once each section has its own edge — and a heading inside a box
  // could not be cut out of it cleanly.
  const flat = markup
    .replace(/<\/?(div|section|article|header|footer|main)\b[^>]*>/gi, "")
    .replace(/<hr\b[^>]*>/gi, "");

  // The rank to cut at: the highest that is used at least twice. A title
  // heading used once stays above the sections; smaller headings stay inside them.
  const found = [...flat.matchAll(HEADING)];
  let marks: { at: number; end: number; title: string }[] = [];
  for (const rank of ["1", "2", "3", "4"]) {
    const same = found.filter((m) => m[1] === rank && textOf(m[2] ?? ""));
    if (same.length >= 2) {
      marks = same.map((m) => ({ at: m.index!, end: m.index! + m[0].length, title: (m[2] ?? "").trim() }));
      break;
    }
  }
  if (!marks.length) {
    const bold = [...flat.matchAll(BOLD_LINE)];
    if (bold.length >= 2) marks = bold.map((m) => ({ at: m.index!, end: m.index! + m[0].length, title: (m[2] ?? "").trim() }));
  }
  if (marks.length < 2) return null;

  const intro = flat.slice(0, marks[0]!.at).trim();
  const sections = marks.map((m, i) => ({
    title: m.title.replace(/<\/?(a|p|span|br)\b[^>]*>/gi, "").trim(),
    html: flat.slice(m.end, marks[i + 1]?.at ?? flat.length).trim(),
  }));
  return { intro: blank(intro) ? "" : intro, sections };
}
