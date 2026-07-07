import { READER_THEME_PRESETS } from "@my-reader/tools/reader-themes"
import { EpubNavigator } from "@readium/navigator"
import {
  Layout,
  type Links,
  Locator,
  LocatorLocations,
  type Publication,
} from "@readium/shared"
import { isTauri } from "@tauri-apps/api/core"
import {
  AlignJustify,
  AlignLeft,
  BookOpen,
  Columns2,
  PanelLeftRightDashed,
  ScrollText,
  Settings,
  Square,
  TextInitial,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ReadiumTocPanel,
  type ReadiumTocRow,
} from "@/components/reader/readium/ReadiumTocPanel"
import { ReaderBottomStatusBar } from "@/components/reader/shared/ReaderBottomStatusBar"
import { ReaderChromeShell } from "@/components/reader/shared/ReaderChromeShell"
import { ReaderPaginateEdgeTurnStrips } from "@/components/reader/shared/ReaderPaginateEdgeTurnStrips"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import type {
  ColCount,
  ReaderSettings,
  ReadingLayout,
  TextAlign,
} from "@/components/reader/types"
import { Label } from "@/components/ui/label"
import { useLocatorProgressSync } from "@/hooks/reader/useLocatorProgressSync"
import { useReaderPaginateEdgeTurn } from "@/hooks/reader/useReaderPaginateEdgeTurn"
import { useReaderPanels } from "@/hooks/reader/useReaderPanels"
import { useReadingChrome } from "@/hooks/reader/useReadingChrome"
import { patchEpubNavigatorFixedLayoutGoNav } from "@/lib/readium/epubFixedLayoutNavPatch"
import {
  applySpreadPreference,
  epubPreferencesForSpread,
  type ReflowThemePreset,
  type SpreadPreference,
} from "@/lib/readium/epubReaderPrefs"
import {
  coerceReaderFontOption,
  createReaderFontInjectables,
  getReaderFontOptions,
  loadReaderFontFamily,
  preloadReaderFontFamilies,
  type ReaderFontFamilyKey,
  readerFontLanguageKey,
  registerReaderFontFaces,
  resolveReaderFont,
  resolveReaderLanguage,
} from "@/lib/readium/readerFonts"
import {
  readerSettingsToEpubPreferences,
  readerThemeToReflowPreset,
} from "@/lib/readium/readerSettingsBridge"
import {
  goToReadingOrderPositionBySteps,
  tocTargetReadingOrderIndex,
  tocTargetToLocator,
} from "@/lib/readium/tocNavigation"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { useAppUiStore } from "@/stores/appUiStore"
import type { ReaderUiPreferencesPayload } from "@/types/readerUiPreferences"

const RANGE_INPUT_CLASS =
  "mt-1.5 block w-full accent-primary disabled:opacity-50"
const setupIframeDocuments = new WeakSet<Document>()
const preloadedIframeFontDocuments = new WeakSet<Document>()
const COMMON_READER_FONT_FAMILIES_TO_PRELOAD = [
  "MyReaderNotoSansSC",
  "MyReaderNotoSerifSC",
  "MyReaderAlimamaFangYuanTi",
] as const

async function refreshReaderPreferencesBeforeNavigatorInit(): Promise<void> {
  if (!isTauri()) return
  try {
    const prefs = await api.getReaderUiPreferences()
    const store = useAppUiStore.getState()
    store.hydrateReaderPreferences(prefs as ReaderUiPreferencesPayload)
    store.markReaderPreferencesHydrated()
  } catch (error: unknown) {
    console.error("Failed to refresh reader preferences before init.", error)
  }
}

function getDocumentReaderFontFamily(doc: Document): string {
  return doc.documentElement.style.getPropertyValue("--USER__fontFamily").trim()
}

function scheduleReaderFontPreload(doc: Document): void {
  if (preloadedIframeFontDocuments.has(doc)) return
  preloadedIframeFontDocuments.add(doc)

  const wnd = doc.defaultView
  const preload = () => {
    void preloadReaderFontFamilies(doc, COMMON_READER_FONT_FAMILIES_TO_PRELOAD)
  }
  if (!wnd) {
    window.setTimeout(preload, 0)
    return
  }

  const idleWindow = wnd as Window & {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions,
    ) => number
  }
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(preload, { timeout: 2500 })
  } else {
    wnd.setTimeout(preload, 800)
  }
}

