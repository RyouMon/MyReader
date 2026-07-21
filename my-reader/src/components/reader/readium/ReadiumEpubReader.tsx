import {
  type ReaderAnnotationColor,
  readerAnnotationExcerpt,
  sortReaderAnnotations,
} from "@my-reader/tools/reader-annotations"
import { readerChromePalette } from "@my-reader/tools/reader-chrome-palette"
import {
  READER_THEME_PRESETS,
  readerThemePresetFor,
} from "@my-reader/tools/reader-themes"
import {
  enhanceTocItemsWithContentLocators,
  linksToTocItems,
  type ReaderContentElement,
  type ReaderLink,
  type ReaderLocator,
  type ReaderTocItem,
  resolveReaderToc,
  resolveReaderTocAtPosition,
} from "@my-reader/tools/reader-toc"
import { EpubNavigator } from "@readium/navigator"
import type { BasicTextSelection } from "@readium/navigator-html-injectables"
import {
  Layout,
  type Links,
  Locator,
  LocatorLocations,
  LocatorText,
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
  ReaderAnnotationEditorDialog,
  type ReaderAnnotationEditorDraft,
} from "@/components/reader/readium/ReaderAnnotationEditorDialog"
import { ReaderSelectionMenu } from "@/components/reader/readium/ReaderSelectionMenu"
import {
  ReadiumAnnotationPanel,
  type ReadiumAnnotationRow,
} from "@/components/reader/readium/ReadiumAnnotationPanel"
import type { ReadiumBookmarkRow } from "@/components/reader/readium/ReadiumBookmarkList"
import { ReadiumBookmarkPanel } from "@/components/reader/readium/ReadiumBookmarkPanel"
import { ReadiumSearchPanel } from "@/components/reader/readium/ReadiumSearchPanel"
import {
  ReadiumTocPanel,
  type ReadiumTocRow,
} from "@/components/reader/readium/ReadiumTocPanel"
import { ReaderBottomStatusBar } from "@/components/reader/shared/ReaderBottomStatusBar"
import { ReaderChromeShell } from "@/components/reader/shared/ReaderChromeShell"
import { ReaderPaginateEdgeTurnStrips } from "@/components/reader/shared/ReaderPaginateEdgeTurnStrips"
import { ReaderSettingsRangeControl } from "@/components/reader/shared/ReaderSettingsRangeControl"
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
import {
  type ReaderAnnotation,
  useReaderAnnotations,
} from "@/hooks/reader/useReaderAnnotations"
import { useReaderBookmarks } from "@/hooks/reader/useReaderBookmarks"
import { useReaderIframePointerBridge } from "@/hooks/reader/useReaderIframePointerBridge"
import { useReaderPaginateEdgeHover } from "@/hooks/reader/useReaderPaginateEdgeHover"
import { useReaderPanels } from "@/hooks/reader/useReaderPanels"
import { useReaderSearch } from "@/hooks/reader/useReaderSearch"
import { useReadingChrome } from "@/hooks/reader/useReadingChrome"
import {
  displayProgressionForPosition,
  positionForDisplayProgressPercent,
} from "@/lib/readingProgress"
import { deserializeReaderBookmarkLocator } from "@/lib/readium/bookmarks"
import {
  applyEpubAnnotations,
  clearEpubTextSelection,
  connectEpubAnnotationClickBridge,
  connectEpubTextSelectionChangeBridge,
  createEpubAnnotationSelection,
  type EpubAnnotationSelection,
  epubAnnotationMatchesSelection,
  suppressEpubTextSelectionContextMenu,
} from "@/lib/readium/epubAnnotations"
import {
  captureEpubBookmarkLocator,
  isEpubBookmarkVisible,
  type ReaderViewportAnchorOffset,
  readerViewportAnchorOffset,
  restoreReaderViewportAnchorOffset,
  waitForEpubViewportLayout,
} from "@/lib/readium/epubBookmarkAnchor"
import {
  type EpubTextResource,
  extractEpubContentLocators,
} from "@/lib/readium/epubContentLocators"
import { patchEpubNavigatorFixedLayoutGoNav } from "@/lib/readium/epubFixedLayoutNavPatch"
import {
  applySpreadPreference,
  epubNavigatorDefaultsForLayout,
  epubPreferencesForSpread,
  type ReflowThemePreset,
  type SpreadPreference,
} from "@/lib/readium/epubReaderPrefs"
import { EpubSearchService } from "@/lib/readium/epubSearch"
import {
  applyEpubSearchHighlight,
  clearEpubSearchHighlight,
} from "@/lib/readium/epubSearchHighlight"
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

type ReflowableViewportAnchor = {
  locator: ReaderLocator
  offset: ReaderViewportAnchorOffset | null
}

function reflowableLayoutPreferenceKey(
  settings: ReaderSettings,
  language: string,
): string {
  return JSON.stringify({
    columnCount: settings.colCount,
    fontFamily: resolveReaderFont(language, settings),
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    paddingX: settings.paddingX,
    readingLayout: settings.readingLayout,
    textAlign: settings.textAlign,
  })
}

