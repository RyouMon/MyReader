import catalogJson from "./reader-font-catalog.json"

export type ReaderFontPlatform = "desktop" | "mobile"

export type ReaderFontFamilyKey =
  | "default"
  | "serif"
  | "sans"
  | "monospace"
  | "readium-old-style"
  | "readium-modern"
  | "readium-humanist"
  | "open-dyslexic"
  | "accessible-dfa"
  | "ia-writer-duospace"
  | "noto-sans-sc"
  | "noto-serif-sc"
  | "lxgw-wenkai-gb"
  | "lxgw-wenkai"
  | "975-maru-sc"

export type ReaderFontOption = {
  key: ReaderFontFamilyKey
  labelKey: string
}

export type ReaderFontSettings = {
  fontFamily: ReaderFontFamilyKey
  fontFamiliesByLanguage?: Record<string, ReaderFontFamilyKey>
}

export type ReaderFontFaceDeclaration = {
  source: string
  preload?: boolean
  style?: "normal" | "italic"
  weight?: number
}

export type ReaderFontFamilyDeclaration = {
  fontFamily: string
  alternates?: string[]
  fontFaces?: ReaderFontFaceDeclaration[]
}

type ReaderFontFaceCatalogEntry = {
  packageName: string
  source: string
  target: string
  format?: string
  style?: "normal" | "italic"
  weight?: number | string
  preload?: boolean
}

type ReaderFontCatalogEntry = {
  key: ReaderFontFamilyKey
  labelKey: string
  languageLabelKeys?: Record<string, string>
  languages: string[]
  platforms: ReaderFontPlatform[]
  readiumFamilies?: Partial<Record<ReaderFontPlatform, string>>
  fallbacks?: string[]
  fontFaces?: Partial<Record<ReaderFontPlatform, ReaderFontFaceCatalogEntry[]>>
}

type ReaderFontCatalogData = {
  families: ReaderFontCatalogEntry[]
  legacyKeyMap: Record<string, ReaderFontFamilyKey>
  platformFallbacks: Record<
    ReaderFontPlatform,
    Partial<Record<ReaderFontFamilyKey, ReaderFontFamilyKey>>
  >
}

const catalog = catalogJson as ReaderFontCatalogData

export const READER_FONT_FAMILIES = catalog.families
export const READER_FONT_FAMILY_KEYS = READER_FONT_FAMILIES.map(
  (font) => font.key,
) as ReaderFontFamilyKey[]

const READER_FONT_FAMILY_KEY_SET = new Set<string>(READER_FONT_FAMILY_KEYS)
const READER_FONT_FAMILY_BY_KEY = Object.fromEntries(
  READER_FONT_FAMILIES.map((font) => [font.key, font]),
) as Record<ReaderFontFamilyKey, ReaderFontCatalogEntry>

export function normalizeReaderLanguage(language: string | null | undefined) {
  return (language ?? "").trim().replace(/_/g, "-").toLowerCase()
}

export function primaryReaderLanguage(language: string | null | undefined) {
  return normalizeReaderLanguage(language).split("-")[0] ?? ""
}

function canonicalReaderLanguage(language: string | null | undefined) {
  const primary = primaryReaderLanguage(language)
  if (primary === "zho" || primary === "chi") return "zh"
  return primary
}

export function readerFontLanguageKey(language: string | null | undefined) {
  return canonicalReaderLanguage(language) || "default"
}

export function isChineseReaderLanguage(language: string | null | undefined) {
  return canonicalReaderLanguage(language) === "zh"
}

export function resolveReaderLanguage(
  publicationLanguages: readonly string[] | null | undefined,
  fallbackLanguages?: readonly string[] | null | undefined,
) {
  return (
    publicationLanguages?.find((lang) => normalizeReaderLanguage(lang)) ??
    fallbackLanguages?.find((lang) => normalizeReaderLanguage(lang)) ??
    ""
  )
}

function readerFontSupportsPlatform(
  fontFamily: ReaderFontFamilyKey,
  platform: ReaderFontPlatform,
) {
  return READER_FONT_FAMILY_BY_KEY[fontFamily]?.platforms.includes(platform)
}