function walkTocLinks(
  links: Links | undefined,
  depth: number,
  out: ReadiumTocRow[],
): void {
  if (!links) return
  for (const link of links.items) {
    out.push({
      depth,
      title: link.title?.trim() || link.href,
      href: link.href,
      type: link.type,
    })
    if (link.children?.items.length) walkTocLinks(link.children, depth + 1, out)
  }
}

function getIframeDocs(): Document[] {
  return Array.from(
    document.querySelectorAll<HTMLIFrameElement>(".readium-navigator-iframe"),
  )
    .map((f) => f.contentDocument)
    .filter(Boolean) as Document[]
}

function setReaderScrollbarVisible(visible: boolean): void {
  getIframeDocs().forEach((doc) => {
    doc.documentElement.classList.toggle("reader-scrollbar-visible", visible)
  })
}

function injectReaderScrollbarStyles(): void {
  getIframeDocs().forEach((doc) => {
    if (doc.getElementById("myreader-scrollbar-style")) return
    const style = doc.createElement("style")
    style.id = "myreader-scrollbar-style"
    style.textContent = `
      ::-webkit-scrollbar { width: 0px; background: transparent; }
      ::-webkit-scrollbar-track { background: transparent; }
      html.reader-scrollbar-visible ::-webkit-scrollbar { width: 5px; }
      html.reader-scrollbar-visible ::-webkit-scrollbar-thumb {
        background: rgba(128,128,128,0.35);
        border-radius: 3px;
      }
      html { scrollbar-width: none; }
      html.reader-scrollbar-visible { scrollbar-width: thin; }
    `
    doc.head.appendChild(style)
  })
}

function setupIframeWindow(
  wnd: Window,
  opts: {
    isScrollMode: boolean
    paddingX: number
    getChromeVisible: () => boolean
    getCurrentFontFamily: () => string | null | undefined
  },
): (() => void) | undefined {
  const doc = wnd.document
  const alreadySetup = setupIframeDocuments.has(doc)
  setupIframeDocuments.add(doc)

  void registerReaderFontFaces(doc)
    .then(async () => {
      const activeFontFamily =
        getDocumentReaderFontFamily(doc) || opts.getCurrentFontFamily()
      setReaderFontFamilyProperty(doc, activeFontFamily)
      if (!activeFontFamily) return
      await loadReaderFontFamily(doc, activeFontFamily)
      if (getDocumentReaderFontFamily(doc) === activeFontFamily) {
        setReaderFontFamilyProperty(doc, activeFontFamily)
      }
    })
    .catch((error: unknown) => {
      console.warn("Failed to load active reader font for iframe.", error)
    })
    .finally(() => {
      scheduleReaderFontPreload(doc)
    })
  injectReaderScrollbarStyles()
  doc.documentElement.classList.toggle(
    "reader-scrollbar-visible",
    opts.getChromeVisible(),
  )

  if (opts.isScrollMode) {
    injectScrollPadding([doc], opts.paddingX)
  } else {
    removeScrollPadding([doc])
  }

  if (!alreadySetup) {
    const onMove = (e: PointerEvent) => {
      const nearRight = wnd.innerWidth - e.clientX < 20
      doc.documentElement.classList.toggle(
        "reader-scrollbar-visible",
        opts.getChromeVisible() || nearRight,
      )
    }
    wnd.addEventListener("pointermove", onMove)
    return () => wnd.removeEventListener("pointermove", onMove)
  }
  return undefined
}

function injectScrollPadding(docs: Document[], paddingX: number): void {
  docs.forEach((doc) => {
    let style = doc.getElementById(
      "myreader-scroll-padding",
    ) as HTMLStyleElement | null
    if (!style) {
      style = doc.createElement("style")
      style.id = "myreader-scroll-padding"
      doc.head.appendChild(style)
    }
    const px = Math.round(paddingX * 10)
    style.textContent = `body { padding-inline-start: ${px}px !important; padding-inline-end: ${px}px !important; }`
  })
}

function removeScrollPadding(docs: Document[]): void {
  docs.forEach((doc) => {
    doc.getElementById("myreader-scroll-padding")?.remove()
  })
}

function forceReaderFontRepaint(doc: Document): void {
  const root = doc.documentElement
  root.dataset.myreaderFontRepaint =
    root.dataset.myreaderFontRepaint === "1" ? "0" : "1"
  void root.offsetHeight
}

