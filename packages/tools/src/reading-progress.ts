function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function progressionToPercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(1, value)) * 100
}

export function locatorProgressionToPercent(
  locator: unknown,
): number | undefined {
  if (!isRecord(locator) || !isRecord(locator.locations)) return undefined
  return (
    progressionToPercent(locator.locations.totalProgression) ??
    progressionToPercent(locator.locations.progression)
  )
}

export function readingProgressToPercent(
  displayProgression: number | null | undefined,
  locator: unknown,
): number | undefined {
  return (
    progressionToPercent(displayProgression) ??
    locatorProgressionToPercent(locator)
  )
}
