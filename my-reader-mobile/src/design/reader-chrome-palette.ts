/**
 * Color mixing utilities for reader chrome.
 * Implements CSS `color-mix(in srgb, ink X%, bg)` in pure JS.
 */

/** Parse any hex or rgba string into {r, g, b, a}. */
function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  const hex = color.trim();
  const rgbaMatch = hex.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)$/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]!, 10),
      g: parseInt(rgbaMatch[2]!, 10),
      b: parseInt(rgbaMatch[3]!, 10),
      a: rgbaMatch[4] != null ? parseFloat(rgbaMatch[4]) : 1,
    };
  }
  let hexStr = hex.replace("#", "");
  if (hexStr.length === 3) {
    hexStr = hexStr[0]! + hexStr[0]! + hexStr[1]! + hexStr[1]! + hexStr[2]! + hexStr[2]!;
  }
  if (hexStr.length === 8) {
    return {
      r: parseInt(hexStr.slice(0, 2), 16),
      g: parseInt(hexStr.slice(2, 4), 16),
      b: parseInt(hexStr.slice(4, 6), 16),
      a: parseInt(hexStr.slice(6, 8), 16) / 255,
    };
  }
  return {
    r: parseInt(hexStr.slice(0, 2), 16),
    g: parseInt(hexStr.slice(2, 4), 16),
    b: parseInt(hexStr.slice(4, 6), 16),
    a: 1,
  };
}

export function mixInk(ink: string, bg: string, inkPercent: number): string {
  const i = parseColor(ink);
  const b = parseColor(bg);
  const p = inkPercent / 100;
  const r = Math.round(i.r * p + b.r * (1 - p));
  const g = Math.round(i.g * p + b.g * (1 - p));
  const bv = Math.round(i.b * p + b.b * (1 - p));
  const a = i.a * p + b.a * (1 - p);
  if (a >= 0.999) {
    return `rgb(${r}, ${g}, ${bv})`;
  }
  return `rgba(${r}, ${g}, ${bv}, ${a.toFixed(2)})`;
}

/** Mix accent at `opacity` over bg. Returns rgba string. */
function mixAccent(accent: string, bg: string, opacity: number): string {
  const a = parseColor(accent);
  const b = parseColor(bg);
  const p = opacity;
  const r = Math.round(a.r * p + b.r * (1 - p));
  const g = Math.round(a.g * p + b.g * (1 - p));
  const bv = Math.round(a.b * p + b.b * (1 - p));
  return `rgba(${r}, ${g}, ${bv}, ${opacity.toFixed(2)})`;
}

/**
 * Compute all chrome colors for a given reader theme.
 * Mirrors the design spec's `color-mix(in srgb, var(--reader-ink) X%, var(--reader-bg))` pattern.
 */
export function readerChromePalette(ink: string, bg: string, accent: string) {
  return {
    /** Button / pill background — ink 12% + bg */
    surface: mixInk(ink, bg, 12),
    /** Bottom sheet background — ink 4% + bg */
    sheetSurface: mixInk(ink, bg, 4),
    /** Handle bar — ink 20% + bg */
    handle: mixInk(ink, bg, 20),
    /** TOC row idle — ink 4% + bg */
    tocRowIdle: mixInk(ink, bg, 4),
    /** TOC row active — accent 12% over bg */
    tocRowActive: mixAccent(accent, bg, 0.12),
    /** Segment/card idle — ink 8% + bg */
    segmentIdle: mixInk(ink, bg, 8),
    /** Segment/card active — accent 12% over bg */
    segmentActive: mixAccent(accent, bg, 0.12),
    /** Action pill background — ink 10% + bg */
    actionSurface: mixInk(ink, bg, 10),
    /** Slider track — ink 12% + bg */
    sliderTrack: mixInk(ink, bg, 12),
    /** Stepper button bg — ink 10% + bg */
    stepperBtn: mixInk(ink, bg, 10),
    /** Border — ink 10% + bg */
    border: mixInk(ink, bg, 10),
    /** Primary text — ink color */
    text: ink,
    /** Muted text (chapter label, section labels) — ink 55% + bg */
    textMuted: mixInk(ink, bg, 55),
    /** Faint text (page label) — ink 40% + bg */
    textFaint: mixInk(ink, bg, 40),
    /** Accent color */
    accent,
    /** Accent text color (for active segments, active TOC rows) */
    accentText: accent,
    /** Touch feedback — ink 18% + bg (for TouchableHighlight underlay) */
    underlay: mixInk(ink, bg, 18),
  } as const;
}

export type ReaderChromePalette = ReturnType<typeof readerChromePalette>;