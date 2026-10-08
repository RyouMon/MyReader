import type { DesktopTranslationKey } from "@my-reader/i18n/desktop"
import { READER_THEME_PRESETS } from "@my-reader/tools/reader-themes"
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
import { type CSSProperties, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { ReaderAnnotationEditorDialog } from "@/components/reader/readium/ReaderAnnotationEditorDialog"
import { ReaderSelectionMenu } from "@/components/reader/readium/ReaderSelectionMenu"
import { ReaderTtsControls } from "@/components/reader/readium/ReaderTtsControls"
import { ReaderTtsSettingsPanel } from "@/components/reader/readium/ReaderTtsSettingsPanel"
import { ReadiumAnnotationPanel } from "@/components/reader/readium/ReadiumAnnotationPanel"
import { ReadiumBookmarkPanel } from "@/components/reader/readium/ReadiumBookmarkPanel"
import { ReadiumSearchPanel } from "@/components/reader/readium/ReadiumSearchPanel"
import { ReadiumTocPanel } from "@/components/reader/readium/ReadiumTocPanel"
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
  ReadingLayout,
  TextAlign,
} from "@/components/reader/types"
import { Label } from "@/components/ui/label"
import { displayProgressionForPosition } from "@/lib/readingProgress"
import {
  type ReflowThemePreset,
  type SpreadPreference,
} from "@/lib/readium/epubReaderPrefs"
import {
  coerceReaderFontOption,
  getReaderFontOptions,
  type ReaderFontFamilyKey,
  resolveReaderFont,
} from "@/lib/readium/readerFonts"
import { readerThemeToReflowPreset } from "@/lib/readium/readerSettingsBridge"
import { cn } from "@/lib/utils"
import { useAppUiStore } from "@/stores/appUiStore"

import type { EpubReaderViewState } from "./ReadiumEpubReader"
const RANGE_INPUT_CLASS = "reader-settings-range disabled:opacity-50"
const readerSettingsRangeStyle = (
  value: number,
  min: number,
  max: number,
): CSSProperties =>
  ({
    "--reader-settings-range-progress": `${((value - min) / (max - min)) * 100}%`,
  }) as CSSProperties
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
                    {t(option.labelKey as DesktopTranslationKey)}
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

export function EpubReaderView({ state }: { state: EpubReaderViewState }) {
  const { t } = useTranslation()
  const {
    initError,
    readerRootRef,
    chromeVisible,
    showChrome,
    scheduleChromeHide,
    panelsOpen,
    tocOpen,
    bookmarksOpen,
    annotationsOpen,
    searchOpen,
    settingsOpen,
    ttsSettingsOpen,
    closePanels,
    readerSettings,
    isFixedLayout,
    bookTitle,
    chapterTitle,
    readerBookmarks,
    annotationsAvailable,
    searchCapabilities,
    ttsSession,
    ttsViewportRelation,
    playTts,
    playTtsFromCurrentPosition,
    toggleTtsSettings,
    toggleToc,
    toggleBookmarks,
    toggleAnnotations,
    toggleSearch,
    toggleSettings,
    tocRows,
    activeTocKey,
    onTocSelect,
    bookmarkRows,
    onBookmarkSelect,
    annotationRows,
    readerAnnotations,
    onAnnotationSelect,
    onAnnotationEdit,
    searchQuery,
    searchLocators,
    tocItems,
    readerPositions,
    searchResultCount,
    searchLoading,
    searchDone,
    searchError,
    searchStatus,
    activeSearchLocator,
    setSearchQuery,
    onSearchSubmit,
    onSearchClear,
    loadMoreSearchResults,
    onSearchSelect,
    readerLanguage,
    onReaderFontFamilyChange,
    containerRef,
    contentSettling,
    annotationEditorDraft,
    annotationEditor,
    setAnnotationEditor,
    saveAnnotationEditor,
    deleteAnnotationEditor,
  } = state
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
      panelsOpen={panelsOpen}
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
        rightActionsStart: (
          <ReaderTtsControls
            session={ttsSession}
            visible={chromeVisible}
            settingsOpen={ttsSettingsOpen}
            viewportRelation={ttsViewportRelation}
            onPlay={playTts}
            onPlayFromCurrentPosition={playTtsFromCurrentPosition}
            onReturnToPlaybackPosition={ttsSession.goToCurrent}
            onToggleSettings={toggleTtsSettings}
          />
        ),
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
        <>
          <EpubSettingsPanel
            visible={settingsOpen}
            isFixedLayout={isFixedLayout}
            readerLanguage={readerLanguage}
            onFontFamilyChange={onReaderFontFamilyChange}
            onClose={closePanels}
          />
          <ReaderTtsSettingsPanel
            visible={ttsSettingsOpen}
            session={ttsSession}
            theme={isFixedLayout ? undefined : readerSettings.theme}
          />
        </>
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
      edgeTurnOverlays={<EpubReaderEdgeTurns state={state} />}
      bottomStatusBar={<EpubReaderStatus state={state} />}
      main={
        <>
          <EpubReaderSelection state={state} />
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

function EpubReaderSelection({
  state,
}: {
  state: Pick<
    EpubReaderViewState,
    | "annotationSelection"
    | "selectedAnnotation"
    | "readerAnnotations"
    | "setSelectionHighlightColor"
    | "openSelectionNoteEditor"
    | "ttsSession"
    | "readSelectionAloud"
    | "removeSelectionAnnotation"
    | "handleSelectionMenuOpenChange"
  >
}) {
  const {
    annotationSelection,
    selectedAnnotation,
    readerAnnotations,
    setSelectionHighlightColor,
    openSelectionNoteEditor,
    ttsSession,
    readSelectionAloud,
    removeSelectionAnnotation,
    handleSelectionMenuOpenChange,
  } = state
  return (
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
      onReadAloud={ttsSession.available ? readSelectionAloud : undefined}
      onRemove={() => void removeSelectionAnnotation()}
      onOpenChange={handleSelectionMenuOpenChange}
    />
  )
}

function EpubReaderStatus({
  state,
}: {
  state: Pick<
    EpubReaderViewState,
    | "chromeVisible"
    | "isRtl"
    | "isFixedLayout"
    | "bottomPositionCurrent"
    | "bottomPositionTotal"
    | "getProgressPreview"
    | "resolveProgressCommit"
    | "onProgressSeek"
    | "onReadiumEdgePrev"
    | "onReadiumEdgeNext"
  >
}) {
  const { t } = useTranslation()
  const {
    chromeVisible,
    isRtl,
    isFixedLayout,
    bottomPositionCurrent,
    bottomPositionTotal,
    getProgressPreview,
    resolveProgressCommit,
    onProgressSeek,
    onReadiumEdgePrev,
    onReadiumEdgeNext,
  } = state
  return (
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
  )
}

function EpubReaderEdgeTurns({
  state,
}: {
  state: Pick<
    EpubReaderViewState,
    | "readerSettings"
    | "isRtl"
    | "nearLeft"
    | "nearRight"
    | "onReadiumEdgePrev"
    | "onReadiumEdgeNext"
  >
}) {
  const { t } = useTranslation()
  const {
    readerSettings,
    isRtl,
    nearLeft,
    nearRight,
    onReadiumEdgePrev,
    onReadiumEdgeNext,
  } = state
  return readerSettings.readingLayout !== "scroll" ? (
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
