import chroma from "chroma-js"

const MIN_CHROMA = 12

export function mixReaderChromeColor(
  ink: string,
  background: string,
  inkPercent: number,
): string {
  return chroma.mix(background, ink, inkPercent / 100, "rgb").hex()
}

export function readerChromeUnderlay(
  surface: string,
  background: string,
): string {
  return mixReaderChromeColor(surface, background, 12)
}

/** Derives accessible reader chrome colors from the reading foreground/background. */
export function readerChromePalette(ink: string, background: string) {
  const [backgroundTone, backgroundChroma, backgroundHue] =
    chroma(background).lch()
  const [inkTone, inkChroma, inkHue] = chroma(ink).lch()
  const isLight = backgroundTone > 50
  const hue = Number.isFinite(backgroundHue)
    ? backgroundHue
    : Number.isFinite(inkHue)
      ? inkHue
      : 0
  const chromaValue = Math.max(backgroundChroma, inkChroma, MIN_CHROMA)
  const toneHex = (tone: number) => chroma.lch(tone, chromaValue, hue).hex()

  const accent = chroma
    .lch(isLight ? 40 : 80, Math.max(chromaValue, 40), (hue + 30) % 360)
    .hex()

  let actionTone = backgroundTone
  for (let tone = backgroundTone + 1; tone <= 100; tone += 1) {
    if (chroma.contrast(background, toneHex(tone)) >= 3) {
      actionTone = tone
      break
    }
  }
  actionTone = Math.min(100, actionTone + 8)

  let progressTone = actionTone
  const progressStep = isLight ? -1 : 1
  for (
    let tone = actionTone + progressStep;
    isLight ? tone >= 0 : tone <= 100;
    tone += progressStep
  ) {
    const color = toneHex(tone)
    if (
      chroma.contrast(toneHex(actionTone), color) >= 3 &&
      chroma.contrast(background, color) >= 3
    ) {
      progressTone = tone
      break
    }
  }
  if (progressTone === actionTone) {
    progressTone = Math.min(100, Math.max(0, actionTone + progressStep * 12))
  }

  const actionSurface = toneHex(actionTone)
  let actionText = ink
  if (chroma.contrast(actionSurface, ink) < 4.5) {
    for (let tone = inkTone; tone >= 0; tone -= 1) {
      if (chroma.contrast(actionSurface, toneHex(tone)) >= 4.5) {
        actionText = toneHex(tone)
        break
      }
    }
  }

  return {
    bg: background,
    sheetSurface: mixReaderChromeColor(ink, background, 4),
    handle: mixReaderChromeColor(ink, background, 20),
    tocRowIdle: mixReaderChromeColor(ink, background, 4),
    tocRowActive: chroma.mix(background, accent, 0.12, "rgb").hex(),
    segmentIdle: mixReaderChromeColor(ink, background, 8),
    segmentActive: chroma.mix(background, accent, 0.12, "rgb").hex(),
    actionSurface,
    sliderTrack: mixReaderChromeColor(ink, background, 12),
    stepperBtn: mixReaderChromeColor(ink, background, 10),
    border: mixReaderChromeColor(ink, background, 10),
    text: ink,
    actionText,
    textMuted: mixReaderChromeColor(ink, background, 55),
    textFaint: mixReaderChromeColor(ink, background, 40),
    accent,
    accentText: accent,
    progressFill: toneHex(progressTone),
    progressText: actionSurface,
  } as const
}

export type ReaderChromePalette = ReturnType<typeof readerChromePalette>
