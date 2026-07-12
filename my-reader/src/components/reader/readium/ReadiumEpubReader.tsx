import { READER_THEME_PRESETS } from "@my-reader/tools/reader-themes"
import {
  enhanceTocItemsWithContentLocators,
  linksToTocItems,
  resolveReaderToc,
  resolveReaderTocAtPosition,
  type ReaderContentElement,
  type ReaderLink,
  type ReaderLocator,
  type ReaderTocItem,
} from "@my-reader/tools/reader-toc"
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
  Check,
  Columns2,
  Loader2,
  PanelLeftRightDashed,
  ScrollText,
  Settings,
  Square,
  TextInitial,
} from "lucide-react"
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import {
  ReadiumTocPanel,
  type ReadiumTocRow,
} from "@/components/reader/readium/ReadiumTocPanel"
import { ReaderBottomStatusBar } from "@/components/reader/shared/ReaderBottomStatusBar"
import { ReaderChromeShell } from "@/components/reader/shared/ReaderChromeShell"
import { ReaderPaginateEdgeTurnStrips } from "@/components/reader/shared/ReaderPaginateEdgeTurnStrips"
import {
  READER_SETTINGS_CONTENT_CLASS,
  READER_SETTINGS_LABEL_CLASS,
  READER_SETTINGS_OPTION_CLASS,
  READER_SETTINGS_VALUE_CLASS,
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
  ReaderSidePanelScrollArea,
  readerSettingsOptionStateClass,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import type {
  ColCount,
  ReaderSettings,
  ReadingLayout,
  TextAlign,
} from "@/components/reader/types"
import { Label } from "@/components/ui/label"
import { useLocatorProgressSync } from "@/hooks/reader/useLocatorProgressSync"
import { useReaderIframePointerBridge } from "@/hooks/reader/useReaderIframePointerBridge"
import { useReaderPaginateEdgeHover } from "@/hooks/reader/useReaderPaginateEdgeHover"
import { useReaderPanels } from "@/hooks/reader/useReaderPanels"
import { useReadingChrome } from "@/hooks/reader/useReadingChrome"
import { patchEpubNavigatorFixedLayoutGoNav } from "@/lib/readium/epubFixedLayoutNavPatch"
import {
  type EpubTextResource,
  extractEpubContentLocators,
} from "@/lib/readium/epubContentLocators"
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
  readerPaddingXToInlinePaddingPx,
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

const RANGE_INPUT_CLASS = "reader-settings-range disabled:opacity-50"
const readerSettingsRangeStyle = (
  value: number,
  min: number,
  max: number,
): CSSProperties =>
  ({
    "--reader-settings-range-progress": `${((value - min) / (max - min)) * 100}%`,
  }) as CSSProperties
const EPUB_POSITION_CHARACTER_UNIT = 1024
const epubResourceTextCache = new WeakMap<
  Publication,
  Promise<EpubTextResource[]>
>()
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

function readiumLinksToReaderLinks(links: Links | undefined): ReaderLink[] {
  if (!links) return []
  return links.items.map((link) => ({
    href: link.href,
    title: link.title?.trim() || undefined,
    type: link.type,
    ...(link.children?.items.length
      ? { children: readiumLinksToReaderLinks(link.children) }
      : {}),
  }))
}

function tocItemToReadiumRow(item: ReaderTocItem): ReadiumTocRow {
  return {
    key: item.id,
    depth: item.depth ?? 0,
    title: item.label,
    href: item.href ?? "",
    type: item.locator?.type,
  }
}

function readiumLocatorToReaderLocator(locator: Locator): ReaderLocator {
  return {
    href: locator.href,
    type: locator.type,
    title: locator.title,
    ...(locator.locations
      ? {
          locations: {
            fragments: locator.locations.fragments,
            progression:
              locator.locations.progression ??
              locator.locations.totalProgression ??
              0,
            position: locator.locations.position,
            totalProgression: locator.locations.totalProgression,
          },
        }
      : { locations: { progression: 0 } }),
    text: locator.text,
  }
}

function readerLocatorToReadiumLocator(locator: ReaderLocator): Locator {
  const [href, hrefFragment] = locator.href.split("#", 2)
  const fragments = locator.locations?.fragments ?? []
  return new Locator({
    href,
    type: locator.type,
    title: locator.title,
    locations: new LocatorLocations({
      fragments:
        hrefFragment && !fragments.includes(hrefFragment)
          ? [...fragments, hrefFragment]
          : fragments,
      progression: locator.locations?.progression ?? 0,
      position: locator.locations?.position,
      totalProgression: locator.locations?.totalProgression,
    }),
  })
}

function createReadingOrderEpubPositions(publication: Publication): Locator[] {
  const total = publication.readingOrder.items.length
  return publication.readingOrder.items.map(
    (item, index) =>
      new Locator({
        href: item.href,
        type: item.type ?? "application/xhtml+xml",
        title: item.title,
        locations: new LocatorLocations({
          position: index + 1,
          progression: 0,
          totalProgression: total > 1 ? index / (total - 1) : 0,
        }),
      }),
  )
}

function normalizeEpubPositions(
  publication: Publication,
  positions: Locator[],
): Locator[] {
  const total = positions.length
  return positions.map((locator, index) => {
    const href = locator.href.split("#")[0]
    const readingOrderLink = publication.readingOrder.findWithHref(href)
    return new Locator({
      href: locator.href,
      type: locator.type || readingOrderLink?.type || "application/xhtml+xml",
      title: locator.title ?? readingOrderLink?.title,
      locations: new LocatorLocations({
        fragments: locator.locations.fragments,
        progression: locator.locations.progression ?? 0,
        totalProgression:
          locator.locations.totalProgression ??
          (total > 1 ? index / (total - 1) : 0),
        position: index + 1,
        otherLocations: locator.locations.otherLocations,
      }),
      text: locator.text,
    })
  })
}

function countReadableCharacters(html: string): number {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const text =
    doc.body?.textContent?.trim() ??
    doc.documentElement.textContent?.trim() ??
    html
  return text.replace(/\s+/g, " ").trim().length
}

function loadEpubTextResources(
  publication: Publication,
): Promise<EpubTextResource[]> {
  const cached = epubResourceTextCache.get(publication)
  if (cached) return cached

  const resources = Promise.all(
    publication.readingOrder.items.map(async (item) => ({
      href: item.href,
      type: item.type ?? "application/xhtml+xml",
      title: item.title,
      html:
        (await publication
          .get(item)
          .readAsString()
          .catch(() => "")) ?? "",
    })),
  )
  epubResourceTextCache.set(publication, resources)
  return resources
}

async function createLengthBasedEpubPositions(
  publication: Publication,
): Promise<Locator[]> {
  const resources = await loadEpubTextResources(publication)
  const plans = resources.map((resource) => ({
    resource,
    count: Math.max(
      1,
      Math.ceil(
        countReadableCharacters(resource.html) / EPUB_POSITION_CHARACTER_UNIT,
      ),
    ),
  }))
  const total = plans.reduce((sum, plan) => sum + plan.count, 0)
  let position = 1
  const locators: Locator[] = []

  for (const plan of plans) {
    for (let index = 0; index < plan.count; index += 1) {
      locators.push(
        new Locator({
          href: plan.resource.href,
          type: plan.resource.type,
          title: plan.resource.title,
          locations: new LocatorLocations({
            position,
            progression: index / plan.count,
            totalProgression: total > 1 ? (position - 1) / (total - 1) : 0,
          }),
        }),
      )
      position += 1
    }
  }

  return locators
}

async function resolveEpubPositions(
  publication: Publication,
  isFixedLayout: boolean,
): Promise<Locator[]> {
  const fallback = createReadingOrderEpubPositions(publication)
  if (isFixedLayout) return fallback

  const manifestPositions = await publication
    .positionsFromManifest()
    .catch(() => [])
  if (manifestPositions.length > fallback.length) {
    return normalizeEpubPositions(publication, manifestPositions)
  }

  const generatedPositions = await createLengthBasedEpubPositions(publication)
  return generatedPositions.length > 0 ? generatedPositions : fallback
}

async function resolveEpubNavigationData(
  publication: Publication,
  isFixedLayout: boolean,
): Promise<{ positions: Locator[]; contentElements: ReaderContentElement[] }> {
  const resourcesPromise = isFixedLayout
    ? Promise.resolve([])
    : loadEpubTextResources(publication)
  const positions = await resolveEpubPositions(publication, isFixedLayout)
  const resources = await resourcesPromise
  return {
    positions,
    contentElements: isFixedLayout
      ? []
      : extractEpubContentLocators(
          resources,
          positions.map(readiumLocatorToReaderLocator),
        ),
  }
}

function clampProgression(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function locatorAtTotalProgression(
  positions: Locator[],
  totalProgression: number,
): Locator | null {
  if (positions.length === 0) return null
  const index = Math.round(
    clampProgression(totalProgression) * (positions.length - 1),
  )
  return positions[index] ?? null
}

function locatorHref(locator: Locator): string {
  return locator.href.split("#")[0]
}

function createEpubProgressSeekLocator(
  positions: Locator[],
  targetIndex: number,
): Locator | null {
  const target = positions[targetIndex]
  if (!target) return null
  const targetHref = locatorHref(target)
  const targetProgression = target.locations.progression ?? 0
  const nextInResource = positions
    .slice(targetIndex + 1)
    .find((position) => locatorHref(position) === targetHref)
  const nextProgression = nextInResource?.locations.progression
  if (
    typeof nextProgression !== "number" ||
    nextProgression <= targetProgression
  ) {
    return target
  }

  return target.copyWithLocations({
    progression: targetProgression + (nextProgression - targetProgression) / 2,
  })
}

function isLocatorVisibleInViewport(
  navigator: EpubNavigator | null,
  locator: Locator,
): boolean {
  const range = navigator?.viewport.progressions.get(locatorHref(locator))
  const progression = locator.locations.progression ?? 0
  return Boolean(
    range &&
      progression >= range.start - 0.0001 &&
      progression <= range.end + 0.0001,
  )
}

function locatorForSavedProgression(
  positions: Locator[],
  savedLocator: Locator,
): Locator | null {
  const href = locatorHref(savedLocator)
  const hrefPositions = positions.filter(
    (position) => locatorHref(position) === href,
  )
  if (hrefPositions.length === 0) return null

  const savedProgression = savedLocator.locations.progression
  if (typeof savedProgression !== "number") return hrefPositions[0] ?? null

  return hrefPositions.reduce((best, position) => {
    const bestDistance = Math.abs(
      (best.locations.progression ?? 0) - savedProgression,
    )
    const nextDistance = Math.abs(
      (position.locations.progression ?? 0) - savedProgression,
    )
    return nextDistance < bestDistance ? position : best
  }, hrefPositions[0])
}

function resolveInitialEpubPosition(
  positions: Locator[],
  initialSavedLocator: Locator | null,
): Locator | null {
  if (positions.length === 0) return null
  if (!initialSavedLocator) return positions[0]

  const savedTotalProgression = initialSavedLocator.locations.totalProgression
  if (typeof savedTotalProgression === "number") {
    return locatorAtTotalProgression(positions, savedTotalProgression)
  }

  const savedPosition = initialSavedLocator.locations.position
  if (typeof savedPosition === "number") {
    const position = positions[savedPosition - 1]
    if (position) return position
  }

  return (
    locatorForSavedProgression(positions, initialSavedLocator) ?? positions[0]
  )
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
    const px = readerPaddingXToInlinePaddingPx(paddingX)
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
      <ReaderSidePanelScrollArea className={READER_SETTINGS_CONTENT_CLASS}>
        {isFixedLayout ? (
          <section className="space-y-2">
            <Label className={READER_SETTINGS_LABEL_CLASS}>
              {t("reader.fixedLayout")}
            </Label>
            <p className="text-[11px] text-reader-chrome-fg/60">
              {t("reader.fixedLayoutNote")}
            </p>
            <div className="flex flex-col gap-2">
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
                    READER_SETTINGS_OPTION_CLASS,
                    "text-start",
                    readerSettingsOptionStateClass(spreadMode === value),
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
              <Label className={READER_SETTINGS_LABEL_CLASS}>
                {t("reader.theme")}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {READER_THEME_PRESETS.map((theme) => (
                  <button
                    key={theme.key}
                    type="button"
                    onClick={() => onReflowThemeChange(theme.key)}
                    className={cn(
                      READER_SETTINGS_OPTION_CLASS,
                      "relative flex items-center justify-center border-2 px-7 text-center transition-all",
                      reflowThemeActive === theme.key
                        ? "border-reader-chrome-active"
                        : "border-transparent hover:brightness-95",
                    )}
                    style={{
                      backgroundColor: theme.backgroundColor,
                      color: theme.foregroundColor,
                    }}
                  >
                    {t(`reader.themes.${theme.labelKey}`)}
                    {reflowThemeActive === theme.key ? (
                      <span
                        className="absolute end-1.5 top-1.5 grid size-4 place-items-center rounded-full"
                        style={{
                          backgroundColor: "var(--reader-chrome-active)",
                        }}
                      >
                        <Check
                          className="size-2.5"
                          strokeWidth={3}
                          style={{ color: theme.backgroundColor }}
                        />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <Label className={READER_SETTINGS_LABEL_CLASS}>
                {t("reader.fontFamily")}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {fontOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onFontFamilyChange(option.key)}
                    className={cn(
                      READER_SETTINGS_OPTION_CLASS,
                      "text-start",
                      readerSettingsOptionStateClass(activeFont === option.key),
                    )}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label
                  htmlFor="readium-font-size"
                  className={READER_SETTINGS_LABEL_CLASS}
                >
                  {t("reader.fontSize")}
                </Label>
                <Label
                  htmlFor="readium-font-size"
                  className={READER_SETTINGS_VALUE_CLASS}
                >
                  {readerSettings.fontSize} px
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
                style={readerSettingsRangeStyle(
                  readerSettings.fontSize,
                  14,
                  26,
                )}
              />
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label
                  htmlFor="readium-page-margin"
                  className={READER_SETTINGS_LABEL_CLASS}
                >
                  {t("reader.margin")}
                </Label>
                <Label
                  htmlFor="readium-page-margin"
                  className={READER_SETTINGS_VALUE_CLASS}
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
                style={readerSettingsRangeStyle(readerSettings.paddingX, 0, 4)}
              />
            </section>

            <section className="space-y-2">
              <Label className={READER_SETTINGS_LABEL_CLASS}>
                {t("reader.lineHeight")}
              </Label>
              <div className="flex gap-2">
                {([1.35, 1.5, 1.65, 1.85, 2] as const).map((lh) => (
                  <button
                    key={lh}
                    type="button"
                    onClick={() => patchReflowableSettings({ lineHeight: lh })}
                    className={cn(
                      READER_SETTINGS_OPTION_CLASS,
                      "flex-1 px-2 text-center",
                      readerSettingsOptionStateClass(
                        readerSettings.lineHeight === lh,
                      ),
                    )}
                  >
                    {lh}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <Label className={READER_SETTINGS_LABEL_CLASS}>
                {t("reader.readingMode")}
              </Label>
              <div className="flex gap-2">
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
                      READER_SETTINGS_OPTION_CLASS,
                      "flex flex-1 items-center justify-center gap-1",
                      readerSettingsOptionStateClass(
                        readerSettings.readingLayout === value,
                      ),
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <Label className={READER_SETTINGS_LABEL_CLASS}>
                {t("reader.typography")}
              </Label>
              <div className="flex gap-2">
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
                      READER_SETTINGS_OPTION_CLASS,
                      "flex flex-1 items-center justify-center gap-1",
                      readerSettingsOptionStateClass(
                        readerSettings.textAlign === value,
                      ),
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
                <Label className={READER_SETTINGS_LABEL_CLASS}>
                  {t("reader.column")}
                </Label>
                <div className="flex gap-2">
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
                        READER_SETTINGS_OPTION_CLASS,
                        "flex flex-1 items-center justify-center gap-1",
                        readerSettingsOptionStateClass(
                          readerSettings.colCount === value,
                        ),
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
      </ReaderSidePanelScrollArea>
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
  const {
    readerRootRef,
    chromeVisible,
    showChrome,
    scheduleChromeHide,
    handlePointerPosition,
  } = useReadingChrome(false, tocOpen || settingsOpen)
  useReaderIframePointerBridge(containerRef, handlePointerPosition)
  const [bookmarked, setBookmarked] = useState(false)
  const [readiumNavReady, setReadiumNavReady] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [chapterTitle, setChapterTitle] = useState("")
  const [currentLocator, setCurrentLocator] = useState<Locator | null>(null)
  const [contentSettling, setContentSettling] = useState(true)
  const chromeVisibleRef = useRef(chromeVisible)
  const reflowablePreferenceApplyRef = useRef(0)
  const contentSettlingTimerRef = useRef<number | null>(null)
  const contentRevealRafRef = useRef<number | null>(null)
  const progressSeekClearTimerRef = useRef<number | null>(null)
  const navigationSequenceRef = useRef(0)
  const pendingNavigationHrefRef = useRef<string | null>(null)
  const pendingProgressSeekRef = useRef<{
    sequence: number
    locator: Locator
  } | null>(null)
  const selectedTocItemRef = useRef<ReaderTocItem | null>(null)
  const [selectedTocItem, setSelectedTocItem] = useState<ReaderTocItem | null>(
    null,
  )
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

  const [epubPositions, setEpubPositions] = useState<Locator[]>([])
  const [epubContentElements, setEpubContentElements] = useState<
    ReaderContentElement[]
  >([])

  useEffect(() => {
    let cancelled = false
    setEpubPositions([])
    setEpubContentElements([])
    setReadiumNavReady(false)
    setContentSettling(true)
    setCurrentLocator(null)
    setChapterTitle("")
    selectedTocItemRef.current = null
    setSelectedTocItem(null)

    void resolveEpubNavigationData(publication, isFixedLayout)
      .then(({ positions, contentElements }) => {
        if (cancelled) return
        setEpubPositions(positions)
        setEpubContentElements(contentElements)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.error("Failed to resolve EPUB positions.", error)
        setEpubPositions(createReadingOrderEpubPositions(publication))
        setEpubContentElements([])
      })

    return () => {
      cancelled = true
    }
  }, [publication, isFixedLayout])

  const readerPositions = useMemo(
    () => epubPositions.map(readiumLocatorToReaderLocator),
    [epubPositions],
  )

  const tocItems = useMemo(() => {
    const items = linksToTocItems(
      readiumLinksToReaderLinks(publication.toc),
      readerPositions,
    )
    return enhanceTocItemsWithContentLocators(items, epubContentElements)
  }, [epubContentElements, publication, readerPositions])

  const tocRows = useMemo(() => {
    return tocItems.map(tocItemToReadiumRow)
  }, [tocItems])

  const tocItemByKey = useMemo(() => {
    return new Map(tocItems.map((item) => [item.id, item]))
  }, [tocItems])

  const resolveChapterTitle = useCallback(
    (
      locator: Locator | null | undefined,
      selected: ReaderTocItem | null = null,
    ) => {
      if (!locator) return ""
      return (
        resolveReaderToc({
          toc: tocItems,
          positions: readerPositions,
          locator: readiumLocatorToReaderLocator(locator),
          selectedTocItem: selected,
          currentTitle: locator.title,
          fallbackTitle: locator.title,
        }).title ??
        locator.title?.trim() ??
        ""
      )
    },
    [readerPositions, tocItems],
  )

  const activeTocResolution = useMemo(() => {
    return resolveReaderToc({
      toc: tocItems,
      positions: readerPositions,
      locator: currentLocator
        ? readiumLocatorToReaderLocator(currentLocator)
        : undefined,
      currentTitle: chapterTitle,
      selectedTocItem,
      fallbackTitle: currentLocator?.title ?? chapterTitle,
    })
  }, [chapterTitle, currentLocator, readerPositions, selectedTocItem, tocItems])

  const activeTocKey = activeTocResolution.item?.id ?? null

  const setContentSettlingState = useCallback((settling: boolean) => {
    setContentSettling(settling)
    containerRef.current?.classList.toggle("is-content-settling", settling)
  }, [])

  const clearContentNavigationTimers = useCallback(() => {
    if (contentSettlingTimerRef.current != null) {
      window.clearTimeout(contentSettlingTimerRef.current)
      contentSettlingTimerRef.current = null
    }
    if (contentRevealRafRef.current != null) {
      window.cancelAnimationFrame(contentRevealRafRef.current)
      contentRevealRafRef.current = null
    }
  }, [])

  const clearPendingProgressSeek = useCallback(() => {
    if (progressSeekClearTimerRef.current != null) {
      window.clearTimeout(progressSeekClearTimerRef.current)
      progressSeekClearTimerRef.current = null
    }
    pendingProgressSeekRef.current = null
  }, [])

  const finishContentNavigation = useCallback(
    (sequence = navigationSequenceRef.current) => {
      if (sequence !== navigationSequenceRef.current) return
      clearContentNavigationTimers()
      contentRevealRafRef.current = window.requestAnimationFrame(() => {
        contentRevealRafRef.current = window.requestAnimationFrame(() => {
          if (sequence !== navigationSequenceRef.current) return
          contentRevealRafRef.current = null
          pendingNavigationHrefRef.current = null
          setContentSettlingState(false)
        })
      })
    },
    [clearContentNavigationTimers, setContentSettlingState],
  )

  const beginContentNavigation = useCallback(
    (targetLocator?: Locator | null) => {
      const sequence = navigationSequenceRef.current + 1
      navigationSequenceRef.current = sequence
      clearPendingProgressSeek()
      pendingNavigationHrefRef.current =
        targetLocator?.href?.split("#")[0] ?? null
      clearContentNavigationTimers()
      setContentSettlingState(true)
      contentSettlingTimerRef.current = window.setTimeout(() => {
        if (sequence !== navigationSequenceRef.current) return
        contentSettlingTimerRef.current = null
        pendingNavigationHrefRef.current = null
        setContentSettlingState(false)
      }, 2500)
      return sequence
    },
    [
      clearContentNavigationTimers,
      clearPendingProgressSeek,
      setContentSettlingState,
    ],
  )

  const finishContentNavigationForLocator = useCallback(
    (locator: Locator) => {
      const pendingHref = pendingNavigationHrefRef.current
      if (pendingHref && locator.href.split("#")[0] !== pendingHref) return
      finishContentNavigation()
    },
    [finishContentNavigation],
  )

  const beginContentNavigationForPageTurn = useCallback(
    (direction: "backward" | "forward") => {
      const nav = navigatorRef.current
      if (!nav) return null
      const shouldWaitForResource =
        isFixedLayout ||
        (direction === "backward" && nav.isScrollStart) ||
        (direction === "forward" && nav.isScrollEnd)
      if (!shouldWaitForResource) return null

      const currentHref = nav.currentLocator?.href?.split("#")[0]
      const currentIndex = publication.readingOrder.items.findIndex(
        (item) => item.href === currentHref,
      )
      const targetIndex =
        currentIndex < 0
          ? -1
          : direction === "forward"
            ? currentIndex + 1
            : currentIndex - 1
      const targetHref = publication.readingOrder.items[targetIndex]?.href
      if (!targetHref) return null
      const targetLocator =
        epubPositions.find((position) => position.href === targetHref) ?? null
      return beginContentNavigation(targetLocator)
    },
    [beginContentNavigation, epubPositions, isFixedLayout, publication],
  )

  const beginContentSettlingForPageTurn = useCallback(
    (direction: "backward" | "forward") => {
      return beginContentNavigationForPageTurn(direction)
    },
    [beginContentNavigationForPageTurn],
  )

  const revealFailedContentNavigation = useCallback(
    (sequence: number | null) => {
      if (sequence == null) return
      finishContentNavigation(sequence)
    },
    [finishContentNavigation],
  )

  const selectTocItemForNavigation = useCallback(
    (row: ReadiumTocRow) => {
      const item = row.key ? (tocItemByKey.get(row.key) ?? null) : null
      selectedTocItemRef.current = item
      setSelectedTocItem(item)
      return item
    },
    [tocItemByKey],
  )

  const onTocSelect = useCallback(
    async (row: ReadiumTocRow) => {
      const nav = navigatorRef.current
      if (!nav) return
      const selectedItem = selectTocItemForNavigation(row)
      if (isFixedLayout) {
        const targetIndex = tocTargetReadingOrderIndex(publication, row)
        if (targetIndex >= 0) {
          const sequence = beginContentNavigation(
            epubPositions[targetIndex] ?? null,
          )
          await goToReadingOrderPositionBySteps(nav, targetIndex + 1)
          finishContentNavigation(sequence)
          closePanels()
          return
        }
      }
      const locator =
        selectedItem?.locatorSource === "content" && selectedItem.locator
          ? readerLocatorToReadiumLocator(selectedItem.locator)
          : tocTargetToLocator(publication, row)
      if (!locator) return
      const sequence = beginContentNavigation(locator)
      nav.go(locator, false, () => {
        finishContentNavigation(sequence)
      })
      closePanels()
    },
    [
      beginContentNavigation,
      closePanels,
      epubPositions,
      finishContentNavigation,
      isFixedLayout,
      publication,
      selectTocItemForNavigation,
    ],
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
  const { nearLeft, nearRight } = useReaderPaginateEdgeHover(
    edgeTurnActive,
    readerRootRef,
  )

  const onReadiumEdgePrev = useCallback(() => {
    const sequence = beginContentSettlingForPageTurn("backward")
    navigatorRef.current?.goBackward(false, (ok) => {
      if (!ok) revealFailedContentNavigation(sequence)
    })
  }, [beginContentSettlingForPageTurn, revealFailedContentNavigation])

  const onReadiumEdgeNext = useCallback(() => {
    const sequence = beginContentSettlingForPageTurn("forward")
    navigatorRef.current?.goForward(false, (ok) => {
      if (!ok) revealFailedContentNavigation(sequence)
    })
  }, [beginContentSettlingForPageTurn, revealFailedContentNavigation])

  const onProgressSeek = useCallback(
    (progress: number) => {
      const nav = navigatorRef.current
      if (!nav || epubPositions.length === 0) return
      const normalized = Math.max(0, Math.min(100, progress)) / 100
      const targetIndex = Math.round(normalized * (epubPositions.length - 1))
      const targetLocator = isFixedLayout
        ? epubPositions[targetIndex]
        : createEpubProgressSeekLocator(epubPositions, targetIndex)
      if (!targetLocator) return
      const sequence = beginContentNavigation(targetLocator)
      pendingProgressSeekRef.current = { sequence, locator: targetLocator }
      progressSeekClearTimerRef.current = window.setTimeout(() => {
        if (pendingProgressSeekRef.current?.sequence !== sequence) return
        clearPendingProgressSeek()
      }, 3000)
      nav.go(targetLocator, false, () => {
        finishContentNavigation(sequence)
      })
    },
    [
      beginContentNavigation,
      clearPendingProgressSeek,
      epubPositions,
      finishContentNavigation,
      isFixedLayout,
    ],
  )
  const resolveProgressCommit = useCallback(
    (progress: number) => {
      if (epubPositions.length <= 1) return 0
      const normalized = Math.max(0, Math.min(100, progress)) / 100
      const targetIndex = Math.round(normalized * (epubPositions.length - 1))
      return (targetIndex / (epubPositions.length - 1)) * 100
    },
    [epubPositions.length],
  )

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
    if (epubPositions.length === 0) return
    let cancelled = false
    let nav: EpubNavigator | null = null

    async function init() {
      try {
        setInitError(null)
        setReadiumNavReady(false)
        const container = containerRef.current!
        if (publication.readingOrder.items.length === 0) {
          throw new Error("Publication has no reading order items")
        }

        const initialPosition = resolveInitialEpubPosition(
          epubPositions,
          initialSavedLocator,
        )
        if (!initialPosition) {
          throw new Error("Publication has no positions")
        }

        await refreshReaderPreferencesBeforeNavigatorInit()
        if (cancelled) return
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

        nav = new EpubNavigator(
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
              const selected = selectedTocItemRef.current
              selectedTocItemRef.current = null
              setSelectedTocItem(selected)
              const pendingSeek = pendingProgressSeekRef.current
              const stableLocator =
                pendingSeek &&
                pendingSeek.sequence === navigationSequenceRef.current &&
                locatorHref(locator) === locatorHref(pendingSeek.locator) &&
                isLocatorVisibleInViewport(
                  navigatorRef.current,
                  pendingSeek.locator,
                )
                  ? pendingSeek.locator
                  : locator
              setCurrentLocator(stableLocator)
              setChapterTitle(resolveChapterTitle(stableLocator, selected))
              finishContentNavigationForLocator(stableLocator)
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
                if (isRtl) {
                  const sequence = beginContentSettlingForPageTurn("backward")
                  nav2.goBackward(false, (ok) => {
                    if (!ok) revealFailedContentNavigation(sequence)
                  })
                } else {
                  const sequence = beginContentSettlingForPageTurn("forward")
                  nav2.goForward(false, (ok) => {
                    if (!ok) revealFailedContentNavigation(sequence)
                  })
                }
              } else if (
                key === "ArrowLeft" ||
                key === "PageUp" ||
                rec.keyCode === 37
              ) {
                if (isRtl) {
                  const sequence = beginContentSettlingForPageTurn("forward")
                  nav2.goForward(false, (ok) => {
                    if (!ok) revealFailedContentNavigation(sequence)
                  })
                } else {
                  const sequence = beginContentSettlingForPageTurn("backward")
                  nav2.goBackward(false, (ok) => {
                    if (!ok) revealFailedContentNavigation(sequence)
                  })
                }
              }
            },
          },
          epubPositions,
          initialPosition,
          navigatorConfiguration,
        )
        if (isFixedLayout) {
          patchEpubNavigatorFixedLayoutGoNav(nav)
        }
        const activeNav = nav
        const initialSequence = beginContentNavigation(initialPosition)
        await activeNav.load()
        if (cancelled) return
        requestAnimationFrame(() => {
          void activeNav.resizeHandler()
          requestAnimationFrame(() => {
            void activeNav.resizeHandler()
          })
        })
        navigatorRef.current = activeNav
        setReadiumNavReady(true)
        const store = useAppUiStore.getState()
        if (store.readerPreferencesHydrated && isFixedLayout) {
          await applySpreadPreference(activeNav, store.fixedLayout.spreadMode)
        }
        if (cancelled) return
        setCurrentLocator(activeNav.currentLocator)
        setChapterTitle(resolveChapterTitle(activeNav.currentLocator))
        finishContentNavigation(initialSequence)
      } catch (e) {
        if (cancelled) return
        console.error("[Readium] Failed to initialize navigator:", e)
        setInitError(String(e))
      }
    }

    void init()

    return () => {
      cancelled = true
      navigationSequenceRef.current += 1
      pendingNavigationHrefRef.current = null
      clearPendingProgressSeek()
      clearContentNavigationTimers()
      setReadiumNavReady(false)
      const activeNavigator = navigatorRef.current ?? nav
      navigatorRef.current = null
      void activeNavigator?.destroy()
    }
  }, [
    publication,
    initialSavedLocator,
    epubPositions,
    showChrome,
    epubNavigatorDefaults,
    isFixedLayout,
    readerLanguage,
    readerPreferencesHydrated,
    beginContentNavigation,
    beginContentSettlingForPageTurn,
    clearContentNavigationTimers,
    clearPendingProgressSeek,
    finishContentNavigation,
    finishContentNavigationForLocator,
    getCurrentReflowableFontFamily,
    revealFailedContentNavigation,
    resolveChapterTitle,
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

  const bottomPositionTotal = isFixedLayout
    ? publication.readingOrder.items.length
    : epubPositions.length
  const bottomPositionCurrent =
    currentLocator?.locations?.position ??
    (currentLocator?.locations?.totalProgression != null &&
    bottomPositionTotal > 1
      ? Math.round(
          (currentLocator.locations.totalProgression ?? 0) *
            (bottomPositionTotal - 1),
        ) + 1
      : 1)
  const getProgressPreview = useCallback(
    (nextProgress: number) => {
      const total = bottomPositionTotal
      if (total <= 0) return { label: "" }
      const targetIndex = Math.max(
        0,
        Math.min(
          total - 1,
          Math.round(
            (Math.max(0, Math.min(100, nextProgress)) / 100) * (total - 1),
          ),
        ),
      )
      const current = targetIndex + 1

      if (isFixedLayout) {
        const row = tocRows.find(
          (tocRow) =>
            tocTargetReadingOrderIndex(publication, tocRow) === targetIndex,
        )
        const chapterTitle =
          row?.title ??
          publication.readingOrder.items[targetIndex]?.title?.trim() ??
          undefined
        return {
          chapterTitle,
          label: t("reader.pageCount", { current, total }),
        }
      }

      const targetLocator = epubPositions[targetIndex]
      const targetHref = targetLocator?.href?.split("#")[0] ?? ""
      const readingOrderIndex = publication.readingOrder.items.findIndex(
        (item) => item.href === targetHref,
      )
      const fallbackTitle =
        targetLocator?.title ??
        publication.readingOrder.items[readingOrderIndex]?.title?.trim() ??
        undefined
      const chapterTitle =
        resolveReaderTocAtPosition({
          toc: tocItems,
          positions: readerPositions,
          positionIndex: targetIndex,
          fallbackTitle,
        }).title?.trim() || fallbackTitle

      return {
        chapterTitle,
        label: t("reader.positionCount", { current, total }),
      }
    },
    [
      bottomPositionTotal,
      epubPositions,
      isFixedLayout,
      publication,
      readerPositions,
      t,
      tocItems,
      tocRows,
    ],
  )

  return (
    <ReaderChromeShell
      readerRootRef={readerRootRef}
      chromeVisible={chromeVisible}
      showChrome={showChrome}
      scheduleChromeHide={scheduleChromeHide}
      panelsOpen={tocOpen || settingsOpen}
      onClosePanels={closePanels}
      theme={readerSettings.theme}
      readerMode={isFixedLayout ? "fixed-layout" : undefined}
      topBar={{
        bookTitle,
        chapterTitle,
        bookmarked,
        tocOpen,
        settingsOpen,
        onToggleToc: toggleToc,
        onToggleBookmark: () => setBookmarked((b) => !b),
        onToggleSettings: toggleSettings,
      }}
      tocPanel={
        <ReadiumTocPanel
          visible={tocOpen}
          rows={tocRows}
          activeKey={activeTocKey}
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
        .readium-epub-host.is-content-settling > .readium-navigator-iframe {
          opacity: 0 !important;
          pointer-events: none !important;
          visibility: hidden !important;
        }
      `}</style>
      }
      edgeTurnOverlays={
        readerSettings.readingLayout !== "scroll" ? (
          <ReaderPaginateEdgeTurnStrips
            direction={isRtl ? "rtl" : "ltr"}
            showPrev={isRtl ? nearRight : nearLeft}
            showNext={isRtl ? nearLeft : nearRight}
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
          direction={isRtl ? "rtl" : "ltr"}
          leftText={
            isFixedLayout
              ? t("reader.pageCount", {
                  current: bottomPositionCurrent,
                  total: bottomPositionTotal,
                })
              : bottomPositionTotal > 0
                ? t("reader.positionCount", {
                    current: bottomPositionCurrent,
                    total: bottomPositionTotal,
                  })
                : undefined
          }
          progress={
            currentLocator?.locations?.totalProgression != null
              ? (currentLocator.locations.totalProgression ?? 0) * 100
              : isFixedLayout && publication.readingOrder.items.length > 1
                ? (((currentLocator?.locations?.position ?? 1) - 1) /
                    (publication.readingOrder.items.length - 1)) *
                  100
                : undefined
          }
          getProgressPreview={getProgressPreview}
          resolveProgressCommit={resolveProgressCommit}
          onProgressChange={onProgressSeek}
          onProgressStepBackward={onReadiumEdgePrev}
          onProgressStepForward={onReadiumEdgeNext}
        />
      }
      main={
        <div className="relative min-h-0 min-w-0 w-full flex-1 basis-0 overflow-hidden">
          <div
            ref={containerRef}
            className={cn(
              "readium-epub-host absolute inset-0 overflow-hidden",
              contentSettling && "is-content-settling",
            )}
          />
          {contentSettling ? (
            <div
              className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-reader-chrome-fg/70"
              role="status"
              aria-label={t("reader.loadingBook")}
            >
              <Loader2 className="size-7 animate-spin" aria-hidden />
            </div>
          ) : null}
        </div>
      }
    />
  )
}
