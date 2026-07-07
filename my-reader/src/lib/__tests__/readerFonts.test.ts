import { afterEach, describe, expect, it, vi } from "vitest"
import {
  coerceReaderFontFamily,
  createReaderFontInjectables,
  getReaderFontOptions,
  isChineseReaderLanguage,
  loadReaderFontFamily,
  normalizeReaderFontFamiliesByLanguage,
  readerFontLanguageKey,
  registerReaderFontFaces,
  resolveReaderFont,
} from "../readium/readerFonts"

describe("readerFonts", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("should detect Chinese language aliases when choosing font options", () => {
    expect(isChineseReaderLanguage("zh-Hans")).toBe(true)
    expect(isChineseReaderLanguage("zho")).toBe(true)
    expect(isChineseReaderLanguage("chi")).toBe(true)
    expect(getReaderFontOptions("zh-Hans").map((option) => option.key)).toEqual(
      [
        "default",
        "noto-sans-sc",
        "noto-serif-sc",
        "lxgw-wenkai-gb",
        "975-maru-sc",
      ],
    )
  })

  it("should normalize language keys to primary language", () => {
    expect(readerFontLanguageKey("zh_Hans")).toBe("zh")
    expect(readerFontLanguageKey("zho")).toBe("zh")
    expect(readerFontLanguageKey("chi")).toBe("zh")
    expect(readerFontLanguageKey("")).toBe("default")
  })

  it("should coerce legacy persisted font values to default", () => {
    expect(coerceReaderFontFamily("system")).toBe("default")
    expect(coerceReaderFontFamily("'Lora', 'Noto Serif SC', serif")).toBe(
      "default",
    )
  })

  it("should normalize language font family maps", () => {
    expect(
      normalizeReaderFontFamiliesByLanguage({
        "zh-Hans": "noto-serif-sc",
        en: "readium-modern",
        bad: "not-a-font",
      }),
    ).toEqual({
      zh: "noto-serif-sc",
      en: "readium-modern",
      bad: "default",
    })
  })

  it("should resolve exact language then primary language then global font", () => {
    expect(
      resolveReaderFont("zh-Hant", {
        fontFamily: "sans",
        fontFamiliesByLanguage: {
          zh: "noto-sans-sc",
          "zh-hant": "noto-serif-sc",
        },
      }),
    ).toBe("noto-serif-sc")
    expect(
      resolveReaderFont("zh-Hans", {
        fontFamily: "sans",
        fontFamiliesByLanguage: { zh: "noto-sans-sc" },
      }),
    ).toBe("noto-sans-sc")
  })

  it("should create appended Readium stylesheet injectables for content resources", () => {
    const injectables = createReaderFontInjectables()

    expect(injectables.allowedDomains).toEqual([])
    expect(injectables.rules[0]?.resources).toHaveLength(1)
    expect(injectables.rules[0]?.resources[0]).toEqual(expect.any(RegExp))
    expect((injectables.rules[0]?.resources[0] as RegExp).test("chapter")).toBe(
      true,
    )
    expect(injectables.rules[0]?.prepend).toBeUndefined()
    expect(injectables.rules[0]?.append?.[0]).toMatchObject({
      id: "myreader-reader-font-overrides",
      as: "link",
      rel: "stylesheet",
      target: "head",
      blob: expect.any(Blob),
    })
  })

  it("should register generated font faces into a content document", async () => {
    const doc = document.implementation.createHTMLDocument()
    doc.documentElement.style.setProperty(
      "--USER__fontFamily",
      "MyReaderNotoSerifSC",
    )

    const add = vi.fn()
    const load = vi.fn().mockResolvedValue([])
    const ready = Promise.resolve()
    Object.defineProperty(doc, "fonts", {
      configurable: true,
      value: { add, load, ready },
    })

    class MockFontFace {
      family: string
      source: string
      descriptors: FontFaceDescriptors
      status: FontFaceLoadStatus = "unloaded"
      load = vi.fn(async () => {
        this.status = "loaded"
        return this
      })

      constructor(
        family: string,
        source: string,
        descriptors: FontFaceDescriptors,
      ) {
        this.family = family
        this.source = source
        this.descriptors = descriptors
      }
    }

    vi.stubGlobal("FontFace", MockFontFace)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            version: 1,
            faces: [
              {
                family: "MyReaderNotoSerifSC",
                source:
                  'url("/reader-fonts/Generated/NotoSerifSC-Regular.ttf") format("truetype")',
                descriptors: {
                  style: "normal",
                  weight: "400",
                  display: "swap",
                },
              },
              {
                family: "MyReaderNotoSerifSC",
                source:
                  'url("/reader-fonts/Generated/NotoSerifSC-Subset.ttf") format("truetype")',
                descriptors: {
                  style: "normal",
                  weight: "400",
                  display: "swap",
                  unicodeRange: "U+4E00-9FFF",
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    )

    await registerReaderFontFaces(doc)
    const addedFaces = add.mock.calls.map(([face]) => face as MockFontFace)

    expect(fetch).toHaveBeenCalledWith(
      "/reader-fonts/Generated/reader-font-faces.json",
    )
    expect(addedFaces).toHaveLength(2)
    expect(
      addedFaces.every((face) => face.family === "MyReaderNotoSerifSC"),
    ).toBe(true)
    expect(addedFaces[0]?.load).not.toHaveBeenCalled()
    expect(addedFaces[1]?.load).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
  })

  it("should load every generated face when a registered family is requested later", async () => {
    const doc = document.implementation.createHTMLDocument()
    const add = vi.fn()
    const load = vi.fn().mockResolvedValue([])
    const ready = Promise.resolve()
    Object.defineProperty(doc, "fonts", {
      configurable: true,
      value: { add, load, ready },
    })

    class MockFontFace {
      family: string
      status: FontFaceLoadStatus = "unloaded"
      load = vi.fn(async () => {
        this.status = "loaded"
        return this
      })

      constructor(family: string) {
        this.family = family
      }
    }

    vi.stubGlobal("FontFace", MockFontFace)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            version: 1,
            faces: [
              {
                family: "MyReaderLXGWWenKaiGB",
                source:
                  'url("/reader-fonts/Generated/wenkai-a.woff2") format("woff2")',
              },
              {
                family: "MyReaderLXGWWenKaiGB",
                source:
                  'url("/reader-fonts/Generated/wenkai-b.woff2") format("woff2")',
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    )

    await registerReaderFontFaces(doc)
    const addedFaces = add.mock.calls.map(([face]) => face as MockFontFace)
    expect(addedFaces[0]?.load).not.toHaveBeenCalled()
    expect(addedFaces[1]?.load).not.toHaveBeenCalled()

    const registeredFamily = addedFaces[0]?.family ?? "MyReaderLXGWWenKaiGB"
    await loadReaderFontFamily(doc, registeredFamily)

    expect(addedFaces[0]?.load).toHaveBeenCalled()
    expect(addedFaces[1]?.load).toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
  })

  it("should preload only requested generated font families", async () => {
    vi.resetModules()
    const { preloadReaderFontFamilies } = await import("../readium/readerFonts")
    const doc = document.implementation.createHTMLDocument()
    const add = vi.fn()
    Object.defineProperty(doc, "fonts", {
      configurable: true,
      value: { add, ready: Promise.resolve() },
    })

    class MockFontFace {
      family: string
      status: FontFaceLoadStatus = "unloaded"
      load = vi.fn(async () => {
        this.status = "loaded"
        return this
      })

      constructor(family: string) {
        this.family = family
      }
    }

    vi.stubGlobal("FontFace", MockFontFace)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            version: 1,
            faces: [
              {
                family: "MyReaderNotoSansSC",
                source:
                  'url("/reader-fonts/Generated/NotoSansSC-Regular.ttf") format("truetype")',
              },
              {
                family: "MyReaderAlimamaFangYuanTi",
                source:
                  'url("/reader-fonts/Generated/AlimamaFangYuanTiVF.woff2") format("woff2")',
              },
              {
                family: "MyReaderLXGWWenKaiGB",
                source:
                  'url("/reader-fonts/Generated/wenkai-a.woff2") format("woff2")',
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    )

    await preloadReaderFontFamilies(doc, [
      "MyReaderNotoSansSC",
      "MyReaderAlimamaFangYuanTi",
    ])

    const addedFaces = add.mock.calls.map(([face]) => face as MockFontFace)
    expect(
      addedFaces.find((face) => face.family === "MyReaderNotoSansSC")?.load,
    ).toHaveBeenCalled()
    expect(
      addedFaces.find((face) => face.family === "MyReaderAlimamaFangYuanTi")
        ?.load,
    ).toHaveBeenCalled()
    expect(
      addedFaces.find((face) => face.family === "MyReaderLXGWWenKaiGB")?.load,
    ).not.toHaveBeenCalled()
  })
})
