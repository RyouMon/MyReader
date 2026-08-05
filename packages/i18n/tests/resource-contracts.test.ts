import { readFileSync } from "node:fs"
import path from "node:path"
import { READER_THEME_PRESETS } from "@my-reader/tools/reader-themes"
import { describe, expect, it } from "vitest"
import { desktopResources } from "../src/desktop"
import { desktopEn } from "../src/locales/desktop/en"
import { desktopZhCN } from "../src/locales/desktop/zh-CN"
import mobileEn from "../src/locales/mobile/en.json"
import mobileZhCN from "../src/locales/mobile/zh-CN.json"
import { sharedEn } from "../src/locales/shared/en"
import { sharedZhCN } from "../src/locales/shared/zh-CN"
import type { TranslationResource } from "../src/merge-resources"
import { mobileResources } from "../src/mobile"

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/
const INTERPOLATION = /\{\{\s*([^},\s]+)[^}]*\}\}/g
const INTENTIONAL_PLATFORM_VARIANTS = [
  "bookDetail.downloadFailed",
  "bookDetail.expand",
  "bookDetail.loadFailed",
  "bookDetail.pubDate",
  "bookDetail.series",
  "bookRow.finished",
  "common.confirm",
  "library.importingBook",
  "library.searchPlaceholder",
  "library.title",
  "reader.column",
  "reader.fontOptions.defaultChinese",
  "reader.fontOptions.humanist",
  "reader.fontOptions.modern",
  "reader.fontOptions.oldStyle",
  "reader.fontSize",
  "reader.lineHeight",
  "reader.loadFailed",
  "reader.margin",
  "reader.pageDirection",
  "reader.positionConflictDescription",
  "reader.positionConflictTitle",
  "reader.readingMode",
  "reader.readingProgression",
  "reader.settings",
  "reader.themes.contrast1",
  "reader.themes.contrast2",
  "reader.toc",
] as const

function flatten(
  resource: TranslationResource,
  prefix = "",
  flattened = new Map<string, string>(),
): Map<string, string> {
  for (const [key, value] of Object.entries(resource)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") {
      flattened.set(path, value)
    } else {
      flatten(value, path, flattened)
    }
  }
  return flattened
}

function normalizedKeys(resource: TranslationResource): string[] {
  return [...flatten(resource).keys()]
    .map((key) => key.replace(PLURAL_SUFFIX, ""))
    .filter((key, index, keys) => keys.indexOf(key) === index)
    .sort()
}

function interpolationNames(value: string): string[] {
  return [...value.matchAll(INTERPOLATION)].map((match) => match[1]).sort()
}

function expectLocaleContract(
  reference: TranslationResource,
  translation: TranslationResource,
): void {
  expect(normalizedKeys(translation)).toEqual(normalizedKeys(reference))

  const referenceValues = flatten(reference)
  const translationValues = flatten(translation)
  for (const [key, referenceValue] of referenceValues) {
    const translationValue = translationValues.get(key)
    if (translationValue !== undefined) {
      expect(interpolationNames(translationValue), key).toEqual(
        interpolationNames(referenceValue),
      )
    }
  }
}

function expectNoSharedOverrides(
  shared: TranslationResource,
  platform: TranslationResource,
): void {
  const sharedKeys = new Set(flatten(shared).keys())
  const overrides = [...flatten(platform).keys()].filter((key) =>
    sharedKeys.has(key),
  )
  expect(overrides).toEqual([])
}

function expectTranslationKeys(
  resource: TranslationResource,
  keys: Iterable<string>,
): void {
  const resourceKeys = new Set(flatten(resource).keys())
  for (const key of keys) {
    expect(resourceKeys.has(key), key).toBe(true)
  }
}

describe("i18n resource contracts", () => {
  it("should keep shared locale keys and interpolation parameters aligned when copy changes", () => {
    expectLocaleContract(sharedEn, sharedZhCN)
  })

  it("should keep desktop locale keys and interpolation parameters aligned when copy changes", () => {
    expectLocaleContract(desktopEn.translation, desktopZhCN.translation)
  })

  it("should keep mobile locale keys and interpolation parameters aligned when copy changes", () => {
    expectLocaleContract(mobileEn, mobileZhCN)
  })

  it("should reject desktop overrides when a key belongs to shared copy", () => {
    expectNoSharedOverrides(sharedEn, desktopEn.translation)
    expectNoSharedOverrides(sharedZhCN, desktopZhCN.translation)
  })

  it("should reject mobile overrides when a key belongs to shared copy", () => {
    expectNoSharedOverrides(sharedEn, mobileEn)
    expectNoSharedOverrides(sharedZhCN, mobileZhCN)
  })

  it("should require an explicit decision when a new key overlaps between platform resources", () => {
    const mobileKeys = new Set(flatten(mobileEn).keys())
    const overlappingKeys = [...flatten(desktopEn.translation).keys()]
      .filter((key) => mobileKeys.has(key))
      .sort()

    expect(overlappingKeys).toEqual(INTENTIONAL_PLATFORM_VARIANTS)
  })

  it("should expose the same supported locale identifiers for both apps", () => {
    expect(Object.keys(desktopResources)).toEqual(["zh-CN", "en"])
    expect(Object.keys(mobileResources)).toEqual(["zh-CN", "en"])
  })

  it("should keep generic remote browser namespaces structurally compatible when providers share one screen", () => {
    expectLocaleContract(mobileEn.webdav.browser, mobileEn.onedrive.browser)
    expectLocaleContract(mobileZhCN.webdav.browser, mobileZhCN.onedrive.browser)
  })

  it("should provide every reader theme label when shared presets drive both apps", () => {
    const themeKeys = READER_THEME_PRESETS.map(
      (theme) => `reader.themes.${theme.labelKey}`,
    )
    expectTranslationKeys(desktopResources.en.translation, themeKeys)
    expectTranslationKeys(mobileResources.en.translation, themeKeys)
  })

  it("should provide every reader font label when the shared font catalog drives an app", () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "../../..")
    const fontCatalog = JSON.parse(
      readFileSync(
        path.join(
          repositoryRoot,
          "packages/fonts/src/reader-font-catalog.json",
        ),
        "utf8",
      ),
    ) as {
      families: Array<{
        labelKey: string
        languageLabelKeys?: Record<string, string>
        platforms: Array<"desktop" | "mobile">
      }>
    }

    for (const [platform, resource] of [
      ["desktop", desktopResources.en.translation],
      ["mobile", mobileResources.en.translation],
    ] as const) {
      const labelKeys = fontCatalog.families
        .filter((font) => font.platforms.includes(platform))
        .flatMap((font) => [
          font.labelKey,
          ...Object.values(font.languageLabelKeys ?? {}),
        ])
      expectTranslationKeys(resource, labelKeys)
    }
  })

  it("should keep workspace manifests wired to the shared package when apps consume resources", () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "../../..")
    for (const manifestPath of [
      "my-reader/package.json",
      "my-reader-mobile/package.json",
    ]) {
      const manifest = JSON.parse(
        readFileSync(path.join(repositoryRoot, manifestPath), "utf8"),
      ) as { dependencies?: Record<string, string> }
      expect(manifest.dependencies?.["@my-reader/i18n"]).toBe("workspace:*")
    }
  })
})
