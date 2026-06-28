import { useRef } from "react"

import chroma from "chroma-js"
import { Image as ExpoImage } from "expo-image"

import type { BookItem } from "@/src/domain/types"
import type { CoverRawColors } from "@/src/domain/library/hooks/use-cover-palette"
import type { HomeCardStyle } from "@/src/store/app-store.types"
import { useThemePalette } from "@/src/design/tokens"
import { BlurView, BlurTargetView } from "expo-blur"
import { LinearGradient } from "expo-linear-gradient"
import { View } from "@/tw"
import { StyleSheet, type View as RNView } from "react-native"

/**
 * Tunable parameters for the cover-adaptive card background.
 *
 * Adjust these values to change how strongly the cover colors show through
 * and how the card looks in each color scheme.
 */
const COVER_BACKGROUND = {
  /** Blur effect applied to the ambient color gradient or cover image. */
  blur: {
    /** 1–100; higher = stronger blur. */
    intensity: { light: 80, dark: 95 },
    /** Android blur implementation. */
    method: "dimezisBlurViewSdk31Plus" as const,
    /** iOS/Android blur tint. */
    tint: { light: "light" as const, dark: "dark" as const },
  },

  /** Overlay scrim drawn on top of the blurred gradient for text readability. */
  overlay: {
    dark: {
      /** Start and end alpha for the dark mode scrim (black). */
      startAlpha: 0.18,
      endAlpha: 0.32,
    },
    light: {
      /** Start and end alpha for the light mode scrim (surface color). */
      startAlpha: 0.72,
      endAlpha: 0.84,
    },
  },

  /** Ambient gradient built from the extracted cover colors. */
  ambient: {
    /** Colors used while extraction is still in progress. */
    fallbackColors: ["#5D5D5D", "#7D7D7D", "#4D4D4D", "#6D6D6D"] as const,

    /** Direction of the gradient: 135° from top-left to bottom-right. */
    direction: {
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    } as const,

    /** Per-scheme chroma adjustments applied to each extracted cover color. */
    dark: {
      /** How much to increase saturation (0 = none). */
      saturate: 0.2,
      /** How much to darken the color (0 = none). */
      darken: 0.35,
    },
    light: {
      /** How much to increase saturation (0 = none). */
      saturate: 0.45,
      /** How much to brighten the color (0 = none). */
      brighten: 0.1,
    },
  },

  /** Direct blurred cover image style. */
  coverBlur: {
    /** Base opacity of the blurred cover image. */
    opacity: 0.85,
    /** Scale applied so the blurred image bleeds past the card edges. */
    scale: 1.2,
    /** Per-scheme overlay so the blurred cover stays readable. */
    overlay: {
      dark: {
        startAlpha: 0.35,
        endAlpha: 0.55,
      },
      light: {
        startAlpha: 0.45,
        endAlpha: 0.65,
      },
    },
  },
} as const

/**
 * Applies the per-scheme saturation/brightness adjustments to a single
 * extracted cover color.
 */
function adjustAmbientColor(
  color: string,
  colorScheme: "light" | "dark",
): string {
  if (colorScheme === "dark") {
    const { saturate, darken } = COVER_BACKGROUND.ambient.dark
    return chroma(color).saturate(saturate).darken(darken).css()
  }

  const { saturate, brighten } = COVER_BACKGROUND.ambient.light
  return chroma(color).saturate(saturate).brighten(brighten).css()
}

type CoverAdaptiveBackgroundProps = {
  coverUri: BookItem["coverUri"]
  rawColors?: CoverRawColors
  colorScheme?: "light" | "dark"
  borderRadius?: number
  variant?: HomeCardStyle
}

