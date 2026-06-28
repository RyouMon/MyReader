import { useEffect, useMemo, useState } from "react"

import {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
  type Theme,
} from "@material/material-color-utilities"
import { getColors, type ImageColorsResult } from "react-native-image-colors"

import type { BookItem } from "@/src/domain/types"

type ImageColorsInput = NonNullable<BookItem["coverUri"]>

export type CoverMaterialPalette = {
  primary: string
  secondary: string
  tertiary: string
  surface: string
  surfaceVariant: string
}

export type CoverRawColors = {
  dominant?: string
  vibrant?: string
  muted?: string
  darkVibrant?: string
  lightVibrant?: string
  darkMuted?: string
  lightMuted?: string
}

export type CoverPalette = {
  raw: CoverRawColors
  material: {
    light: CoverMaterialPalette
    dark: CoverMaterialPalette
  }
}

type InFlightRequest = Promise<CoverPalette | undefined>

const resultCache = new Map<string, CoverPalette>()
const inFlight = new Map<string, InFlightRequest>()

type AndroidImageColors = {
  dominant?: string
  average?: string
  vibrant?: string
  darkVibrant?: string
  lightVibrant?: string
  darkMuted?: string
  lightMuted?: string
  muted?: string
  platform: "android"
}

type IOSImageColors = {
  background: string
  primary: string
  secondary: string
  detail: string
  quality: "lowest" | "low" | "high" | "highest"
  platform: "ios"
}

type WebImageColors = {
  dominant?: string
  vibrant?: string
  darkVibrant?: string
  lightVibrant?: string
  darkMuted?: string
  lightMuted?: string
  muted?: string
  platform: "web"
}

type NormalizedImageColors =
  | AndroidImageColors
  | IOSImageColors
  | WebImageColors

function normalizeImageColors(result: ImageColorsResult): CoverRawColors {
  const normalized = result as unknown as NormalizedImageColors

  if (normalized.platform === "ios") {
    return {
      dominant: normalized.background,
      vibrant: normalized.primary,
      muted: normalized.secondary,
      darkVibrant: normalized.detail,
    }
  }

  return {
    dominant: normalized.dominant,
    vibrant: normalized.vibrant,
    muted: normalized.muted,
    darkVibrant: normalized.darkVibrant,
    lightVibrant: normalized.lightVibrant,
    darkMuted: normalized.darkMuted,
    lightMuted: normalized.lightMuted,
  }
}

function buildMaterialPalette(
  dominantColor: string,
  scheme: "light" | "dark",
): CoverMaterialPalette {
  const source = argbFromHex(dominantColor)
  const theme: Theme = themeFromSourceColor(source)
  const selected = theme.schemes[scheme]

  return {
    primary: hexFromArgb(selected.primary),
    secondary: hexFromArgb(selected.secondary),
    tertiary: hexFromArgb(selected.tertiary),
    surface: hexFromArgb(selected.surface),
    surfaceVariant: hexFromArgb(selected.surfaceVariant),
  }
}

function extractKey(input: ImageColorsInput): string {
  return typeof input === "string" ? input : input.uri
}

function extractUriAndHeaders(input: ImageColorsInput): {
  uri: string
  headers?: Record<string, string>
} {
  if (typeof input === "string") {
    return { uri: input }
  }

  return { uri: input.uri, headers: input.headers }
}

async function fetchCoverPalette(
  input: ImageColorsInput,
): Promise<CoverPalette | undefined> {
  const key = extractKey(input)
  const cached = resultCache.get(key)
  if (cached) return cached

  const existing = inFlight.get(key)
  if (existing) return existing

  const { uri, headers } = extractUriAndHeaders(input)

  const request = getColors(uri, {
    fallback: "#5D5D5D",
    cache: true,
    key,
    headers,
  })
    .then((result) => {
      const raw = normalizeImageColors(result)
      const dominant = raw.dominant ?? raw.vibrant ?? raw.muted
      if (!dominant) {
        return undefined
      }

      const palette: CoverPalette = {
        raw,
        material: {
          light: buildMaterialPalette(dominant, "light"),
          dark: buildMaterialPalette(dominant, "dark"),
        },
      }

      resultCache.set(key, palette)
      return palette
    })
    .catch(() => undefined)
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, request)
  return request
}

/**
 * Extracts a tonal palette from a book cover image.
 *
 * Uses `react-native-image-colors` for platform-native color extraction and
 * `@material/material-color-utilities` to expand the dominant color into a
 * complete Material palette. Requests are deduplicated and results are cached
 * in memory for the app session.
 */
export function useCoverPalette(
  coverUri: BookItem["coverUri"],
  colorScheme: "light" | "dark",
): {
  material: CoverMaterialPalette | undefined
  raw: CoverRawColors | undefined
} {
  const [palette, setPalette] = useState<CoverPalette | undefined>()

  const schemePalette = useMemo(() => {
    if (!palette) return undefined
    return colorScheme === "dark"
      ? palette.material.dark
      : palette.material.light
  }, [palette, colorScheme])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!coverUri) {
        setPalette(undefined)
        return
      }

      const result = await fetchCoverPalette(coverUri)
      if (cancelled) return
      setPalette(result)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [coverUri])

  return { material: schemePalette, raw: palette?.raw }
}
