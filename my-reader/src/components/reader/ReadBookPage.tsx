import { useReaderBookSource } from "@/hooks/reader/useReaderBookSource"
import { formatFileSize } from "@my-reader/tools/book-metadata"
import { isTauri } from "@tauri-apps/api/core"
import type { TFunction } from "i18next"
import { AlertCircle, List, Loader2, Type } from "lucide-react"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ReadiumDivinaReader } from "@/components/reader/readium/ReadiumDivinaReader"
import { ReadiumEpubReader } from "@/components/reader/readium/ReadiumEpubReader"
import { ReadiumPdfReader } from "@/components/reader/readium/ReadiumPdfReader"
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
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { useReaderPaginateEdgeHover } from "@/hooks/reader/useReaderPaginateEdgeHover"
import { useReadingChrome } from "@/hooks/reader/useReadingChrome"
import { useReadiumDivinaPublication } from "@/hooks/reader/useReadiumDivinaPublication"
import { useReadiumPublication } from "@/hooks/reader/useReadiumPublication"
import { useAppUiStore } from "@/stores/appUiStore"

const READER_STATE_ACTION_CLASS =
  "h-9 w-full rounded-md border border-reader-chrome-border bg-[var(--reader-chrome-action-surface)] px-4 text-sm font-medium text-[var(--reader-chrome-action-text)] transition-colors hover:bg-[var(--reader-chrome-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--reader-chrome-active)]"
const NOOP = () => {}

function isBrowserDemoReader(): boolean {
  if (!import.meta.env.DEV || isTauri() || typeof window === "undefined") {
    return false
  }

  const params = new URLSearchParams(window.location.search)
  return (
    params.get("demo") === "1" ||
    params.get("myreader-demo") === "1" ||
    window.localStorage.getItem("myreader-demo-mode") === "1"
  )
}

export type ReadBookPageProps = {
  bookId: string
  formatFromSearch?: string
}

export function ReadBookPage({ bookId, formatFromSearch }: ReadBookPageProps) {
  const { t } = useTranslation()
  const readerTheme = useAppUiStore((s) => s.reflowable.settings.theme)
  const readerStateRootRef = useRef<HTMLDivElement>(null)
  const bookSource = useReaderBookSource({ bookId, formatFromSearch })
  const { bookTitle, format, bookPayload, mainHandoff } = bookSource

  const readiumPub = useReadiumPublication({
    assetBaseUrl:
      format === "EPUB" ? (bookPayload?.source.extractedDirPath ?? null) : null,
    enabled: format === "EPUB" && Boolean(bookPayload?.source.extractedDirPath),
  })

  const divinaPub = useReadiumDivinaPublication({
    extractedDirUrl:
      format === "CBZ" ? (bookPayload?.source.extractedDirPath ?? null) : null,
    bookTitle,
    extractedEntries: bookPayload?.source.extractedEntries ?? [],
    enabled: format === "CBZ" && Boolean(bookPayload?.source.extractedDirPath),
  })

  const renderWindowState = (content: ReactNode) => (
    <ReaderChromeShell
      readerRootRef={readerStateRootRef}
      chromeVisible
      showChrome={NOOP}
      scheduleChromeHide={NOOP}
      topBar={{
        bookTitle: bookTitle || t("reader.defaultTitle"),
        chapterTitle: "",
        bookmarked: false,
        showReaderActions: false,
        onToggleToc: NOOP,
        onToggleBookmark: NOOP,
        onToggleSettings: NOOP,
      }}
      tocPanel={null}
      settingsPanel={null}
      main={content}
      rootClassName="min-h-screen"
      theme={readerTheme}
      readerMode={
        format === "PDF" || format === "CBZ" ? "fixed-layout" : undefined
      }
    />
  )

  if (mainHandoff) {
    return (
      <div className="flex min-h-screen">
        <ReadBookLoading message={t("reader.openWindow")} />
      </div>
    )
  }

  const windowContent = getReadBookWindowContent(
    bookSource,
    renderWindowState,
    t,
  )
  if (windowContent) return windowContent

  if (isBrowserDemoReader()) {
    return (
      <DemoReaderPreview
        bookTitle={bookTitle || "MyReader"}
        format={format || "EPUB"}
      />
    )
  }

  return (
    <ReadBookContent
      source={bookSource}
      readiumPub={readiumPub}
      divinaPub={divinaPub}
      renderWindowState={renderWindowState}
    />
  )
}

