import type { IInjectablesConfig } from "@readium/navigator"

export {
  coerceReaderFontFamily,
  coerceReaderFontOption,
  getReaderFontOptions,
  isChineseReaderLanguage,
  normalizeReaderFontFamiliesByLanguage,
  normalizeReaderLanguage,
  primaryReaderLanguage,
  type ReaderFontFamilyKey,
  type ReaderFontOption,
  type ReaderFontSettings,
  readerFontLanguageKey,
  resolveReaderFont,
  resolveReaderLanguage,
  toReadiumFontFamily,
} from "@my-reader/fonts"

type ReaderFontFaceManifestEntry = {
  family: string
  source: string
  descriptors?: FontFaceDescriptors
}

type ReaderFontFaceManifest = {
  version: number
  faces: ReaderFontFaceManifestEntry[]
}

const READER_FONT_FACE_MANIFEST_URL =
  "/reader-fonts/Generated/reader-font-faces.json"
const MYREADER_FONT_FAMILY_PREFIX = "MyReader"

const READIUM_FONT_OVERRIDE_CSS = `
:root[style*="--USER__fontFamily"] body,
:root[style*="--USER__fontFamily"] body *:not(code):not(var):not(kbd):not(samp):not(pre) {
  font-family: var(--USER__fontFamily) !important;
}

:root[style*="--USER__fontFamily"] :is(code, var, kbd, samp, pre) {
  font-family: var(--RS__monospaceTf) !important;
}
`.trim()

const READIUM_THEME_OVERRIDE_CSS = `
:root {
  background-color: var(--USER__backgroundColor) !important;
  color: var(--USER__textColor) !important;
}

body {
  background-color: var(--USER__backgroundColor) !important;
  color: var(--USER__textColor) !important;
}

:root *:not(a) {
  background-color: transparent !important;
  color: inherit !important;
}
`.trim()

let readerFontFaceManifestPromise: Promise<ReaderFontFaceManifest> | null = null
const registeredReaderFontDocuments = new WeakMap<Document, Promise<void>>()
const readerFontFacesByDocument = new WeakMap<
  Document,
  Map<string, FontFace[]>
>()
let warnedReaderFontRegistrationFailure = false

function isReaderFontFaceManifest(
  value: unknown,
): value is ReaderFontFaceManifest {
  if (!value || typeof value !== "object") return false
  const manifest = value as Partial<ReaderFontFaceManifest>
  return (
    manifest.version === 1 &&
    Array.isArray(manifest.faces) &&
    manifest.faces.every(
      (face) =>
        face &&
        typeof face === "object" &&
        typeof face.family === "string" &&
        typeof face.source === "string",
    )
  )
}

async function loadReaderFontFaceManifest() {
  readerFontFaceManifestPromise ??= fetch(READER_FONT_FACE_MANIFEST_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to load reader font manifest: ${response.status}`,
        )
      }
      return response.json() as Promise<unknown>
    })
    .then((value) => {
      if (!isReaderFontFaceManifest(value)) {
        throw new Error("Invalid reader font manifest")
      }
      return value
    })
    .catch((error: unknown) => {
      readerFontFaceManifestPromise = null
      throw error
    })
  return readerFontFaceManifestPromise
}

function normalizeCssFontFamily(fontFamily: string) {
  return fontFamily.trim().replace(/^["']|["']$/g, "")
}

function warnReaderFontRegistrationFailure(error: unknown) {
  if (warnedReaderFontRegistrationFailure) return
  warnedReaderFontRegistrationFailure = true
  console.warn("Failed to register reader fonts.", error)
}

function absoluteReaderFontFaceSource(source: string) {
  return source.replace(
    /url\((["']?)(\/[^"')]+)\1\)/g,
    (_match, _quote, url) =>
      `url("${new URL(url, window.location.origin).toString()}")`,
  )
}

async function doRegisterReaderFontFaces(doc: Document) {
  if (!doc.fonts || typeof globalThis.FontFace !== "function") return

  const manifest = await loadReaderFontFaceManifest()
  const facesByFamily = new Map<string, FontFace[]>()
  for (const face of manifest.faces) {
    const fontFace = new globalThis.FontFace(
      face.family,
      absoluteReaderFontFaceSource(face.source),
      face.descriptors ?? {},
    )
    doc.fonts.add(fontFace)
    const familyFaces = facesByFamily.get(face.family) ?? []
    familyFaces.push(fontFace)
    facesByFamily.set(face.family, familyFaces)
  }
  readerFontFacesByDocument.set(doc, facesByFamily)
}

export function registerReaderFontFaces(doc: Document) {
  const existing = registeredReaderFontDocuments.get(doc)
  if (existing) return existing

  const promise = doRegisterReaderFontFaces(doc).catch((error: unknown) => {
    registeredReaderFontDocuments.delete(doc)
    warnReaderFontRegistrationFailure(error)
  })
  registeredReaderFontDocuments.set(doc, promise)
  return promise
}

async function loadRegisteredReaderFontFamily(
  doc: Document,
  fontFamily: string | null | undefined,
) {
  const activeFamily = normalizeCssFontFamily(fontFamily ?? "")
  if (!doc.fonts || !activeFamily.startsWith(MYREADER_FONT_FAMILY_PREFIX)) {
    return
  }

  const faces = readerFontFacesByDocument.get(doc)?.get(activeFamily)
  if (faces?.length) {
    await Promise.all(
      faces.map((face) => (face.status === "loaded" ? face : face.load())),
    )
  } else {
    await doc.fonts.load(`1em ${activeFamily}`, "用户体验阅读")
  }
  await doc.fonts.ready
}

export async function loadReaderFontFamily(
  doc: Document,
  fontFamily: string | null | undefined,
) {
  await registerReaderFontFaces(doc)
  await loadRegisteredReaderFontFamily(doc, fontFamily)
}

export async function preloadReaderFontFamilies(
  doc: Document,
  fontFamilies: readonly string[],
) {
  await registerReaderFontFaces(doc)
  await Promise.all(
    fontFamilies.map(async (fontFamily) => {
      try {
        await loadRegisteredReaderFontFamily(doc, fontFamily)
      } catch (error: unknown) {
        console.warn("Failed to preload reader font.", error)
      }
    }),
  )
}

export function createReaderFontInjectables(): IInjectablesConfig {
  return {
    allowedDomains: [],
    rules: [
      {
        resources: [/.*/],
        append: [
          {
            id: "myreader-reader-theme-overrides",
            as: "link",
            rel: "stylesheet",
            target: "head",
            blob: new Blob([READIUM_THEME_OVERRIDE_CSS], {
              type: "text/css",
            }),
          },
          {
            id: "myreader-reader-font-overrides",
            as: "link",
            rel: "stylesheet",
            target: "head",
            blob: new Blob([READIUM_FONT_OVERRIDE_CSS], {
              type: "text/css",
            }),
          },
        ],
      },
    ],
  }
}