function setReaderFontFamilyProperty(
  doc: Document,
  fontFamily: string | null | undefined,
): void {
  if (fontFamily) {
    doc.documentElement.style.setProperty("--USER__fontFamily", fontFamily)
  } else {
    doc.documentElement.style.removeProperty("--USER__fontFamily")
  }
  forceReaderFontRepaint(doc)
}

async function loadReaderFontForDoc(
  doc: Document,
  fontFamily: string | null | undefined,
): Promise<void> {
  try {
    await loadReaderFontFamily(doc, fontFamily)
  } catch (error: unknown) {
    console.warn("Failed to load reader font for iframe.", error)
  }
}

async function loadReaderFontInIframeDocs(
  fontFamily: string | null | undefined,
): Promise<void> {
  await Promise.all(
    getIframeDocs().map((doc) => loadReaderFontForDoc(doc, fontFamily)),
  )
}

function setReaderFontInIframeDocs(
  fontFamily: string | null | undefined,
): void {
  getIframeDocs().forEach((doc) => {
    setReaderFontFamilyProperty(doc, fontFamily)
  })
}

type EpubSettingsPanelProps = {
  visible: boolean
  isFixedLayout: boolean
  readerLanguage: string
  onFontFamilyChange: (fontFamily: ReaderFontFamilyKey) => void
  onClose: () => void
}