function goToEpubLocator(
  navigator: EpubNavigator,
  locator: Locator,
): Promise<boolean> {
  return new Promise((resolve) => {
    navigator.go(locator, false, resolve)
  })
}

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
  const otherLocations = locator.locations.otherLocations
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
            cssSelector: otherLocations?.get("cssSelector"),
            partialCfi: otherLocations?.get("partialCfi"),
            domRange: otherLocations?.get("domRange"),
            otherLocations,
          },
        }
      : { locations: { progression: 0 } }),
    text: locator.text,
  }
}

function readerLocatorToReadiumLocator(locator: ReaderLocator): Locator {
  const [href, hrefFragment] = locator.href.split("#", 2)
  const fragments = locator.locations?.fragments ?? []
  const otherLocations = new Map<string, unknown>()
  const sourceOtherLocations = locator.locations?.otherLocations
  if (sourceOtherLocations instanceof Map) {
    sourceOtherLocations.forEach((value, key) => {
      otherLocations.set(key, value)
    })
  } else if (sourceOtherLocations) {
    Object.entries(sourceOtherLocations).forEach(([key, value]) => {
      otherLocations.set(key, value)
    })
  }
  if (locator.locations?.cssSelector) {
    otherLocations.set("cssSelector", locator.locations.cssSelector)
  }
  if (locator.locations?.partialCfi) {
    otherLocations.set("partialCfi", locator.locations.partialCfi)
  }
  if (locator.locations?.domRange) {
    otherLocations.set("domRange", locator.locations.domRange)
  }
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
      otherLocations: otherLocations.size > 0 ? otherLocations : undefined,
    }),
    text: locator.text ? new LocatorText(locator.text) : undefined,
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
): Promise<{
  positions: Locator[]
  contentElements: ReaderContentElement[]
  resources: EpubTextResource[]
}> {
  const resourcesPromise = isFixedLayout
    ? Promise.resolve([])
    : loadEpubTextResources(publication)
  const positions = await resolveEpubPositions(publication, isFixedLayout)
  const resources = await resourcesPromise
  return {
    positions,
    resources,
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

function hasReaderTextSelection(): boolean {
  return getIframeDocs().some((doc) => {
    const selection = doc.getSelection()
    return Boolean(
      selection && !selection.isCollapsed && selection.toString().trim(),
    )
  })
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
    iframe: HTMLIFrameElement
    container: HTMLElement
    isScrollMode: boolean
    paddingX: number
    getChromeVisible: () => boolean
    getCurrentFontFamily: () => string | null | undefined
    getAnnotations: () => readonly ReaderAnnotation[]
    onAnnotationClick: (selection: EpubAnnotationSelection) => void
    onAnnotationNoteClick: (annotationId: string) => void
    onSelectionCleared: () => void
    noteMarkerAccessibilityLabel: string
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
    const stopSelectedTextContextMenu =
      suppressEpubTextSelectionContextMenu(wnd)
    const stopAnnotationClickBridge = connectEpubAnnotationClickBridge(wnd, {
      iframe: opts.iframe,
      container: opts.container,
      getAnnotations: opts.getAnnotations,
      onAnnotationClick: opts.onAnnotationClick,
      onAnnotationNoteClick: opts.onAnnotationNoteClick,
      onOutsideClick: opts.onSelectionCleared,
      noteMarkerAccessibilityLabel: opts.noteMarkerAccessibilityLabel,
    })
    const stopTextSelectionChangeBridge = connectEpubTextSelectionChangeBridge(
      wnd,
      opts.onSelectionCleared,
    )
    const onMove = (e: PointerEvent) => {
      const nearRight = wnd.innerWidth - e.clientX < 20
      doc.documentElement.classList.toggle(
        "reader-scrollbar-visible",
        opts.getChromeVisible() || nearRight,
      )
    }
    wnd.addEventListener("pointermove", onMove)
    return () => {
      stopSelectedTextContextMenu()
      stopAnnotationClickBridge()
      stopTextSelectionChangeBridge()
      wnd.removeEventListener("pointermove", onMove)
      setupIframeDocuments.delete(doc)
    }
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

            <ReaderSettingsRangeControl
              id="readium-font-size"
              label={t("reader.fontSize")}
              value={readerSettings.fontSize}
              min={14}
              max={26}
              step={1}
              className={RANGE_INPUT_CLASS}
              labelClassName={READER_SETTINGS_LABEL_CLASS}
              valueClassName={READER_SETTINGS_VALUE_CLASS}
              formatValue={(value) => `${value} px`}
              rangeStyle={readerSettingsRangeStyle}
              onCommit={(fontSize) => patchReflowableSettings({ fontSize })}
            />

            <ReaderSettingsRangeControl
              id="readium-page-margin"
              label={t("reader.margin")}
              value={readerSettings.paddingX}
              min={0}
              max={4}
              step={0.25}
              className={RANGE_INPUT_CLASS}
              labelClassName={READER_SETTINGS_LABEL_CLASS}
              valueClassName={READER_SETTINGS_VALUE_CLASS}
              formatValue={(value) => value.toFixed(1)}
              rangeStyle={readerSettingsRangeStyle}
              onCommit={(paddingX) => patchReflowableSettings({ paddingX })}
            />

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
  const noteMarkerAccessibilityLabel = t("reader.openNote")
  const containerRef = useRef<HTMLDivElement>(null)
  const navigatorRef = useRef<EpubNavigator | null>(null)
  const {
    tocOpen,
    bookmarksOpen,
    annotationsOpen,
    searchOpen,
    settingsOpen,
    toggleToc,
    toggleBookmarks,
    toggleAnnotations,
    toggleSearch,
    toggleSettings,
    closePanels,
  } = useReaderPanels()
  const {
    readerRootRef,
    chromeVisible,
    showChrome,
    scheduleChromeHide,
    handlePointerPosition,
  } = useReadingChrome(
    false,
    tocOpen || bookmarksOpen || annotationsOpen || searchOpen || settingsOpen,
  )
  const [readiumNavReady, setReadiumNavReady] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [chapterTitle, setChapterTitle] = useState("")
  const [currentLocator, setCurrentLocator] = useState<Locator | null>(null)
  const readerSettings = useAppUiStore((s) => s.reflowable.settings)
  const isFixedLayout = useMemo(
    () => EpubNavigator.determineLayout(publication, false) === Layout.fixed,
    [publication],
  )
  const captureCurrentBookmarkLocator = useCallback(async () => {
    const navigator = navigatorRef.current
    if (!navigator || isFixedLayout) return null
    return captureEpubBookmarkLocator(
      navigator,
      readiumLocatorToReaderLocator(navigator.currentLocator),
    )
  }, [isFixedLayout])
  const isBookmarkLocatorVisible = useCallback(
    async (locator: ReaderLocator) => {
      const navigator = navigatorRef.current
      return Boolean(
        navigator &&
          !isFixedLayout &&
          isEpubBookmarkVisible(navigator, locator),
      )
    },
    [isFixedLayout],
  )
  const readerBookmarks = useReaderBookmarks({
    libraryId,
    bookId,
    format,
    currentLocator,
    ...(isFixedLayout
      ? {}
      : {
          captureCurrentLocator: captureCurrentBookmarkLocator,
          isLocatorVisible: isBookmarkLocatorVisible,
          visibilityRevision: JSON.stringify(readerSettings),
        }),
  })
  const readerAnnotations = useReaderAnnotations({
    libraryId,
    bookId,
    format,
    enabled: true,
  })
  const annotationsRef = useRef(readerAnnotations.annotations)
  const [annotationsAvailable, setAnnotationsAvailable] = useState(false)
  const [annotationSelection, setAnnotationSelection] =
    useState<EpubAnnotationSelection | null>(null)
  const [annotationEditor, setAnnotationEditor] = useState<
    | { mode: "create"; selection: EpubAnnotationSelection }
    | { mode: "edit"; annotation: ReaderAnnotation }
    | null
  >(null)
  const [contentSettling, setContentSettling] = useState(true)
  const chromeVisibleRef = useRef(chromeVisible)
  const reflowablePreferenceApplyRef = useRef(0)
  const reflowableViewportAnchorRef = useRef<ReflowableViewportAnchor | null>(
    null,
  )
  const pendingReflowableLocatorRef = useRef<Locator | null>(null)
  const appliedReflowableLayoutKeyRef = useRef<string | null>(null)
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

  useEffect(() => {
    annotationsRef.current = readerAnnotations.annotations
    const navigator = navigatorRef.current
    if (navigator)
      applyEpubAnnotations(
        navigator,
        readerAnnotations.annotations,
        noteMarkerAccessibilityLabel,
      )
  }, [noteMarkerAccessibilityLabel, readerAnnotations.annotations])

  useEffect(() => {
    void bookId
    void format
    void libraryId
    setAnnotationSelection(null)
    setAnnotationEditor(null)
    setAnnotationsAvailable(false)
  }, [bookId, format, libraryId])

  const readerPreferencesHydrated = useAppUiStore(
    (s) => s.readerPreferencesHydrated,
  )
  const spreadMode = useAppUiStore((s) => s.fixedLayout.spreadMode)
  const patchReflowableSettings = useAppUiStore(
    (s) => s.patchReflowableSettings,
  )
  const searchHighlightTint = useMemo(() => {
    const preset = readerThemePresetFor(readerSettings.theme)
    return readerChromePalette(preset.foregroundColor, preset.backgroundColor)
      .accent
  }, [readerSettings.theme])

  const readerLanguage = useMemo(
    () => resolveReaderLanguage(publication.metadata.languages),
    [publication.metadata.languages],
  )

  const epubNavigatorDefaults = useMemo(
    () => epubNavigatorDefaultsForLayout(isFixedLayout),
    [isFixedLayout],
  )

  const [epubPositions, setEpubPositions] = useState<Locator[]>([])
  const [epubContentElements, setEpubContentElements] = useState<
    ReaderContentElement[]
  >([])
  const [epubTextResources, setEpubTextResources] = useState<
    EpubTextResource[]
  >([])

  useEffect(() => {
    let cancelled = false
    setEpubPositions([])
    setEpubContentElements([])
    setEpubTextResources([])
    setReadiumNavReady(false)
    setContentSettling(true)
    setCurrentLocator(null)
    setChapterTitle("")
    reflowablePreferenceApplyRef.current += 1
    reflowableViewportAnchorRef.current = null
    pendingReflowableLocatorRef.current = null
    appliedReflowableLayoutKeyRef.current = null
    selectedTocItemRef.current = null
    setSelectedTocItem(null)

    void resolveEpubNavigationData(publication, isFixedLayout)
      .then(({ positions, contentElements, resources }) => {
        if (cancelled) return
        setEpubPositions(positions)
        setEpubContentElements(contentElements)
        setEpubTextResources(resources)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.error("Failed to resolve EPUB positions.", error)
        setEpubPositions(createReadingOrderEpubPositions(publication))
        setEpubContentElements([])
        setEpubTextResources([])
      })

    return () => {
      cancelled = true
    }
  }, [publication, isFixedLayout])

  const readerPositions = useMemo(
    () => epubPositions.map(readiumLocatorToReaderLocator),
    [epubPositions],
  )

  const epubSearchService = useMemo(
    () =>
      !isFixedLayout && epubTextResources.length > 0
        ? new EpubSearchService(epubTextResources, readerPositions)
        : null,
    [epubTextResources, isFixedLayout, readerPositions],
  )
  const {
    capabilities: searchCapabilities,
    query: searchQuery,
    setQuery: setSearchQuery,
    locators: searchLocators,
    resultCount: searchResultCount,
    done: searchDone,
    loading: searchLoading,
    error: searchError,
    status: searchStatus,
    activeLocator: activeSearchLocator,
    selectLocator: selectSearchLocator,
    search: searchInBook,
    loadMore: loadMoreSearchResults,
    clear: clearSearch,
  } = useReaderSearch(epubSearchService)

  useEffect(() => {
    const navigator = navigatorRef.current
    if (!epubSearchService && navigator) {
      clearEpubSearchHighlight(navigator)
    }
    return () => {
      const activeNavigator = navigatorRef.current
      if (activeNavigator) clearEpubSearchHighlight(activeNavigator)
    }
  }, [epubSearchService])

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

  const bookmarkRows = useMemo<ReadiumBookmarkRow[]>(
    () =>
      readerBookmarks.bookmarks.map((bookmark) => ({
        ...bookmark,
        chapterTitle: resolveReaderToc({
          toc: tocItems,
          positions: readerPositions,
          locator: bookmark.locator,
        }).title?.trim(),
      })),
    [readerBookmarks.bookmarks, readerPositions, tocItems],
  )

  const annotationRows = useMemo<ReadiumAnnotationRow[]>(
    () =>
      sortReaderAnnotations(readerAnnotations.annotations, readerPositions).map(
        (annotation) => ({
          id: annotation.id,
          locator: annotation.locator,
          excerpt: readerAnnotationExcerpt(annotation.locator),
          note: annotation.note,
          color: annotation.color,
          createdAt: annotation.createdAt,
        }),
      ),
    [readerAnnotations.annotations, readerPositions],
  )

  const annotationEditorDraft =
    useMemo<ReaderAnnotationEditorDraft | null>(() => {
      if (!annotationEditor) return null
      if (annotationEditor.mode === "create") {
        return {
          excerpt: readerAnnotationExcerpt(annotationEditor.selection.locator),
          color: "yellow",
          note: "",
          createdAt: Date.now(),
        }
      }
      return {
        id: annotationEditor.annotation.id,
        excerpt: readerAnnotationExcerpt(annotationEditor.annotation.locator),
        color: annotationEditor.annotation.color,
        note: annotationEditor.annotation.note ?? "",
        createdAt: annotationEditor.annotation.createdAt,
      }
    }, [annotationEditor])

  const selectedAnnotation = useMemo(() => {
    if (!annotationSelection) return undefined
    return readerAnnotations.annotations.find((annotation) =>
      epubAnnotationMatchesSelection(
        annotation.locator,
        annotationSelection.locator,
      ),
    )
  }, [annotationSelection, readerAnnotations.annotations])

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

  const onBookmarkSelect = useCallback(
    async (bookmark: ReadiumBookmarkRow) => {
      const nav = navigatorRef.current
      const locator = deserializeReaderBookmarkLocator(bookmark.locator)
      if (!nav || !locator) return

      const sequence = beginContentNavigation(locator)
      const position = locator.locations.position
      if (
        isFixedLayout &&
        typeof position === "number" &&
        Number.isFinite(position) &&
        position >= 1
      ) {
        const targetPosition = Math.min(
          publication.readingOrder.items.length,
          Math.floor(position),
        )
        await goToReadingOrderPositionBySteps(nav, targetPosition)
        finishContentNavigation(sequence)
      } else {
        nav.go(locator, false, () => finishContentNavigation(sequence))
      }
      closePanels()
    },
    [
      beginContentNavigation,
      closePanels,
      finishContentNavigation,
      isFixedLayout,
      publication.readingOrder.items.length,
    ],
  )

  const onAnnotationSelect = useCallback(
    async (annotation: ReadiumAnnotationRow) => {
      const navigator = navigatorRef.current
      if (!navigator) return
      const locator = readerLocatorToReadiumLocator(annotation.locator)
      const sequence = beginContentNavigation(locator)
      const position = locator.locations.position
      if (
        isFixedLayout &&
        typeof position === "number" &&
        Number.isFinite(position) &&
        position >= 1
      ) {
        await goToReadingOrderPositionBySteps(
          navigator,
          Math.min(publication.readingOrder.items.length, Math.floor(position)),
        )
        finishContentNavigation(sequence)
      } else {
        navigator.go(locator, false, () => finishContentNavigation(sequence))
      }
      closePanels()
    },
    [
      beginContentNavigation,
      closePanels,
      finishContentNavigation,
      isFixedLayout,
      publication.readingOrder.items.length,
    ],
  )

  const onAnnotationEdit = useCallback(
    (row: ReadiumAnnotationRow) => {
      const annotation = readerAnnotations.annotations.find(
        (item) => item.id === row.id,
      )
      if (!annotation) return
      closePanels()
      setAnnotationEditor({ mode: "edit", annotation })
    },
    [closePanels, readerAnnotations.annotations],
  )

  const onTextSelected = useCallback(
    (selection: BasicTextSelection) => {
      const navigator = navigatorRef.current
      const container = containerRef.current
      if (!navigator || !container) return
      const annotationSelection = createEpubAnnotationSelection(
        navigator,
        selection,
        container,
        undefined,
        undefined,
        readerPositions,
      )
      if (!annotationSelection) return
      setAnnotationSelection(annotationSelection)
    },
    [readerPositions],
  )

  const onAnnotationClick = useCallback(
    (selection: EpubAnnotationSelection) => {
      setAnnotationSelection(selection)
    },
    [],
  )

  const onAnnotationNoteClick = useCallback((annotationId: string) => {
    const annotation = annotationsRef.current.find(
      (item) => item.id === annotationId && item.note?.trim(),
    )
    if (!annotation) return
    setAnnotationSelection(null)
    setAnnotationEditor({ mode: "edit", annotation })
  }, [])

  const setSelectionHighlightColor = useCallback(
    async (color: ReaderAnnotationColor) => {
      const selection = annotationSelection
      if (!selection) return
      const saved = selectedAnnotation
        ? selectedAnnotation.color === color
          ? selectedAnnotation
          : await readerAnnotations.updateAnnotation(selectedAnnotation, {
              color,
              note: selectedAnnotation.note,
            })
        : await readerAnnotations.addAnnotation({
            locator: selection.locator,
            color,
          })
      if (!saved) return
      clearEpubTextSelection(selection)
      setAnnotationSelection(null)
    },
    [annotationSelection, readerAnnotations, selectedAnnotation],
  )

  const openSelectionNoteEditor = useCallback(() => {
    if (!annotationSelection) return
    clearEpubTextSelection(annotationSelection)
    setAnnotationEditor(
      selectedAnnotation
        ? { mode: "edit", annotation: selectedAnnotation }
        : { mode: "create", selection: annotationSelection },
    )
    setAnnotationSelection(null)
  }, [annotationSelection, selectedAnnotation])

  const removeSelectionAnnotation = useCallback(async () => {
    const selection = annotationSelection
    const annotation = selectedAnnotation
    if (!selection || !annotation) return
    const deleted = await readerAnnotations.deleteAnnotation(annotation)
    if (deleted === undefined) return
    clearEpubTextSelection(selection)
    setAnnotationSelection(null)
  }, [annotationSelection, readerAnnotations, selectedAnnotation])

  const handleSelectionMenuOpenChange = useCallback((open: boolean) => {
    if (open) return
    setAnnotationSelection((selection) => {
      if (selection) clearEpubTextSelection(selection)
      return null
    })
  }, [])

  const saveAnnotationEditor = useCallback(
    async (value: { color: ReaderAnnotationColor; note: string }) => {
      if (!annotationEditor) return
      const saved =
        annotationEditor.mode === "create"
          ? await readerAnnotations.addAnnotation({
              locator: annotationEditor.selection.locator,
              color: value.color,
              note: value.note,
            })
          : await readerAnnotations.updateAnnotation(
              annotationEditor.annotation,
              value,
            )
      if (saved) setAnnotationEditor(null)
    },
    [annotationEditor, readerAnnotations],
  )

  const deleteAnnotationEditor = useCallback(async () => {
    if (annotationEditor?.mode !== "edit") return
    const deleted = await readerAnnotations.deleteAnnotation(
      annotationEditor.annotation,
    )
    if (deleted !== undefined) setAnnotationEditor(null)
  }, [annotationEditor, readerAnnotations])

  const onSearchSubmit = useCallback(() => {
    const navigator = navigatorRef.current
    if (navigator) clearEpubSearchHighlight(navigator)
    void searchInBook()
  }, [searchInBook])

  const onSearchClear = useCallback(() => {
    const navigator = navigatorRef.current
    if (navigator) clearEpubSearchHighlight(navigator)
    clearSearch()
  }, [clearSearch])

  const onSearchSelect = useCallback(
    (readerLocator: ReaderLocator) => {
      const nav = navigatorRef.current
      if (!nav) return

      const locator = readerLocatorToReadiumLocator(readerLocator)
      const sequence = beginContentNavigation(locator)
      clearEpubSearchHighlight(nav)
      selectSearchLocator(readerLocator)
      nav.go(locator, false, (ok) => {
        finishContentNavigation(sequence)
        if (sequence !== navigationSequenceRef.current) return
        if (!ok) return
        window.requestAnimationFrame(() => {
          if (sequence !== navigationSequenceRef.current) return
          if (!applyEpubSearchHighlight(nav, locator, searchHighlightTint)) {
            console.warn("Failed to highlight the active EPUB search result.")
          }
        })
      })
      closePanels()
    },
    [
      beginContentNavigation,
      closePanels,
      finishContentNavigation,
      searchHighlightTint,
      selectSearchLocator,
    ],
  )

  const applyReflowablePreferences = useCallback(
    async (settings: ReaderSettings) => {
      if (isFixedLayout) return
      const applyId = ++reflowablePreferenceApplyRef.current
      const nav = navigatorRef.current
      if (!nav) return
      const isCurrent = () =>
        applyId === reflowablePreferenceApplyRef.current &&
        navigatorRef.current === nav
      const layoutKey = reflowableLayoutPreferenceKey(settings, readerLanguage)
      const preserveViewport =
        reflowableViewportAnchorRef.current !== null ||
        (appliedReflowableLayoutKeyRef.current !== null &&
          layoutKey !== appliedReflowableLayoutKeyRef.current)
      const preferences = readerSettingsToEpubPreferences(
        settings,
        readerLanguage,
      )
      const fontFamily = preferences.fontFamily

      if (preserveViewport && !reflowableViewportAnchorRef.current) {
        const current = readiumLocatorToReaderLocator(nav.currentLocator)
        const locator = captureEpubBookmarkLocator(nav, current) ?? current
        reflowableViewportAnchorRef.current = {
          locator,
          offset: readerViewportAnchorOffset(nav, locator),
        }
        pendingReflowableLocatorRef.current = null
      }
      if (preserveViewport) {
        containerRef.current?.classList.add("is-layout-settling")
      }

      let applied = false
      try {
        setReaderFontInIframeDocs(fontFamily)
        await loadReaderFontInIframeDocs(fontFamily)
        if (!isCurrent()) return

        await nav.submitPreferences(preferences)
        if (!isCurrent()) return

        setReaderFontInIframeDocs(fontFamily)
        await nav.resizeHandler()
        if (!(await waitForEpubViewportLayout(nav, isCurrent))) return

        const anchor = reflowableViewportAnchorRef.current
        if (anchor) {
          await goToEpubLocator(
            nav,
            readerLocatorToReadiumLocator(anchor.locator),
          )
          if (!(await waitForEpubViewportLayout(nav, isCurrent))) return
          if (settings.readingLayout === "scroll" && anchor.offset) {
            restoreReaderViewportAnchorOffset(
              nav,
              anchor.locator,
              anchor.offset,
            )
            if (!(await waitForEpubViewportLayout(nav, isCurrent))) return
          }
        }
        applied = true
      } finally {
        if (isCurrent()) {
          if (applied) appliedReflowableLayoutKeyRef.current = layoutKey

          const finalLocator =
            nav.currentLocator ?? pendingReflowableLocatorRef.current
          reflowableViewportAnchorRef.current = null
          pendingReflowableLocatorRef.current = null
          containerRef.current?.classList.remove("is-layout-settling")
          if (finalLocator) {
            setCurrentLocator(finalLocator)
            setChapterTitle(resolveChapterTitle(finalLocator))
          }
        }
      }
    },
    [isFixedLayout, readerLanguage, resolveChapterTitle],
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
    },
    [patchReflowableSettings, readerLanguage],
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
  const {
    nearLeft,
    nearRight,
    handlePointerPosition: handleEdgePointerPosition,
  } = useReaderPaginateEdgeHover(edgeTurnActive, readerRootRef)
  const handleIframePointerPosition = useCallback(
    (clientX: number, clientY: number) => {
      handlePointerPosition(clientX, clientY)
      handleEdgePointerPosition(clientX, clientY)
    },
    [handleEdgePointerPosition, handlePointerPosition],
  )
  useReaderIframePointerBridge(containerRef, handleIframePointerPosition)

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
      const targetPosition = positionForDisplayProgressPercent(
        progress,
        epubPositions.length,
      )
      if (targetPosition == null) return
      const targetIndex = targetPosition - 1
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
      const targetPosition = positionForDisplayProgressPercent(
        progress,
        epubPositions.length,
      )
      return targetPosition == null
        ? 0
        : (displayProgressionForPosition(
            targetPosition,
            epubPositions.length,
          ) ?? 0) * 100
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
            iframe,
            container,
            isScrollMode,
            paddingX: readerSettings.paddingX,
            getChromeVisible: () => chromeVisibleRef.current,
            getCurrentFontFamily: getCurrentReflowableFontFamily,
            getAnnotations: () => annotationsRef.current,
            onAnnotationClick,
            onAnnotationNoteClick,
            onSelectionCleared: () => setAnnotationSelection(null),
            noteMarkerAccessibilityLabel,
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
    onAnnotationClick,
    onAnnotationNoteClick,
    noteMarkerAccessibilityLabel,
  ])

  const savedProgressPositionCount = isFixedLayout
    ? publication.readingOrder.items.length
    : epubPositions.length
  const savedProgressPosition =
    currentLocator?.locations?.position ??
    (currentLocator?.locations?.totalProgression != null &&
    savedProgressPositionCount > 1
      ? Math.round(
          currentLocator.locations.totalProgression *
            (savedProgressPositionCount - 1),
        ) + 1
      : 1)

  useLocatorProgressSync({
    enabled: progressSyncEnabled && Boolean(libraryId) && format.length > 0,
    libraryId,
    bookId,
    format,
    currentLocator,
    displayProgression:
      displayProgressionForPosition(
        savedProgressPosition,
        savedProgressPositionCount,
      ) ?? null,
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
              const frameWindows = new Set<Window>([wnd])
              nav?._cframes.forEach((frame) => {
                const frameWindow = frame?.iframe.contentWindow
                if (frameWindow) frameWindows.add(frameWindow)
              })
              frameWindows.forEach((frameWindow) => {
                const frameElement = frameWindow.frameElement
                if (!(frameElement instanceof HTMLIFrameElement)) return
                setupIframeWindow(frameWindow, {
                  iframe: frameElement,
                  container,
                  isScrollMode:
                    ui.reflowable.settings.readingLayout === "scroll" &&
                    !isFixedLayout,
                  paddingX: ui.reflowable.settings.paddingX,
                  getChromeVisible: () => chromeVisibleRef.current,
                  getCurrentFontFamily: getCurrentReflowableFontFamily,
                  getAnnotations: () => annotationsRef.current,
                  onAnnotationClick,
                  onAnnotationNoteClick,
                  onSelectionCleared: () => setAnnotationSelection(null),
                  noteMarkerAccessibilityLabel,
                })
              })
              if (nav) {
                applyEpubAnnotations(
                  nav,
                  annotationsRef.current,
                  noteMarkerAccessibilityLabel,
                )
              }
              setAnnotationsAvailable(true)
            },
            positionChanged: (locator) => {
              if (
                !isFixedLayout &&
                reflowableViewportAnchorRef.current !== null
              ) {
                pendingReflowableLocatorRef.current = locator
                return
              }
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
            // Consume page-area input so only explicit controls paginate.
            tap: () => {
              if (!hasReaderTextSelection()) setAnnotationSelection(null)
              return true
            },
            click: () => true,
            zoom: () => {},
            miscPointer: () => {
              // Center taps stay content-only; chrome is revealed by edge zones.
            },
            scroll: () => {},
            customEvent: () => {},
            handleLocator: () => false,
            textSelected: onTextSelected,
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
        navigatorRef.current = activeNav
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
        applyEpubAnnotations(
          activeNav,
          annotationsRef.current,
          noteMarkerAccessibilityLabel,
        )
        setAnnotationsAvailable(true)
        setReadiumNavReady(true)
        const store = useAppUiStore.getState()
        if (!isFixedLayout) {
          appliedReflowableLayoutKeyRef.current = reflowableLayoutPreferenceKey(
            store.reflowable.settings,
            readerLanguage,
          )
        }
        if (store.readerPreferencesHydrated && isFixedLayout) {
          await applySpreadPreference(activeNav, store.fixedLayout.spreadMode)
        }
        if (cancelled) return
        setCurrentLocator(activeNav.currentLocator)
        setChapterTitle(resolveChapterTitle(activeNav.currentLocator))
        finishContentNavigation(initialSequence)
      } catch (e) {
        if (cancelled) return
        if (navigatorRef.current === nav) navigatorRef.current = null
        void nav?.destroy()
        console.error("[Readium] Failed to initialize navigator:", e)
        setInitError(String(e))
      }
    }

    void init()

    return () => {
      cancelled = true
      reflowablePreferenceApplyRef.current += 1
      reflowableViewportAnchorRef.current = null
      pendingReflowableLocatorRef.current = null
      appliedReflowableLayoutKeyRef.current = null
      navigationSequenceRef.current += 1
      pendingNavigationHrefRef.current = null
      clearPendingProgressSeek()
      clearContentNavigationTimers()
      setReadiumNavReady(false)
      setAnnotationsAvailable(false)
      setAnnotationSelection(null)
      const activeNavigator = navigatorRef.current ?? nav
      navigatorRef.current = null
      void activeNavigator?.destroy()
    }
  }, [
    publication,
    initialSavedLocator,
    epubPositions,
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
    onAnnotationClick,
    onAnnotationNoteClick,
    onTextSelected,
    noteMarkerAccessibilityLabel,
    revealFailedContentNavigation,
    resolveChapterTitle,
  ])

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
      const current =
        positionForDisplayProgressPercent(nextProgress, total) ?? 1
      const targetIndex = current - 1

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
      panelsOpen={
        tocOpen ||
        bookmarksOpen ||
        annotationsOpen ||
        searchOpen ||
        settingsOpen
      }
      onClosePanels={closePanels}
      theme={readerSettings.theme}
      readerMode={isFixedLayout ? "fixed-layout" : undefined}
      topBar={{
        bookTitle,
        chapterTitle,
        bookmarked: readerBookmarks.bookmarked,
        bookmarkDisabled: !readerBookmarks.canToggle,
        tocOpen,
        bookmarksOpen,
        annotationsOpen,
        searchOpen,
        settingsOpen,
        onToggleToc: toggleToc,
        onToggleBookmarks: toggleBookmarks,
        onToggleAnnotations: annotationsAvailable
          ? toggleAnnotations
          : undefined,
        onToggleSearch: searchCapabilities.searchable
          ? toggleSearch
          : undefined,
        onToggleBookmark: () => void readerBookmarks.toggleCurrentBookmark(),
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
      bookmarkPanel={
        <ReadiumBookmarkPanel
          visible={bookmarksOpen}
          bookmarks={bookmarkRows}
          activeBookmarkLocatorKey={readerBookmarks.currentBookmarkLocatorKey}
          loading={readerBookmarks.loading}
          mutating={readerBookmarks.mutating}
          error={readerBookmarks.loadError}
          onRetry={readerBookmarks.retry}
          onSelect={onBookmarkSelect}
          onDelete={readerBookmarks.deleteBookmark}
          onClose={closePanels}
        />
      }
      annotationsPanel={
        annotationsAvailable ? (
          <ReadiumAnnotationPanel
            visible={annotationsOpen}
            annotations={annotationRows}
            loading={readerAnnotations.loading}
            mutating={readerAnnotations.mutating}
            error={readerAnnotations.loadError}
            onRetry={readerAnnotations.retry}
            onSelect={onAnnotationSelect}
            onEdit={onAnnotationEdit}
            onDelete={readerAnnotations.deleteAnnotation}
            onClose={closePanels}
          />
        ) : null
      }
      searchPanel={
        searchCapabilities.searchable ? (
          <ReadiumSearchPanel
            visible={searchOpen}
            query={searchQuery}
            locators={searchLocators}
            toc={tocItems}
            positions={readerPositions}
            resultCount={searchResultCount}
            loading={searchLoading}
            done={searchDone}
            error={searchError}
            status={searchStatus}
            activeLocator={activeSearchLocator}
            onQueryChange={setSearchQuery}
            onSearch={onSearchSubmit}
            onClear={onSearchClear}
            onLoadMore={loadMoreSearchResults}
            onSelect={onSearchSelect}
            onClose={closePanels}
          />
        ) : null
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
        .readium-epub-host.is-content-settling > .readium-navigator-iframe,
        .readium-epub-host.is-layout-settling > .readium-navigator-iframe {
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
            bottomPositionTotal > 0
              ? (displayProgressionForPosition(
                  bottomPositionCurrent,
                  bottomPositionTotal,
                ) ?? 0) * 100
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
        <>
          <ReaderSelectionMenu
            key={
              annotationSelection
                ? `${annotationSelection.locator.href}:${annotationSelection.locator.locations?.cssSelector ?? ""}:${annotationSelection.locator.text?.highlight ?? ""}`
                : "closed"
            }
            anchor={annotationSelection?.contextMenu ?? null}
            currentColor={selectedAnnotation?.color}
            disabled={readerAnnotations.mutating}
            existing={Boolean(selectedAnnotation)}
            hasNote={Boolean(selectedAnnotation?.note?.trim())}
            onColorSelect={(color) => void setSelectionHighlightColor(color)}
            onEditNote={openSelectionNoteEditor}
            onRemove={() => void removeSelectionAnnotation()}
            onOpenChange={handleSelectionMenuOpenChange}
          />
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
          <ReaderAnnotationEditorDialog
            draft={annotationEditorDraft}
            theme={readerSettings.theme}
            mutating={readerAnnotations.mutating}
            onClose={() => setAnnotationEditor(null)}
            onSave={saveAnnotationEditor}
            onDelete={
              annotationEditor?.mode === "edit"
                ? deleteAnnotationEditor
                : undefined
            }
          />
        </>
      }
    />
  )
}