function buildAmbientGradientColors(
  raw: CoverRawColors | undefined,
  colorScheme: "light" | "dark",
): readonly [string, string, string, string] {
  const fallback = COVER_BACKGROUND.ambient.fallbackColors
  if (!raw) return fallback

  const colors = [raw.dominant, raw.vibrant, raw.muted, raw.darkVibrant]

  const resolved = colors.map((color, index) => {
    const source =
      color ??
      colors
        .slice(0, index)
        .reverse()
        .find((c) => c != null) ??
      fallback[index] ??
      "#808080"

    return adjustAmbientColor(source, colorScheme)
  })

  return resolved as unknown as readonly [string, string, string, string]
}

function overlayColorsForScheme(
  colorScheme: "light" | "dark",
  surface: string,
  variant: HomeCardStyle,
): readonly [string, string] {
  if (variant === "coverBlur") {
    if (colorScheme === "dark") {
      const { startAlpha, endAlpha } = COVER_BACKGROUND.coverBlur.overlay.dark
      return [`rgba(0, 0, 0, ${startAlpha})`, `rgba(0, 0, 0, ${endAlpha})`]
    }

    const { startAlpha, endAlpha } = COVER_BACKGROUND.coverBlur.overlay.light
    return [
      `${surface}${Math.round(startAlpha * 255)
        .toString(16)
        .padStart(2, "0")}`,
      `${surface}${Math.round(endAlpha * 255)
        .toString(16)
        .padStart(2, "0")}`,
    ]
  }

  if (colorScheme === "dark") {
    const { startAlpha, endAlpha } = COVER_BACKGROUND.overlay.dark
    return [`rgba(0, 0, 0, ${startAlpha})`, `rgba(0, 0, 0, ${endAlpha})`]
  }

  const { startAlpha, endAlpha } = COVER_BACKGROUND.overlay.light
  return [
    `${surface}${Math.round(startAlpha * 255)
      .toString(16)
      .padStart(2, "0")}`,
    `${surface}${Math.round(endAlpha * 255)
      .toString(16)
      .padStart(2, "0")}`,
  ]
}

/**
 * Cover-adaptive card background matching the prototype.
 *
 * Dark mode uses a dark overlay + white text; light mode uses a warm surface
 * scrim + dark text so the card stays readable against the light app surface.
 *
 * All tunable visual parameters are declared as `COVER_BACKGROUND` above.
 */
export function CoverAdaptiveBackground({
  coverUri,
  rawColors,
  colorScheme = "light",
  borderRadius = 0,
  variant = "adaptive",
}: CoverAdaptiveBackgroundProps) {
  const palette = useThemePalette()
  const blurTargetRef = useRef<RNView>(null)

  if (!coverUri) return null

  const ambientColors = buildAmbientGradientColors(rawColors, colorScheme)
  const overlayColors = overlayColorsForScheme(
    colorScheme,
    palette.surface,
    variant,
  )
  const { direction } = COVER_BACKGROUND.ambient
  const { blur, coverBlur } = COVER_BACKGROUND

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius,
          overflow: "hidden",
        },
      ]}
      pointerEvents="none"
    >
      <BlurTargetView
        ref={blurTargetRef}
        style={{
          position: "absolute",
          top: -40,
          left: -40,
          right: -40,
          bottom: -40,
        }}
      >
        {variant === "coverBlur" ? (
          <ExpoImage
            source={typeof coverUri === "string" ? { uri: coverUri } : coverUri}
            contentFit="cover"
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: coverBlur.opacity,
                transform: [{ scale: coverBlur.scale }],
              },
            ]}
          />
        ) : (
          <LinearGradient
            colors={ambientColors}
            start={direction.start}
            end={direction.end}
            style={StyleSheet.absoluteFill}
          />
        )}
      </BlurTargetView>

      <BlurView
        blurMethod={blur.method}
        blurTarget={blurTargetRef}
        intensity={blur.intensity[colorScheme]}
        tint={blur.tint[colorScheme]}
        style={StyleSheet.absoluteFill}
      />

      <LinearGradient
        colors={overlayColors}
        start={direction.start}
        end={direction.end}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}
