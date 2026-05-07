import { Locator } from "@readium/shared"

export function parseSavedLocator(data: unknown): Locator | null {
  if (data == null || typeof data !== "object") return null
  return Locator.deserialize(data) ?? null
}

export function locatorToJson(locator: Locator): Record<string, unknown> {
  return locator.serialize() as Record<string, unknown>
}