function getReadBookWindowContent(
  source: ReturnType<typeof useReaderBookSource>,
  renderWindowState: (content: ReactNode) => ReactNode,
  t: TFunction,
) {
  const {
    fetchError,
    downloadState,
    downloadError,
    downloadProgress,
    bookPayload,
    positionConflict,
    resolvingPositionConflict,
    handleErrorClose,
    handleRetryDownload,
    handleCancelDownload,
    handlePositionConflict,
  } = source
  if (fetchError) {
    return renderWindowState(
      <ReadBookError
        message={fetchError}
        actionLabel={
          isTauri() ? t("reader.closeWindow") : t("reader.backToDetail")
        }
        onAction={handleErrorClose}
      />,
    )
  }

  if (downloadState === "downloading") {
    return renderWindowState(
      <ReadBookDownloading
        downloadingLabel={t("reader.downloading")}
        bytesWritten={downloadProgress?.bytesWritten ?? 0}
        totalBytes={downloadProgress?.totalBytes}
        cancelLabel={t("common.cancel")}
        onCancel={handleCancelDownload}
      />,
    )
  }

  if (downloadState === "error") {
    return renderWindowState(
      <ReadBookError
        message={downloadError ?? t("reader.downloadFailed")}
        actionLabel={t("reader.retryDownload")}
        onAction={handleRetryDownload}
      />,
    )
  }

  if (downloadState === "cancelled") {
    return renderWindowState(
      <ReadBookError
        message={t("reader.downloadCancelled")}
        actionLabel={t("reader.retryDownload")}
        onAction={handleRetryDownload}
      />,
    )
  }

  if (!bookPayload) {
    return renderWindowState(
      <ReadBookLoading message={t("reader.loadingBook")} />,
    )
  }

  if (positionConflict) {
    return renderWindowState(
      <ReadBookPositionConflict
        candidates={positionConflict}
        resolving={resolvingPositionConflict}
        onSelect={handlePositionConflict}
      />,
    )
  }

  return null
}

