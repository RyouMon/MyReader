import { argbFromHex, Hct, hexFromArgb, TonalPalette } from "@material/material-color-utilities";
import chroma from "chroma-js";

/** Minimum chroma for tonal palette to avoid grayish results. */
const MIN_CHROMA = 12;

/** Compute underlay (press feedback) color for a given surface. */
export function underlayFromSurface(surface: string, bg: string): string {
  return mixInk(surface, bg, 12);
}

/** Mix ink into bg at given percentage (0–100). Returns hex string. */
export function mixInk(ink: string, bg: string, inkPercent: number): string {
  return chroma.mix(bg, ink, inkPercent / 100, "rgb").hex();
}

/**
 * Compute all chrome colors for a given reader theme.
 * Uses HCT tonal palette from bg hue + boosted chroma to generate
 * hue-preserving, accessible color variants automatically.
 * Accent is derived from the bg hue (shifted +30°) for a complementary feel.
 */
export function readerChromePalette(ink: string, bg: string) {
  const bgHct = Hct.fromInt(argbFromHex(bg));
  const inkHct = Hct.fromInt(argbFromHex(ink));
  const isLight = bgHct.tone > 50;

  // Tonal palette: bg hue + max(bg, ink) chroma, floored at MIN_CHROMA
  const chromaValue = Math.max(bgHct.chroma, inkHct.chroma, MIN_CHROMA);
  const palette = TonalPalette.fromHueAndChroma(bgHct.hue, chromaValue);

  // Accent: bg hue shifted +30°, high chroma, tone for ≥4.5:1 contrast against bg
  const accentHue = (bgHct.hue + 30) % 360;
  const accentPalette = TonalPalette.fromHueAndChroma(accentHue, Math.max(chromaValue, 40));
  const accentTone = isLight ? 40 : 80;
  const accent = hexFromArgb(accentPalette.tone(accentTone));

  // Helper: get hex for a tone
  const toneHex = (t: number) => hexFromArgb(palette.tone(t));

  // actionSurface: step toward brighter until ≥3:1 contrast against bg
  let actionTone = bgHct.tone;
  for (let t = bgHct.tone + 1; t <= 100; t += 1) {
    if (chroma.contrast(bg, toneHex(t)) >= 3) { actionTone = t; break; }
  }
  actionTone = Math.min(100, actionTone + 8);

  // progressFill: must contrast against both actionSurface and bg
  // For light bg: progressFill darker than actionSurface (step toward dark)
  // For dark bg: progressFill brighter than actionSurface (step toward bright)
  let progressTone = actionTone;
  const progressStep = isLight ? -1 : 1;
  for (let t = actionTone + progressStep; isLight ? t >= 0 : t <= 100; t += progressStep) {
    const c = toneHex(t);
    if (chroma.contrast(toneHex(actionTone), c) >= 3 && chroma.contrast(bg, c) >= 3) { progressTone = t; break; }
  }
  if (progressTone === actionTone) {
    progressTone = Math.min(100, Math.max(0, actionTone + progressStep * 12));
  }

  const actionSurface = toneHex(actionTone);

  // actionText: text on actionSurface — must have ≥4.5:1 contrast against actionSurface
  let actionText = ink;
  if (chroma.contrast(actionSurface, ink) < 4.5) {
    for (let t = inkHct.tone; t >= 0; t -= 1) {
      if (chroma.contrast(actionSurface, toneHex(t)) >= 4.5) { actionText = toneHex(t); break; }
    }
  }

  const progressFill = toneHex(progressTone);

  return {
    /** Reading background color */
    bg,
    /** Bottom sheet background — ink 4% + bg */
    sheetSurface: mixInk(ink, bg, 4),
    /** Handle bar — ink 20% + bg */
    handle: mixInk(ink, bg, 20),
    /** TOC row idle — ink 4% + bg */
    tocRowIdle: mixInk(ink, bg, 4),
    /** TOC row active — accent 12% over bg */
    tocRowActive: chroma.mix(bg, accent, 0.12, "rgb").hex(),
    /** Segment/card idle — ink 8% + bg */
    segmentIdle: mixInk(ink, bg, 8),
    /** Segment/card active — accent 12% over bg */
    segmentActive: chroma.mix(bg, accent, 0.12, "rgb").hex(),
    /** Action pill background — HCT tonal palette */
    actionSurface,
    /** Slider track — ink 12% + bg */
    sliderTrack: mixInk(ink, bg, 12),
    /** Stepper button bg — ink 10% + bg */
    stepperBtn: mixInk(ink, bg, 10),
    /** Border — ink 10% + bg */
    border: mixInk(ink, bg, 10),
    /** Primary text — ink color */
    text: ink,
    /** Text on action surfaces (buttons, pills) — ink or darker for ≥4.5:1 contrast */
    actionText,
    /** Muted text (chapter label, section labels) — ink 55% + bg */
    textMuted: mixInk(ink, bg, 55),
    /** Faint text (page label) — ink 40% + bg */
    textFaint: mixInk(ink, bg, 40),
    /** Accent color */
    accent,
    /** Accent text color (for active segments, active TOC rows) */
    accentText: accent,
    /** TOC progress fill — HCT tonal palette */
    progressFill,
    /** Text on progressFill — uses actionSurface for contrast */
    progressText: actionSurface,
  } as const;
}

export type ReaderChromePalette = ReturnType<typeof readerChromePalette>;
