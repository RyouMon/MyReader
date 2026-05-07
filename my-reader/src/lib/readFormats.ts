const FORMAT_PRIORITY = ["EPUB", "CBZ", "PDF"] as const

export function pickReadableFormat(formats: string[]): string | null {
  const upper = formats.map((f) => f.toUpperCase())
  for (const pref of FORMAT_PRIORITY) {
    if (upper.includes(pref)) return pref
  }
  return null
}

export function resolveReadFormat(
  formats: string[],
  requested: string | undefined,
): string | null {
  if (requested) {
    const u = requested.toUpperCase()
    if (formats.some((f) => f.toUpperCase() === u)) {
      if (pickReadableFormat([u]) === u) return u
    }
  }
  return pickReadableFormat(formats)
}

export function isReadableInAppFormat(format: string): boolean {
  return pickReadableFormat([format]) !== null
}