function ReadBookPositionConflict({
  candidates,
  resolving,
  onSelect,
}: {
  candidates: NonNullable<
    ReturnType<typeof useReaderBookSource>["positionConflict"]
  >
  resolving: boolean
  onSelect: ReturnType<typeof useReaderBookSource>["handlePositionConflict"]
}) {
  const { t } = useTranslation()
  return (
    <>
      <ReadBookLoading message={t("reader.loadingBook")} />
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("reader.positionConflictTitle")}</DialogTitle>
            <DialogDescription>
              {t("reader.positionConflictDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {candidates.map((candidate) => (
              <Button
                key={candidate.operationId}
                variant="outline"
                className="h-auto justify-between px-4 py-3"
                disabled={resolving}
                onClick={() => void onSelect(candidate)}
              >
                <span>
                  {candidate.displayProgression == null
                    ? t("reader.positionUnknown")
                    : t("reader.positionPercentage", {
                        percentage: Math.round(
                          candidate.displayProgression * 100,
                        ),
                      })}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {new Date(candidate.recordedAt).toLocaleString()}
                </span>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={resolving}
              onClick={() => void onSelect(null)}
            >
              {t("reader.positionConflictKeepDefault")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ReadBookContent({
  source,
  readiumPub,
  divinaPub,
  renderWindowState,
}: {
  source: ReturnType<typeof useReaderBookSource>
  readiumPub: ReturnType<typeof useReadiumPublication>
  divinaPub: ReturnType<typeof useReadiumDivinaPublication>
  renderWindowState: (content: ReactNode) => ReactNode
}) {
  const { t } = useTranslation()
  const {
    bookTitle,
    format,
    bookPayload,
    activeLibraryId,
    progressSyncEnabled,
    handleErrorClose,
  } = source
  if (!bookPayload) return null
  const actionLabel = isTauri()
    ? t("reader.closeWindow")
    : t("reader.backToDetail")
  const showError = (message: string) =>
    renderWindowState(
      <ReadBookError
        message={message}
        actionLabel={actionLabel}
        onAction={handleErrorClose}
      />,
    )
  const readerProps = {
    bookTitle,
    initialSavedLocator: bookPayload.initialSavedLocator,
    libraryId: activeLibraryId,
    bookId: source.bookId,
    format,
    progressSyncEnabled,
  }
  if (format === "PDF") {
    return (
      <ReadiumPdfReader
        {...readerProps}
        fileUrl={bookPayload.source.filePath}
      />
    )
  }
  if (format === "CBZ" && !bookPayload.source.extractedDirPath) {
    return showError(t("reader.comicDirUnavailable"))
  }
  if (format !== "EPUB" && format !== "CBZ") {
    return showError(t("reader.unsupportedFormat"))
  }
  const isEpub = format === "EPUB"
  const result = isEpub ? readiumPub : divinaPub
  const Reader = isEpub ? ReadiumEpubReader : ReadiumDivinaReader
  if (result.loading) {
    return renderWindowState(
      <ReadBookLoading
        message={t(isEpub ? "reader.loadingReadium" : "reader.loadingComic")}
      />,
    )
  }
  if (result.error || !result.publication) {
    return showError(
      result.error ??
        t(isEpub ? "reader.loadEpubFailed" : "reader.loadComicFailed"),
    )
  }
  return <Reader {...readerProps} publication={result.publication} />
}

function DemoReaderPreview({
  bookTitle,
  format,
}: {
  bookTitle: string
  format: string
}) {
  const { t } = useTranslation()
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)
  const [progress, setProgress] = useState(54)
  const panelsOpen = tocOpen || settingsOpen
  const { readerRootRef, chromeVisible, showChrome, scheduleChromeHide } =
    useReadingChrome(false, panelsOpen)
  const { nearLeft, nearRight } = useReaderPaginateEdgeHover(
    !panelsOpen,
    readerRootRef,
  )
  const normalizedFormat = format.toUpperCase()
  const isFixedLayoutPreview =
    normalizedFormat === "PDF" || normalizedFormat === "CBZ"
  const demoPositionTotal = isFixedLayoutPreview ? 772 : 100
  const demoPositionCurrent = Math.max(
    1,
    Math.min(
      demoPositionTotal,
      Math.round((progress / 100) * (demoPositionTotal - 1)) + 1,
    ),
  )
  const demoPositionLabel = isFixedLayoutPreview
    ? t("reader.pageCount", {
        current: demoPositionCurrent,
        total: demoPositionTotal,
      })
    : t("reader.positionCount", {
        current: demoPositionCurrent,
        total: demoPositionTotal,
      })
  const getDemoProgressPreview = useCallback(
    (nextProgress: number) => {
      const current = Math.max(
        1,
        Math.min(
          demoPositionTotal,
          Math.round((nextProgress / 100) * (demoPositionTotal - 1)) + 1,
        ),
      )
      const chapterTitle =
        current >= 104
          ? "第四章 被折起的页角"
          : current >= 63
            ? "第三章 海边灯塔"
            : current >= 28
              ? "第二章 失眠地图"
              : "第一章 雨夜书店"
      return {
        chapterTitle,
        label: isFixedLayoutPreview
          ? t("reader.pageCount", {
              current,
              total: demoPositionTotal,
            })
          : t("reader.positionCount", {
              current,
              total: demoPositionTotal,
            }),
      }
    },
    [demoPositionTotal, isFixedLayoutPreview, t],
  )
  const resolveDemoProgressCommit = useCallback(
    (nextProgress: number) => {
      if (demoPositionTotal <= 1) return 0
      const current = Math.max(
        1,
        Math.min(
          demoPositionTotal,
          Math.round((nextProgress / 100) * (demoPositionTotal - 1)) + 1,
        ),
      )
      return ((current - 1) / (demoPositionTotal - 1)) * 100
    },
    [demoPositionTotal],
  )

  useEffect(() => {
    showChrome()
  }, [showChrome])

  const closePanels = useCallback(() => {
    setTocOpen(false)
    setSettingsOpen(false)
  }, [])

  const openToc = useCallback(() => {
    setTocOpen((value) => !value)
    setSettingsOpen(false)
  }, [])

  const openSettings = useCallback(() => {
    setSettingsOpen((value) => !value)
    setTocOpen(false)
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      <ReaderChromeShell
        readerRootRef={readerRootRef}
        chromeVisible={chromeVisible}
        showChrome={showChrome}
        scheduleChromeHide={scheduleChromeHide}
        topBar={{
          bookTitle,
          chapterTitle:
            normalizedFormat === "EPUB"
              ? getDemoProgressPreview(progress).chapterTitle
              : "",
          bookmarked,
          tocOpen,
          settingsOpen,
          previewNativeMacFullscreen: true,
          onToggleToc: openToc,
          onToggleBookmark: () => setBookmarked((value) => !value),
          onToggleSettings: openSettings,
        }}
        tocPanel={
          <ReaderSidePanelFrame visible={tocOpen} side="left">
            <ReaderSidePanelHeader
              title={t("reader.toc")}
              icon={List}
              onClose={closePanels}
            />
            <ReaderSidePanelScrollArea>
              <nav className="space-y-1 px-4 py-3 text-reader-chrome-fg">
                {[
                  ["第一章 雨夜书店", "1"],
                  ["第二章 失眠地图", "28"],
                  ["第三章 海边灯塔", "63"],
                  ["第四章 被折起的页角", "104"],
                ].map(([title, page], index) => (
                  <button
                    key={title}
                    type="button"
                    className="reader-chrome-toc-item flex w-full items-center justify-between rounded-md px-2 py-2 text-start text-sm transition-colors"
                    aria-current={index === 1 ? "location" : undefined}
                  >
                    <span className="truncate">{title}</span>
                    <span className="ps-4 text-reader-chrome-muted">
                      {page}
                    </span>
                  </button>
                ))}
              </nav>
            </ReaderSidePanelScrollArea>
          </ReaderSidePanelFrame>
        }
        settingsPanel={
          <ReaderSidePanelFrame visible={settingsOpen} side="right">
            <ReaderSidePanelHeader
              title={t("reader.fontSize")}
              icon={Type}
              onClose={closePanels}
            />
            <ReaderSidePanelScrollArea
              className={READER_SETTINGS_CONTENT_CLASS}
            >
              <section className="space-y-2">
                <div className={READER_SETTINGS_LABEL_CLASS}>
                  {t("reader.fontSize")}
                </div>
                <div className="flex items-center gap-3">
                  <button className="reader-chrome-icon-btn" type="button">
                    A-
                  </button>
                  <span
                    className={`${READER_SETTINGS_VALUE_CLASS} min-w-14 text-center`}
                  >
                    18 px
                  </span>
                  <button className="reader-chrome-icon-btn" type="button">
                    A+
                  </button>
                </div>
              </section>
              <section className="space-y-2">
                <div className={READER_SETTINGS_LABEL_CLASS}>
                  {t("reader.theme")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {["纸色", "暖黄", "夜间"].map((label, index) => (
                    <button
                      key={label}
                      type="button"
                      className={`${READER_SETTINGS_OPTION_CLASS} ${readerSettingsOptionStateClass(index === 0)}`}
                      data-active={index === 0 ? "true" : undefined}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            </ReaderSidePanelScrollArea>
          </ReaderSidePanelFrame>
        }
        panelsOpen={panelsOpen}
        onClosePanels={closePanels}
        theme={isFixedLayoutPreview ? "night" : "paper"}
        readerMode={isFixedLayoutPreview ? "fixed-layout" : undefined}
        main={
          isFixedLayoutPreview ? (
            <main className="flex min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_50%_22%,rgba(255,255,255,0.14),transparent_36%),linear-gradient(135deg,rgba(196,98,45,0.24),transparent_42%),var(--reader-bg)] text-reader-chrome-fg">
              <article className="grid h-full w-full content-center gap-8 px-[max(4.75rem,8vw)] pb-24 pt-24 text-[clamp(1.35rem,4vw,3rem)] font-semibold leading-[1.55] tracking-normal">
                <div className="max-w-4xl space-y-5">
                  <p>PDF / CBZ mock page</p>
                  <p>
                    固定版式内容按画面铺满窗口，chrome
                    以玻璃层直接叠加，不再保留 EPUB 的阅读区边框。
                  </p>
                </div>
              </article>
            </main>
          ) : (
            <main className="flex min-h-0 flex-1 justify-center overflow-hidden bg-[var(--reader-bg)] px-[max(5rem,9vw)] pb-24 pt-24 text-[var(--reader-fg)] ring-1 ring-inset ring-reader-chrome-border/40">
              <article className="grid w-full max-w-5xl grid-cols-1 gap-x-20 text-[25px] font-semibold leading-[2.02] tracking-normal md:grid-cols-2">
                <div className="space-y-8">
                  <p>
                    可见，那些被妥善保存的文字，并不是为了停留在纸页上，
                    而是为了在一次次打开时重新变得鲜活。
                  </p>
                  <p>
                    读者的目光从标题栏下方滑过，工具按钮安静地贴在边缘，
                    不打断正文，也不让系统行为和阅读节奏彼此争抢。
                  </p>
                </div>
                <div className="space-y-8">
                  <p>
                    当窗口进入全屏，系统红绿灯交还给 macOS 处理；目录按钮
                    则回到左侧，让阅读界面少一段无意义的留白。
                  </p>
                  <p>
                    这里是浏览器 demo 预览，用来标注间距、圆角、按钮位置和
                    面板宽度。真实阅读内容仍由 EPUB、PDF、CBZ 各自的渲染器负责。
                  </p>
                </div>
              </article>
            </main>
          )
        }
        bottomStatusBar={
          <ReaderBottomStatusBar
            visible={chromeVisible}
            leftText={demoPositionLabel}
            progress={progress}
            getProgressPreview={getDemoProgressPreview}
            resolveProgressCommit={resolveDemoProgressCommit}
            onProgressChange={setProgress}
            onProgressStepBackward={() =>
              setProgress((value) => Math.max(0, value - 3))
            }
            onProgressStepForward={() =>
              setProgress((value) => Math.min(100, value + 3))
            }
          />
        }
        edgeTurnOverlays={
          <ReaderPaginateEdgeTurnStrips
            showPrev={nearLeft}
            showNext={nearRight}
            onPrev={() => setProgress((value) => Math.max(0, value - 3))}
            onNext={() => setProgress((value) => Math.min(100, value + 3))}
            prevLabel={t("reader.prevPage")}
            nextLabel={t("reader.nextPage")}
          />
        }
      />
    </div>
  )
}

function ReadBookLoading({ message }: { message: string }) {
  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col items-center justify-center bg-reader-bg px-4 text-reader-fg"
      data-reader-state="loading"
    >
      <div
        className="flex flex-col items-center gap-3 text-[var(--reader-chrome-active)]"
        role="status"
        aria-label={message}
        aria-live="polite"
      >
        <Loader2 className="size-8 animate-spin" aria-hidden />
      </div>
    </div>
  )
}

function ReadBookDownloading({
  bytesWritten,
  totalBytes,
  downloadingLabel,
  cancelLabel,
  onCancel,
}: {
  bytesWritten: number
  totalBytes?: number
  downloadingLabel: string
  cancelLabel: string
  onCancel: () => void
}) {
  const percent =
    totalBytes && totalBytes > 0
      ? Math.min(100, Math.round((bytesWritten / totalBytes) * 100))
      : undefined
  return (
    <div
      className="flex min-h-0 w-full flex-1 items-center justify-center bg-reader-bg p-6 text-reader-fg"
      data-reader-state="downloading"
    >
      <div className="w-full max-w-md">
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-6 text-sm">
            <span className="font-medium">{downloadingLabel}</span>
            <span className="shrink-0 tabular-nums text-reader-chrome-muted">
              {percent != null ? `${percent}%` : "—"}
              {totalBytes != null && totalBytes > 0
                ? ` (${formatFileSize(bytesWritten)} / ${formatFileSize(totalBytes)})`
                : null}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-[var(--reader-chrome-slider-track)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? 0}
          >
            <div
              className="h-full rounded-full bg-[var(--reader-chrome-active)] transition-[width] duration-300"
              style={{ width: `${percent ?? 0}%` }}
            />
          </div>
          <button
            type="button"
            className={READER_STATE_ACTION_CLASS}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReadBookError({
  message,
  actionLabel,
  onAction,
}: {
  message: string
  actionLabel: string
  onAction: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      className="flex min-h-0 w-full flex-1 items-center justify-center bg-reader-bg p-6 text-reader-fg"
      data-reader-state="error"
    >
      <Empty className="w-full max-w-md text-reader-fg">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="bg-[var(--reader-chrome-segment-idle)] text-[var(--reader-chrome-active)]"
          >
            <AlertCircle />
          </EmptyMedia>
          <EmptyTitle className="text-reader-fg">
            {t("reader.loadFailed")}
          </EmptyTitle>
          <EmptyDescription className="text-reader-chrome-muted">
            {message}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <button
            type="button"
            className={READER_STATE_ACTION_CLASS}
            onClick={onAction}
          >
            {actionLabel}
          </button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
