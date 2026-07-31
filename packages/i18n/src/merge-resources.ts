export type TranslationResource = {
  readonly [key: string]: string | TranslationResource
}

function isTranslationResource(value: unknown): value is TranslationResource {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function mergeTranslationResources<
  TShared extends TranslationResource,
  TPlatform extends TranslationResource,
>(shared: TShared, platform: TPlatform): TShared & TPlatform {
  const merged: Record<string, string | TranslationResource> = { ...shared }

  for (const [key, value] of Object.entries(platform)) {
    const sharedValue = merged[key]
    merged[key] =
      isTranslationResource(sharedValue) && isTranslationResource(value)
        ? mergeTranslationResources(sharedValue, value)
        : value
  }

  return merged as TShared & TPlatform
}
