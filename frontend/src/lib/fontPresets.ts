/**
 * Font pairings a brand can choose (heading + body). The families are loaded in
 * the root layout so they're available store-wide via CSS variables.
 */
export interface FontPairing {
  id: string;
  name: string;
  heading: string; // CSS font-family for headings
  body: string;    // CSS font-family for body text
}

export const FONT_PAIRINGS: FontPairing[] = [
  { id: "classic",   name: "Classic (Fraunces · DM Sans)",        heading: "'Fraunces', serif",           body: "'DM Sans', sans-serif" },
  { id: "modern",    name: "Modern (Poppins · Inter)",            heading: "'Poppins', sans-serif",       body: "'Inter', sans-serif" },
  { id: "elegant",   name: "Elegant (Playfair · Lato)",           heading: "'Playfair Display', serif",   body: "'Lato', sans-serif" },
  { id: "bold",      name: "Bold (Montserrat · Open Sans)",       heading: "'Montserrat', sans-serif",    body: "'Open Sans', sans-serif" },
  { id: "editorial", name: "Editorial (Libre Baskerville · Inter)", heading: "'Libre Baskerville', serif", body: "'Inter', sans-serif" },
];

/** Match stored font families back to a pairing id (for the picker). */
export function fontPairingId(heading?: string, body?: string): string {
  const m = FONT_PAIRINGS.find((p) => p.heading === heading && p.body === body);
  return m?.id ?? "custom";
}

/** Individual fonts — pick heading and body independently. */
export interface FontOption { label: string; value: string }

export const FONT_OPTIONS: FontOption[] = [
  { label: "Fraunces — serif", value: "'Fraunces', serif" },
  { label: "Playfair Display — serif", value: "'Playfair Display', serif" },
  { label: "Libre Baskerville — serif", value: "'Libre Baskerville', serif" },
  { label: "Poppins — sans", value: "'Poppins', sans-serif" },
  { label: "Montserrat — sans", value: "'Montserrat', sans-serif" },
  { label: "Inter — sans", value: "'Inter', sans-serif" },
  { label: "DM Sans — sans", value: "'DM Sans', sans-serif" },
  { label: "Lato — sans", value: "'Lato', sans-serif" },
  { label: "Open Sans — sans", value: "'Open Sans', sans-serif" },
];