function coerceKnownReaderFontFamily(fontFamily: string): ReaderFontFamilyKey {
  const legacy = catalog.legacyKeyMap[fontFamily]
  if (legacy) return legacy
  if (READER_FONT_FAMILY_KEY_SET.has(fontFamily)) {
    return fontFamily as ReaderFontFamilyKey
  }
  return "default"
}

export function coerceReaderFontFamily(
  fontFamily: unknown,
  platform?: ReaderFontPlatform,
): ReaderFontFamilyKey {
  if (typeof fontFamily !== "string") return "default"
  const known = coerceKnownReaderFontFamily(fontFamily)
  if (!platform || readerFontSupportsPlatform(known, platform)) return known
  return catalog.platformFallbacks[platform]?.[known] ?? "default"
}

export function normalizeReaderFontFamiliesByLanguage(
  value: unknown,
  platform?: ReaderFontPlatform,
): Record<string, ReaderFontFamilyKey> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  const out: Record<string, ReaderFontFamilyKey> = {}
  for (const [language, fontFamily] of Object.entries(value)) {
    const key = readerFontLanguageKey(language)
    if (!key) continue
    out[key] = coerceReaderFontFamily(fontFamily, platform)
  }
  return out
}

export function resolveReaderFont(
  language: string | null | undefined,
  settings: ReaderFontSettings,
  platform?: ReaderFontPlatform,
) {
  const exactLanguage = normalizeReaderLanguage(language)
  const primaryLanguage = readerFontLanguageKey(language)
  return coerceReaderFontFamily(
    (exactLanguage && settings.fontFamiliesByLanguage?.[exactLanguage]) ||
      (primaryLanguage && settings.fontFamiliesByLanguage?.[primaryLanguage]) ||
      settings.fontFamily,
    platform,
  )
}

function fontSupportsReaderLanguage(
  font: ReaderFontCatalogEntry,
  language: string | null | undefined,
) {
  if (font.languages.includes("*")) return true
  const languageKey = readerFontLanguageKey(language)
  if (languageKey === "zh") return font.languages.includes("zh")
  return font.languages.includes("latin")
}

export function getReaderFontOptions(
  language: string | null | undefined,
  platform: ReaderFontPlatform = "desktop",
) {
  const languageKey = readerFontLanguageKey(language)
  return READER_FONT_FAMILIES.filter(
    (font) =>
      font.platforms.includes(platform) &&
      fontSupportsReaderLanguage(font, language),
  ).map((font) => ({
    key: font.key,
    labelKey: font.languageLabelKeys?.[languageKey] ?? font.labelKey,
  }))
}

export function coerceReaderFontOption(
  fontFamily: ReaderFontFamilyKey,
  options: readonly ReaderFontOption[],
) {
  return options.some((option) => option.key === fontFamily)
    ? fontFamily
    : (options[0]?.key ?? "default")
}

export function toReadiumFontFamily(
  fontFamily: ReaderFontFamilyKey,
  platform: ReaderFontPlatform = "desktop",
) {
  const key = coerceReaderFontFamily(fontFamily, platform)
  return READER_FONT_FAMILY_BY_KEY[key]?.readiumFamilies?.[platform]
}

function nativeFontFaceWeight(weight: number | string | undefined) {
  if (typeof weight === "number") return weight
  if (typeof weight === "string" && /^\d+$/.test(weight)) return Number(weight)
  return undefined
}

export function getReaderFontFamilyDeclarations(
  platform: ReaderFontPlatform = "mobile",
): ReaderFontFamilyDeclaration[] {
  return READER_FONT_FAMILIES.flatMap((font) => {
    const fontFamily = font.readiumFamilies?.[platform]
    const faces = font.fontFaces?.[platform]
    if (!fontFamily || !faces?.length) return []
    return [
      {
        fontFamily,
        alternates: font.fallbacks,
        fontFaces: faces.map((face) => ({
          source: `reader-fonts/${face.target}`,
          preload: face.preload,
          style: face.style,
          weight: nativeFontFaceWeight(face.weight),
        })),
      },
    ]
  })
}