function EpubSettingsPanel({
  visible,
  isFixedLayout,
  readerLanguage,
  onFontFamilyChange,
  onClose,
}: EpubSettingsPanelProps) {
  const { t } = useTranslation()
  const spreadMode = useAppUiStore((s) => s.fixedLayout.spreadMode)
  const patchFixedLayout = useAppUiStore((s) => s.patchFixedLayout)
  const readerSettings = useAppUiStore((s) => s.reflowable.settings)
  const patchReflowableSettings = useAppUiStore(
    (s) => s.patchReflowableSettings,
  )
  const reflowThemeActive = readerThemeToReflowPreset(readerSettings.theme)
  const fontOptions = useMemo(
    () => getReaderFontOptions(readerLanguage),
    [readerLanguage],
  )
  const activeFont = coerceReaderFontOption(
    resolveReaderFont(readerLanguage, readerSettings),
    fontOptions,
  )

  const onSpreadChange = useCallback(
    (mode: SpreadPreference) => {
      patchFixedLayout({ spreadMode: mode })
    },
    [patchFixedLayout],
  )

  const onReflowThemeChange = useCallback(
    (preset: ReflowThemePreset) => {
      patchReflowableSettings({ theme: preset })
    },
    [patchReflowableSettings],
  )

  return (
    <ReaderSidePanelFrame visible={visible} side="right">
      <ReaderSidePanelHeader
        title={t("reader.settings")}
        icon={Settings}
        onClose={onClose}
      />
      <div className="reader-chrome-muted space-y-5 px-4 py-3 text-xs leading-relaxed">
        {isFixedLayout ? (
          <section className="space-y-2">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80">
              {t("reader.fixedLayout")}
            </Label>
            <p className="text-[11px] text-reader-chrome-fg/60">
              {t("reader.fixedLayoutNote")}
            </p>
            <div className="flex flex-col gap-1">
              {(
                [
                  ["auto", t("reader.layoutOptions.auto")],
                  ["single", t("reader.layoutOptions.single")],
                  ["double", t("reader.layoutOptions.double")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onSpreadChange(value)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-start text-[13px] transition-colors",
                    spreadMode === value
                      ? "border-primary bg-accent text-reader-chrome-fg"
                      : "border-reader-chrome-border bg-transparent text-reader-chrome-fg/90 hover:bg-reader-chrome-muted/25",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            <section className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80">
                {t("reader.theme")}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {READER_THEME_PRESETS.map((theme) => (
                  <button
                    key={theme.key}
                    type="button"
                    onClick={() => onReflowThemeChange(theme.key)}
                    className={cn(
                      "relative flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-start text-[12px] transition-all shadow-sm",
                      reflowThemeActive === theme.key
                        ? "border-reader-chrome-active"
                        : "border-transparent hover:brightness-95",
                    )}
                    style={{
                      backgroundColor: theme.backgroundColor,
                      color: theme.foregroundColor,
                    }}
                  >
                    <span
                      className={cn(
                        "inline-block h-3.5 w-3.5 shrink-0 rounded-full border",
                        reflowThemeActive === theme.key
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                      style={{
                        borderColor: theme.foregroundColor,
                        backgroundColor: theme.foregroundColor,
                        boxShadow: `inset 0 0 0 2px ${theme.backgroundColor}`,
                      }}
                    />
                    {t(`reader.themes.${theme.labelKey}`)}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80">
                {t("reader.fontFamily")}
              </Label>
              <div className="grid grid-cols-2 gap-1.5">
                {fontOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onFontFamilyChange(option.key)}
                    className={cn(
                      "min-h-9 rounded-md border px-2.5 py-1.5 text-start text-[12px] transition-colors",
                      activeFont === option.key
                        ? "border-primary bg-accent text-reader-chrome-fg"
                        : "border-reader-chrome-border bg-transparent text-reader-chrome-fg/90 hover:bg-reader-chrome-muted/25",
                    )}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex justify-between col">
                <Label
                  htmlFor="readium-font-size"
                  className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80"
                >
                  {t("reader.fontSize")}
                </Label>
                <Label
                  htmlFor="readium-font-size"
                  className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80"
                >
                  {readerSettings.fontSize}px
                </Label>
              </div>
              <input
                id="readium-font-size"
                type="range"
                min={14}
                max={26}
                step={1}
                value={readerSettings.fontSize}
                onChange={(e) =>
                  patchReflowableSettings({
                    fontSize: Number(e.target.value) || 18,
                  })
                }
                className={RANGE_INPUT_CLASS}
              />
            </section>

            <section className="space-y-2">
              <div className="flex justify-between col">
                <Label
                  htmlFor="readium-page-margin"
                  className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80"
                >
                  {t("reader.margin")}
                </Label>
                <Label
                  htmlFor="readium-page-margin"
                  className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80"
                >
                  {readerSettings.paddingX.toFixed(1)}
                </Label>
              </div>
              <input
                id="readium-page-margin"
                type="range"
                min={0}
                max={4}
                step={0.25}
                value={readerSettings.paddingX}
                onChange={(e) =>
                  patchReflowableSettings({
                    paddingX: Number(e.target.value) || 0,
                  })
                }
                className={RANGE_INPUT_CLASS}
              />
            </section>

            <section className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80">
                {t("reader.lineHeight")}
              </Label>
              <div className="flex gap-1">
                {([1.35, 1.5, 1.65, 1.85, 2] as const).map((lh) => (
                  <button
                    key={lh}
                    type="button"
                    onClick={() => patchReflowableSettings({ lineHeight: lh })}
                    className={cn(
                      "flex-1 rounded-md border px-1 py-1.5 text-[12px] transition-colors",
                      readerSettings.lineHeight === lh
                        ? "border-primary bg-accent text-reader-chrome-fg"
                        : "border-reader-chrome-border bg-transparent text-reader-chrome-fg/90 hover:bg-reader-chrome-muted/25",
                    )}
                  >
                    {lh}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80">
                {t("reader.readingMode")}
              </Label>
              <div className="flex gap-1">
                {(
                  [
                    [
                      "paginate",
                      t("reader.readingModeOptions.paginate"),
                      BookOpen,
                    ],
                    [
                      "scroll",
                      t("reader.readingModeOptions.scroll"),
                      ScrollText,
                    ],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      patchReflowableSettings({
                        readingLayout: value as ReadingLayout,
                      })
                    }
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[12px] transition-colors",
                      readerSettings.readingLayout === value
                        ? "border-primary bg-accent text-reader-chrome-fg"
                        : "border-reader-chrome-border bg-transparent text-reader-chrome-fg/90 hover:bg-reader-chrome-muted/25",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80">
                {t("reader.typography")}
              </Label>
              <div className="flex gap-1">
                {(
                  [
                    ["auto", t("reader.typographyOptions.auto"), TextInitial],
                    [
                      "justify",
                      t("reader.typographyOptions.justify"),
                      AlignJustify,
                    ],
                    ["start", t("reader.typographyOptions.start"), AlignLeft],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      patchReflowableSettings({ textAlign: value as TextAlign })
                    }
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[12px] transition-colors",
                      readerSettings.textAlign === value
                        ? "border-primary bg-accent text-reader-chrome-fg"
                        : "border-reader-chrome-border bg-transparent text-reader-chrome-fg/90 hover:bg-reader-chrome-muted/25",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {readerSettings.readingLayout !== "scroll" && (
              <section className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80">
                  {t("reader.column")}
                </Label>
                <div className="flex gap-1">
                  {(
                    [
                      [
                        "auto",
                        t("reader.columnOptions.auto"),
                        PanelLeftRightDashed,
                      ],
                      ["1", t("reader.columnOptions.1"), Square],
                      ["2", t("reader.columnOptions.2"), Columns2],
                    ] as const
                  ).map(([value, label, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        patchReflowableSettings({ colCount: value as ColCount })
                      }
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[12px] transition-colors",
                        readerSettings.colCount === value
                          ? "border-primary bg-accent text-reader-chrome-fg"
                          : "border-reader-chrome-border bg-transparent text-reader-chrome-fg/90 hover:bg-reader-chrome-muted/25",
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </ReaderSidePanelFrame>
  )
}

export type ReadiumEpubReaderProps = {
  bookTitle: string
  publication: Publication
  initialSavedLocator: Locator | null
  libraryId: string | null
  bookId: number
  format: string
  progressSyncEnabled: boolean
}

export function ReadiumEpubReader({
  bookTitle,
  publication,
  initialSavedLocator,
  libraryId,
  bookId,
  format,
  progressSyncEnabled,
}: ReadiumEpubReaderProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const navigatorRef = useRef<EpubNavigator | null>(null)
  const { tocOpen, settingsOpen, toggleToc, toggleSettings, closePanels } =
    useReaderPanels()
  const { readerRootRef, chromeVisible, showChrome, scheduleChromeHide } =
    useReadingChrome(false, tocOpen || settingsOpen)
  const [bookmarked, setBookmarked] = useState(false)
  const [readiumNavReady, setReadiumNavReady] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [chapterTitle, setChapterTitle] = useState("")
  const [currentLocator, setCurrentLocator] = useState<Locator | null>(null)
  const chromeVisibleRef = useRef(chromeVisible)
  const reflowablePreferenceApplyRef = useRef(0)
  useEffect(() => {
    chromeVisibleRef.current = chromeVisible
  }, [chromeVisible])

  const readerPreferencesHydrated = useAppUiStore(
    (s) => s.readerPreferencesHydrated,
  )
  const spreadMode = useAppUiStore((s) => s.fixedLayout.spreadMode)
  const readerSettings = useAppUiStore((s) => s.reflowable.settings)
  const patchReflowableSettings = useAppUiStore(
    (s) => s.patchReflowableSettings,
  )

  const isFixedLayout = useMemo(
    () => EpubNavigator.determineLayout(publication, false) === Layout.fixed,
    [publication],
  )
  const readerLanguage = useMemo(
    () => resolveReaderLanguage(publication.metadata.languages),
    [publication.metadata.languages],
  )

  const epubNavigatorDefaults = useMemo(
    () => (isFixedLayout ? {} : {}),
    [isFixedLayout],
  )

  const tocRows = useMemo(() => {
    const out: ReadiumTocRow[] = []
    walkTocLinks(publication.toc, 0, out)
    return out
  }, [publication])

  const onTocSelect = useCallback(
    async (row: ReadiumTocRow) => {
      const nav = navigatorRef.current
      if (!nav) return
      if (isFixedLayout) {
        const targetIndex = tocTargetReadingOrderIndex(publication, row)
        if (targetIndex >= 0) {
          await goToReadingOrderPositionBySteps(nav, targetIndex + 1)
          closePanels()
          return
        }
      }
      const locator = tocTargetToLocator(publication, row)
      if (!locator) return
      nav.go(locator, false, () => {})
      closePanels()
    },
    [isFixedLayout, publication, closePanels],
  )

  const applyReflowablePreferences = useCallback(
    async (settings: ReaderSettings) => {
      if (isFixedLayout) return
      const applyId = ++reflowablePreferenceApplyRef.current
      const nav = navigatorRef.current
      const preferences = readerSettingsToEpubPreferences(
        settings,
        readerLanguage,
      )
      const fontFamily = preferences.fontFamily

      setReaderFontInIframeDocs(fontFamily)
      await loadReaderFontInIframeDocs(fontFamily)
      if (applyId !== reflowablePreferenceApplyRef.current) return

      await nav?.submitPreferences(preferences)
      if (applyId !== reflowablePreferenceApplyRef.current) return

      setReaderFontInIframeDocs(fontFamily)
      await nav?.resizeHandler()
    },
    [isFixedLayout, readerLanguage],
  )

  const onReaderFontFamilyChange = useCallback(
    (fontFamily: ReaderFontFamilyKey) => {
      const currentSettings = useAppUiStore.getState().reflowable.settings
      const languageKey = readerFontLanguageKey(readerLanguage)
      const patch: Partial<ReaderSettings> =
        languageKey === "default"
          ? { fontFamily }
          : {
              fontFamiliesByLanguage: {
                ...currentSettings.fontFamiliesByLanguage,
                [languageKey]: fontFamily,
              },
            }
      patchReflowableSettings(patch)
      void useAppUiStore.getState().persistReaderPreferencesNow()
      const nextSettings = { ...currentSettings, ...patch }
      void applyReflowablePreferences(nextSettings).catch((error: unknown) => {
        console.error("Failed to apply reader font preference.", error)
      })
    },
    [applyReflowablePreferences, patchReflowableSettings, readerLanguage],
  )

  const getCurrentReflowableFontFamily = useCallback(() => {
    if (isFixedLayout) return undefined
    return readerSettingsToEpubPreferences(
      useAppUiStore.getState().reflowable.settings,
      readerLanguage,
    ).fontFamily
  }, [isFixedLayout, readerLanguage])

  const isRtl = publication.metadata.effectiveReadingProgression === "rtl"
  const edgeTurnActive =
    readiumNavReady &&
    !tocOpen &&
    !settingsOpen &&
    !initError &&
    readerSettings.readingLayout !== "scroll"
  const { nearLeft, nearRight } = useReaderPaginateEdgeTurn(
    edgeTurnActive,
    readerRootRef,
  )

  const onReadiumEdgePrev = useCallback(() => {
    navigatorRef.current?.goBackward(false, () => {})
  }, [])

  const onReadiumEdgeNext = useCallback(() => {
    navigatorRef.current?.goForward(false, () => {})
  }, [])

  useEffect(() => {
    setReaderScrollbarVisible(chromeVisible)
  }, [chromeVisible])

  useEffect(() => {
    const docs = getIframeDocs()
    if (readerSettings.readingLayout === "scroll" && !isFixedLayout) {
      injectScrollPadding(docs, readerSettings.paddingX)
    } else {
      removeScrollPadding(docs)
    }
  }, [readerSettings.paddingX, readerSettings.readingLayout, isFixedLayout])

  // MutationObserver catches preloaded/composite iframes that never trigger frameLoaded
  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const isScrollMode =
      readerSettings.readingLayout === "scroll" && !isFixedLayout

    const cleanups: (() => void)[] = []
    const watchedIframes = new Set<HTMLIFrameElement>()

    const trySetup = (iframe: HTMLIFrameElement) => {
      const doSetup = () => {
        try {
          const wnd = iframe.contentWindow
          if (!wnd) return
          const cleanup = setupIframeWindow(wnd, {
            isScrollMode,
            paddingX: readerSettings.paddingX,
            getChromeVisible: () => chromeVisibleRef.current,
            getCurrentFontFamily: getCurrentReflowableFontFamily,
          })
          if (cleanup) cleanups.push(cleanup)
        } catch {
          // cross-origin or not ready
        }
      }
      if (!watchedIframes.has(iframe)) {
        watchedIframes.add(iframe)
        iframe.addEventListener("load", doSetup)
        cleanups.push(() => iframe.removeEventListener("load", doSetup))
      }
      if (
        iframe.contentDocument?.readyState === "complete" &&
        !setupIframeDocuments.has(iframe.contentDocument)
      ) {
        doSetup()
      }
    }

    container
      .querySelectorAll<HTMLIFrameElement>(".readium-navigator-iframe")
      .forEach(trySetup)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (
            node instanceof HTMLIFrameElement &&
            node.classList.contains("readium-navigator-iframe")
          ) {
            trySetup(node)
          }
        }
      }
    })
    observer.observe(container, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      cleanups.forEach((fn) => {
        fn()
      })
    }
  }, [
    readerSettings.readingLayout,
    isFixedLayout,
    readerSettings.paddingX,
    getCurrentReflowableFontFamily,
  ])

  useLocatorProgressSync({
    enabled: progressSyncEnabled && Boolean(libraryId) && format.length > 0,
    libraryId,
    bookId,
    format,
    currentLocator,
  })

  useEffect(() => {
    const nav = navigatorRef.current
    if (!nav || !readerPreferencesHydrated) return
    if (isFixedLayout) {
      void applySpreadPreference(nav, spreadMode)
      return
    }
    void applyReflowablePreferences(readerSettings).catch((error: unknown) => {
      console.error("Failed to apply reader reflowable preferences.", error)
    })
  }, [
    applyReflowablePreferences,
    readerPreferencesHydrated,
    isFixedLayout,
    spreadMode,
    readerSettings,
  ])

  useEffect(() => {
    if (!containerRef.current) return
    if (!readerPreferencesHydrated) return

    async function init() {
      try {
        const container = containerRef.current!
        if (publication.readingOrder.items.length === 0) {
          throw new Error("Publication has no reading order items")
        }

        const positions = publication.readingOrder.items.map(
          (item, index) =>
            new Locator({
              href: item.href,
              type: item.type ?? "application/xhtml+xml",
              title: item.title,
              locations: new LocatorLocations({
                position: index + 1,
                progression: 0,
              }),
            }),
        )

        let initialPosition = positions[0]
        if (initialSavedLocator) {
          const match = positions.find(
            (p) =>
              p.href === initialSavedLocator.href ||
              p.href.split("#")[0] === initialSavedLocator.href.split("#")[0],
          )
          if (match) {
            initialPosition = new Locator({
              href: initialSavedLocator.href,
              type: initialSavedLocator.type,
              title: initialSavedLocator.title ?? match.title,
              locations: initialSavedLocator.locations ?? match.locations,
              text: initialSavedLocator.text,
            })
          }
        }

        await refreshReaderPreferencesBeforeNavigatorInit()
        const ui = useAppUiStore.getState()
        const initialPreferences = isFixedLayout
          ? epubPreferencesForSpread(ui.fixedLayout.spreadMode)
          : readerSettingsToEpubPreferences(
              ui.reflowable.settings,
              readerLanguage,
            )
        const navigatorConfiguration = {
          preferences: initialPreferences,
          defaults: epubNavigatorDefaults,
          ...(isFixedLayout
            ? {}
            : { injectables: createReaderFontInjectables() }),
        }

        const nav = new EpubNavigator(
          container,
          publication,
          {
            frameLoaded: (wnd) => {
              const ui = useAppUiStore.getState()
              setupIframeWindow(wnd, {
                isScrollMode:
                  ui.reflowable.settings.readingLayout === "scroll" &&
                  !isFixedLayout,
                paddingX: ui.reflowable.settings.paddingX,
                getChromeVisible: () => chromeVisibleRef.current,
                getCurrentFontFamily: getCurrentReflowableFontFamily,
              })
            },
            positionChanged: (locator) => {
              setCurrentLocator(locator)
              setChapterTitle(locator.title?.trim() || "")
            },
            tap: () => {
              showChrome()
              return (
                useAppUiStore.getState().reflowable.settings.readingLayout ===
                "scroll"
              )
            },
            click: () => {
              return (
                useAppUiStore.getState().reflowable.settings.readingLayout ===
                "scroll"
              )
            },
            zoom: () => {},
            miscPointer: () => {
              showChrome()
            },
            scroll: () => {},
            customEvent: () => {},
            handleLocator: () => false,
            textSelected: () => {},
            contentProtection: () => {},
            contextMenu: () => {},
            peripheral: (ev) => {
              const nav2 = navigatorRef.current
              if (!nav2) return
              const rec = ev as { key?: string; keyCode?: number }
              const key = rec.key ?? ""
              const isRtl =
                publication.metadata.effectiveReadingProgression === "rtl"
              if (
                key === "ArrowRight" ||
                key === "PageDown" ||
                rec.keyCode === 39
              ) {
                isRtl
                  ? nav2.goBackward(false, () => {})
                  : nav2.goForward(false, () => {})
              } else if (
                key === "ArrowLeft" ||
                key === "PageUp" ||
                rec.keyCode === 37
              ) {
                isRtl
                  ? nav2.goForward(false, () => {})
                  : nav2.goBackward(false, () => {})
              }
            },
          },
          positions,
          initialPosition,
          navigatorConfiguration,
        )
        if (isFixedLayout) {
          patchEpubNavigatorFixedLayoutGoNav(nav)
        }
        await nav.load()
        requestAnimationFrame(() => {
          void nav.resizeHandler()
          requestAnimationFrame(() => {
            void nav.resizeHandler()
          })
        })
        navigatorRef.current = nav
        setReadiumNavReady(true)
        const store = useAppUiStore.getState()
        if (store.readerPreferencesHydrated) {
          if (isFixedLayout) {
            await applySpreadPreference(nav, store.fixedLayout.spreadMode)
          } else {
            await applyReflowablePreferences(store.reflowable.settings)
          }
        }
        setCurrentLocator(nav.currentLocator)
        setChapterTitle(nav.currentLocator.title?.trim() || "")
      } catch (e) {
        console.error("[Readium] Failed to initialize navigator:", e)
        setInitError(String(e))
      }
    }

    void init()

    return () => {
      setReadiumNavReady(false)
      void navigatorRef.current?.destroy()
      navigatorRef.current = null
    }
  }, [
    publication,
    initialSavedLocator,
    showChrome,
    epubNavigatorDefaults,
    isFixedLayout,
    readerLanguage,
    readerPreferencesHydrated,
    applyReflowablePreferences,
    getCurrentReflowableFontFamily,
  ])

  if (initError) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-background p-8 text-center">
        <div>
          <p className="text-destructive font-medium mb-2">
            {t("reader.loadFailed")}
          </p>
          <p className="text-sm text-muted-foreground max-w-md">{initError}</p>
        </div>
      </div>
    )
  }

  return (
    <ReaderChromeShell
      readerRootRef={readerRootRef}
      chromeVisible={chromeVisible}
      showChrome={showChrome}
      scheduleChromeHide={scheduleChromeHide}
      panelsOpen={tocOpen || settingsOpen}
      onClosePanels={closePanels}
      theme={readerSettings.theme}
      topBar={{
        bookTitle,
        chapterTitle,
        bookmarked,
        onToggleToc: toggleToc,
        onToggleBookmark: () => setBookmarked((b) => !b),
        onToggleSettings: toggleSettings,
      }}
      tocPanel={
        <ReadiumTocPanel
          visible={tocOpen}
          rows={tocRows}
          activeHref={currentLocator?.href?.split("#")[0] ?? null}
          onSelect={onTocSelect}
          onClose={closePanels}
        />
      }
      settingsPanel={
        <EpubSettingsPanel
          visible={settingsOpen}
          isFixedLayout={isFixedLayout}
          readerLanguage={readerLanguage}
          onFontFamilyChange={onReaderFontFamilyChange}
          onClose={closePanels}
        />
      }
      beforeMain={
        <style>{`
        /*
          重排 EPUB：FrameManager 的 iframe 为 position:absolute 且不设宽高，浏览器默认约 300×150，
          ReflowableSetup 会把 --RS__viewportWidth 设为 iframe 的 innerWidth，导致整书按窄视口排版。
          仅对宿主下「直接子级」iframe 生效；FXL 的 iframe 在 bookElement/spine 内层，不受影响。
        */
        .readium-epub-host > .readium-navigator-iframe {
          border: none !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          box-sizing: border-box !important;
        }
      `}</style>
      }
      edgeTurnOverlays={
        readerSettings.readingLayout !== "scroll" ? (
          <ReaderPaginateEdgeTurnStrips
            nearLeft={isRtl ? nearRight : nearLeft}
            nearRight={isRtl ? nearLeft : nearRight}
            onPrev={onReadiumEdgePrev}
            onNext={onReadiumEdgeNext}
            prevLabel={t("reader.prevPage")}
            nextLabel={t("reader.nextPage")}
          />
        ) : null
      }
      bottomStatusBar={
        <ReaderBottomStatusBar
          visible={chromeVisible}
          leftText={
            isFixedLayout
              ? `t("reader.pageCount", { current: currentLocator?.locations?.position ?? 1, total: publication.readingOrder.items.length })`
              : currentLocator?.locations?.progression != null
                ? `${Math.round((currentLocator.locations.progression ?? 0) * 100)}%`
                : undefined
          }
          progress={
            currentLocator?.locations?.totalProgression != null
              ? (currentLocator.locations.totalProgression ?? 0) * 100
              : undefined
          }
        />
      }
      main={
        <div
          ref={containerRef}
          className="readium-epub-host relative min-h-0 min-w-0 w-full flex-1 basis-0 overflow-hidden"
        />
      }
    />
  )
}
