import type { CalibreBook } from "@my-reader/tools/types/book"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { isTauri } from "@tauri-apps/api/core"
import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  Star,
  Trash2,
  X,
} from "lucide-react"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import AppSidebarToggle from "@/components/library/AppSidebarToggle"
import { CircularDownloadProgress } from "@/components/library/CircularDownloadProgress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  bookFileStateKeys,
  useBookFileState,
} from "@/hooks/queries/useBookFileState"
import {
  useBookReadingFormats,
  useSetBookReadingFormat,
} from "@/hooks/queries/useBookReadingFormatsQuery"
import {
  useFavoriteBookMutations,
  useFavoriteBookSet,
} from "@/hooks/queries/useFavoriteBooksQuery"
import { useLibrariesQuery } from "@/hooks/queries/useLibrariesQuery"
import { useBookReadingProgress } from "@/hooks/queries/useReadingProgressQuery"
import { useOverlayScrollbar } from "@/hooks/use-overlay-scrollbar"
import { useCoverObjectUrl } from "@/hooks/useCoverObjectUrl"
import {
  clearDownloadProgress,
  setDownloadCancelled,
  setDownloadError,
  setDownloadStarting,
  useDownloadProgress,
} from "@/hooks/useDownloadProgress"
import { generateCoverGradient } from "@/lib/cover-gradient"
import {
  getCoverFailureKey,
  getCoverFailuresRevision,
  isBrokenCover,
  markBrokenCover,
  subscribeCoverFailures,
} from "@/lib/coverFailureCache"
import { removeCachedCoverObjectUrl } from "@/lib/coverObjectUrlCache"
import { openReaderInNewWindow } from "@/lib/readerWindow"
import {
  getBookProgressSnapshot,
  getProgressDisplay,
  getReadActionLabel,
} from "@/lib/readingProgress"
import type { BookDetail } from "@/lib/tauri-api"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import { BookMoreMenu } from "./BookMoreMenu"

interface BookDetailPaneProps {
  bookId: string
  className?: string
  onBackToList?: () => void
  forceNarrowHero?: boolean
  forceWideHero?: boolean
  fullScreenAvailable?: boolean
  detailFullScreen?: boolean
  onToggleDetailFullScreen?: () => void
  showSidebarToggle?: boolean
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const FORMAT_TONES: Record<string, string> = {
  EPUB: "bg-primary text-primary-foreground",
  PDF: "bg-secondary text-secondary-foreground border border-border",
  MOBI: "bg-accent text-accent-foreground border border-border",
  AZW3: "bg-primary/85 text-primary-foreground",
  TXT: "bg-muted text-muted-foreground border border-border",
  CBZ: "bg-primary/70 text-primary-foreground",
  DJVU: "bg-foreground text-background",
  FB2: "bg-primary/75 text-primary-foreground",
}

function useIdentifierLabels(): Record<string, string> {
  const { t } = useTranslation()
  return {
    isbn: t("bookDetail.identifiers.isbn"),
    goodreads: t("bookDetail.identifiers.goodreads"),
    douban: t("bookDetail.identifiers.douban"),
    amazon: t("bookDetail.identifiers.amazon"),
    google: t("bookDetail.identifiers.google"),
    barnesnoble: t("bookDetail.identifiers.barnesnoble"),
  }
}

function useLanguageMap(): Record<string, string> {
  const { t } = useTranslation()
  return {
    zho: t("bookDetail.languages.zho"),
    chi: t("bookDetail.languages.chi"),
    eng: t("bookDetail.languages.eng"),
    jpn: t("bookDetail.languages.jpn"),
    kor: t("bookDetail.languages.kor"),
    fra: t("bookDetail.languages.fra"),
    deu: t("bookDetail.languages.deu"),
    spa: t("bookDetail.languages.spa"),
    rus: t("bookDetail.languages.rus"),
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--"
  try {
    const d = new Date(dateStr)
    if (d.getFullYear() <= 100) return "--"
    return d.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  } catch {
    return dateStr
  }
}

function extractYear(dateStr: string | null): string | null {
  if (!dateStr) return null
  try {
    const d = new Date(dateStr)
    const year = d.getFullYear()
    if (year <= 100) return null
    return String(year)
  } catch {
    return null
  }
}

function getFormatTone(format: string): string {
  return FORMAT_TONES[format] ?? "bg-muted text-foreground border border-border"
}

const DETAIL_CARD_CLASS =
  "relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none bg-card shadow-none transition-colors duration-[340ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none"
const MOBILE_HERO_BREAKPOINT = 559

export default function BookDetailPane({
  bookId,
  className,
  onBackToList,
  forceNarrowHero = false,
  forceWideHero = false,
  fullScreenAvailable = false,
  detailFullScreen = false,
  onToggleDetailFullScreen,
  showSidebarToggle = false,
}: BookDetailPaneProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const activeLibraryId = useLibraryUiStore((s) => s.activeLibraryId)
  const { data: libraries = [] } = useLibrariesQuery()
  const { data: selectedFormatById = {} } =
    useBookReadingFormats(activeLibraryId)
  const { data: progressByBookId = {} } =
    useBookReadingProgress(activeLibraryId)
  const setBookReadingFormat = useSetBookReadingFormat(activeLibraryId)
  const activeLibrary = libraries.find((l) => l.id === activeLibraryId) ?? null
  const { favoriteSet } = useFavoriteBookSet(activeLibraryId)
  const {
    addFavoriteBook,
    removeFavoriteBook,
    isPending: favoritePending,
  } = useFavoriteBookMutations(activeLibraryId)
  const identifierLabels = useIdentifierLabels()
  const languageMap = useLanguageMap()

  const [book, setBook] = useState<BookDetail | null>(null)
  const [seriesBooks, setSeriesBooks] = useState<CalibreBook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [synopsisExpanded, setSynopsisExpanded] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null)
  const [isNarrowHero, setIsNarrowHero] = useState(false)
  const [showNarrowCoverBackdrop, setShowNarrowCoverBackdrop] = useState(false)
  const [detailHeroElement, setDetailHeroElement] =
    useState<HTMLDivElement | null>(null)
  const coverFailuresRevision = useSyncExternalStore(
    subscribeCoverFailures,
    getCoverFailuresRevision,
    getCoverFailuresRevision,
  )

  const bodyHostRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const mobileCoverArtRef = useRef<HTMLDivElement>(null)

  useOverlayScrollbar(bodyHostRef, bodyRef, !loading && !error && Boolean(book))

  const updateNarrowCoverBackdrop = useCallback(() => {
    const body = bodyRef.current
    if (!body) return

    const coverHeight = mobileCoverArtRef.current?.offsetHeight ?? 0
    if (coverHeight <= 0) {
      setShowNarrowCoverBackdrop(false)
      return
    }

    const threshold = Math.max(0, coverHeight)
    const nextVisible = body.scrollTop >= threshold
    setShowNarrowCoverBackdrop((current) =>
      current === nextVisible ? current : nextVisible,
    )
  }, [])

  const handleDetailScroll = useCallback(() => {
    if (!isNarrowHero) return
    updateNarrowCoverBackdrop()
  }, [isNarrowHero, updateNarrowCoverBackdrop])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      console.info(
        `Start to load book detail page. book id: "${bookId}", library id: "${activeLibraryId ?? ""}"`,
      )
      try {
        const detail = await api.getBookDetail(activeLibraryId, Number(bookId))
        if (cancelled) return
        setBook(detail)
        setSeriesBooks([])
        setSelectedFormat(null)
        console.info(
          `Success to load book detail. book id: ${detail.id}, title: "${detail.title}", series: "${detail.series ?? ""}"`,
        )

        if (detail.series) {
          console.info(
            `Start to load series books. series name: "${detail.series}", exclude book id: ${detail.id}`,
          )
          const related = await api.getSeriesBooks(
            activeLibraryId,
            detail.series,
            detail.id,
          )
          if (cancelled) return
          setSeriesBooks(related)
          console.info(`Success to load series books. count: ${related.length}`)
        }
      } catch (e) {
        if (cancelled) return
        console.error(
          `Failed to load book detail page. book id: "${bookId}", library id: "${activeLibraryId ?? ""}", error:`,
          e,
        )
        setError(String(e))
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    load()

    return () => {
      cancelled = true
    }
  }, [bookId, activeLibraryId])

  useEffect(() => {
    if (!bookId) return
    bodyRef.current?.scrollTo({ top: 0 })
    setSynopsisExpanded(false)
    setShowNarrowCoverBackdrop(false)
  }, [bookId])

  useLayoutEffect(() => {
    const hero = detailHeroElement
    if (!hero) return

    const updateNarrowHero = (width: number) => {
      setIsNarrowHero(
        !forceWideHero && (forceNarrowHero || width <= MOBILE_HERO_BREAKPOINT),
      )
    }

    updateNarrowHero(hero.getBoundingClientRect().width)

    if (typeof ResizeObserver === "undefined") {
      const handleResize = () =>
        updateNarrowHero(hero.getBoundingClientRect().width)
      window.addEventListener("resize", handleResize)
      return () => window.removeEventListener("resize", handleResize)
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      updateNarrowHero(entry.contentRect.width)
    })
    observer.observe(hero)
    return () => observer.disconnect()
  }, [detailHeroElement, forceNarrowHero, forceWideHero])

  useEffect(() => {
    if (!isNarrowHero) {
      setShowNarrowCoverBackdrop(false)
      return
    }

    const frame = window.requestAnimationFrame(updateNarrowCoverBackdrop)
    return () => window.cancelAnimationFrame(frame)
  }, [isNarrowHero, updateNarrowCoverBackdrop])

  const coverFailureKey =
    book && activeLibraryId
      ? getCoverFailureKey({
          libraryId: activeLibraryId,
          bookPath: book.path,
          kind: "expected",
        })
      : null
  const coverFailed =
    coverFailuresRevision >= 0 && coverFailureKey
      ? isBrokenCover(coverFailureKey)
      : false
  const {
    coverSrc,
    coverCacheKey: detailCoverCacheKey,
    coverLoadError,
  } = useCoverObjectUrl({
    libraryId: activeLibraryId,
    bookPath: book?.path ?? "",
    enabled: Boolean(book?.hasCover && activeLibraryId && !coverFailed),
    reloadKey: coverFailuresRevision,
  })

  const handleCoverError = useCallback(() => {
    if (detailCoverCacheKey) {
      removeCachedCoverObjectUrl(detailCoverCacheKey)
    }
    if (coverFailureKey) {
      markBrokenCover(coverFailureKey)
    }
  }, [coverFailureKey, detailCoverCacheKey])

  useEffect(() => {
    if (coverLoadError && coverFailureKey) {
      markBrokenCover(coverFailureKey)
    }
  }, [coverFailureKey, coverLoadError])

  const isFavorite = favoriteSet.has(Number(bookId))
  const handleToggleFavorite = useCallback(() => {
    if (!activeLibraryId) return
    const id = Number(bookId)
    if (!Number.isFinite(id) || id <= 0) return
    if (isFavorite) {
      void removeFavoriteBook(id)
    } else {
      void addFavoriteBook(id)
    }
  }, [activeLibraryId, addFavoriteBook, bookId, isFavorite, removeFavoriteBook])

  const navigateToRead = useCallback(
    async (id: number, fmt?: string) => {
      if (isTauri()) {
        console.info(
          `Start to open reader window from book detail. book id: ${id}, format: "${fmt?.toUpperCase() ?? ""}", title: "${book?.title ?? ""}"`,
        )
        try {
          await openReaderInNewWindow(
            String(id),
            fmt?.toUpperCase(),
            book?.title,
          )
          console.info(
            `Success to open reader window from book detail. book id: ${id}`,
          )
        } catch (e) {
          console.error(
            `Failed to open reader window from book detail. book id: ${id}, error:`,
            e,
          )
        }
        return
      }
      console.info(
        `Start to navigate to in-app reader. book id: ${id}, format: "${fmt?.toUpperCase() ?? ""}"`,
      )
      navigate({
        to: "/read/$bookId",
        params: { bookId: String(id) },
        search: fmt ? { format: fmt.toUpperCase() } : {},
      })
      console.info(`Success to navigate to in-app reader. book id: ${id}`)
    },
    [navigate, book?.title],
  )

  const readableFormats = book?.readableFormats ?? []
  const canReadInApp = readableFormats.length > 0
  const activeSelectedFormat = book
    ? (selectedFormat ??
      selectedFormatById[String(book.id)] ??
      book.preferredFormat)
    : null
  const currentProgress = book
    ? getBookProgressSnapshot(progressByBookId, book.id, activeSelectedFormat)
    : undefined
  const currentProgressDisplay = getProgressDisplay(currentProgress, t)
  const progressPercent =
    typeof currentProgress?.percent === "number"
      ? Math.round(currentProgress.percent)
      : 0
  const readButtonLabel = canReadInApp
    ? getReadActionLabel(currentProgress, t)
    : t("bookMore.noReadableFormat")
  const detailIconActionButtonClassName =
    "detail-icon-action inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--detail-hero-control-bg)] text-[var(--detail-hero-fg)] shadow-sm transition-colors hover:bg-[var(--detail-hero-control-hover)] hover:text-[var(--detail-hero-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
  const showMutedCoverBackdrop = !isNarrowHero || showNarrowCoverBackdrop
  const isNarrowCoverBackdropActive = isNarrowHero && showNarrowCoverBackdrop

  if (loading) {
    return (
      <section
        className={cn(DETAIL_CARD_CLASS, className)}
        data-testid="book-detail-pane"
      >
        <DetailPaneHeaderBar
          onBackToList={onBackToList}
          fullScreenAvailable={fullScreenAvailable}
          detailFullScreen={detailFullScreen}
          onToggleDetailFullScreen={onToggleDetailFullScreen}
          showSidebarToggle={showSidebarToggle}
        />
        <Empty className="min-h-0 flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Loader2 className="animate-spin" />
            </EmptyMedia>
            <EmptyTitle>{t("bookDetail.loading")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </section>
    )
  }

  if (error || !book) {
    return (
      <section
        className={cn(DETAIL_CARD_CLASS, className)}
        data-testid="book-detail-pane"
      >
        <DetailPaneHeaderBar
          onBackToList={onBackToList}
          fullScreenAvailable={fullScreenAvailable}
          detailFullScreen={detailFullScreen}
          onToggleDetailFullScreen={onToggleDetailFullScreen}
          showSidebarToggle={showSidebarToggle}
        />
        <Empty className="min-h-0 flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircle className="text-destructive" />
            </EmptyMedia>
            <EmptyTitle>{t("bookDetail.loadFailed")}</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    )
  }

  const year = extractYear(book.pubdate)
  const displayAuthors = book.authors.join(", ")
  const langDisplay = book.languages
    .map((code) => languageMap[code] ?? code)
    .join(", ")
  const formatSizeMap = new Map(
    book.formatSizes.map((fs) => [fs.format, fs.sizeBytes]),
  )
  const isRemoteLibrary =
    activeLibrary?.sourceType != null && activeLibrary.sourceType !== "local"

  const seriesLabel =
    book.series && book.seriesIndex
      ? t("bookDetail.series", {
          series: book.series,
          index: Number.isInteger(book.seriesIndex)
            ? book.seriesIndex
            : book.seriesIndex.toFixed(1),
        })
      : book.series
  const synopsisText = stripHtml(book.comment ?? "").trim()
  const hasSynopsis = synopsisText.length > 0
  const heroSynopsis = hasSynopsis ? synopsisText : t("bookDetail.noSynopsis")
  const authorCredits =
    book.authors.length > 0 ? book.authors : [t("bookDetail.unknownAuthor")]

  const renderHeroSynopsis = (
    className: string,
    maxHeightClass: string,
    textClassName: string,
    fadeHeightClass: string,
  ) => (
    <div className={cn("min-w-0", className)}>
      <h2 className="mb-2 text-[19px] leading-none font-semibold text-[var(--detail-hero-fg)]">
        {t("bookDetail.synopsis")}
      </h2>
      <div
        className={cn(
          "detail-synopsis-wrap relative overflow-hidden transition-[max-height] duration-300 ease-in-out",
          hasSynopsis && !synopsisExpanded && maxHeightClass,
        )}
      >
        <p
          className={cn(
            "whitespace-pre-line text-[var(--detail-hero-body)]",
            textClassName,
            !hasSynopsis && "text-[var(--detail-hero-subtle)]",
          )}
        >
          {heroSynopsis}
        </p>
        {hasSynopsis && !synopsisExpanded && (
          <div
            className={cn(
              "detail-hero-synopsis-fade pointer-events-none absolute inset-x-0 bottom-0",
              fadeHeightClass,
            )}
          />
        )}
      </div>
      {hasSynopsis && synopsisText.length > 160 && (
        <button
          type="button"
          className="mt-2 inline-flex h-auto items-center gap-1 p-0 text-[13px] font-medium text-[var(--detail-hero-muted)] transition-colors hover:text-[var(--detail-hero-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => setSynopsisExpanded(!synopsisExpanded)}
        >
          {synopsisExpanded ? t("bookDetail.collapse") : t("bookDetail.expand")}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-300",
              synopsisExpanded && "rotate-180",
            )}
          />
        </button>
      )}
    </div>
  )

  const renderHeroAuthors = (className: string, keyPrefix: string) => (
    <div className={cn("flex shrink-0 flex-wrap gap-x-8 gap-y-3", className)}>
      {authorCredits.map((author) => (
        <div key={`${keyPrefix}-${author}`} className="min-w-[5rem] max-w-full">
          <div className="truncate text-[14.5px] font-semibold text-[var(--detail-hero-fg)]">
            {author}
          </div>
          <div className="mt-0.5 text-[12.5px] text-[var(--detail-hero-muted)]">
            {t("bookDetail.authorRole")}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <section
      className={cn(
        DETAIL_CARD_CLASS,
        isNarrowHero && "detail-pane-narrow-hero",
        isNarrowCoverBackdropActive && "detail-pane-cover-backdrop-active",
        className,
      )}
      data-testid="book-detail-pane"
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-[340ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none",
          showMutedCoverBackdrop ? "opacity-100" : "opacity-0",
        )}
      >
        {coverSrc ? (
          <img
            src={coverSrc}
            alt=""
            className={cn(
              "size-full object-cover mix-blend-soft-light saturate-75 transition-opacity duration-[340ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none",
              isNarrowCoverBackdropActive
                ? "opacity-[0.18]"
                : "opacity-[0.055]",
            )}
            aria-hidden="true"
            onError={handleCoverError}
          />
        ) : (
          <div
            className={cn(
              "size-full saturate-75 transition-opacity duration-[340ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none",
              isNarrowCoverBackdropActive
                ? "opacity-[0.14]"
                : "opacity-[0.045]",
            )}
            style={{ background: generateCoverGradient(book.title) }}
            aria-hidden="true"
          />
        )}
      </div>
      <DetailPaneHeaderBar
        onBackToList={onBackToList}
        fullScreenAvailable={fullScreenAvailable}
        detailFullScreen={detailFullScreen}
        onToggleDetailFullScreen={onToggleDetailFullScreen}
        showSidebarToggle={showSidebarToggle}
      />
      <div
        ref={bodyHostRef}
        className="relative z-10 min-h-0 min-w-0 flex-1"
        data-overlayscrollbars-initialize
      >
        <div
          ref={bodyRef}
          onScroll={handleDetailScroll}
          className="detail-body myreader-overlay-viewport h-full min-w-0 overflow-x-hidden overflow-y-auto"
        >
          <div className={cn(!isNarrowHero && "pt-14")}>
            <div className="relative mx-auto w-full min-w-0 max-w-[1320px]">
              <div
                ref={setDetailHeroElement}
                className="detail-hero-responsive mb-8"
                data-narrow-hero={isNarrowHero ? "true" : undefined}
                data-wide-hero={forceWideHero ? "true" : undefined}
              >
                <div className="detail-mobile-hero overflow-hidden">
                  <div
                    ref={mobileCoverArtRef}
                    className="relative h-[clamp(420px,135cqw,560px)] overflow-hidden bg-[var(--detail-mobile-bg)]"
                  >
                    {coverSrc ? (
                      <img
                        src={coverSrc}
                        alt=""
                        className="absolute inset-0 size-full object-cover object-top"
                        aria-hidden="true"
                        onError={handleCoverError}
                      />
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{
                          background: generateCoverGradient(book.title),
                        }}
                        aria-hidden="true"
                      />
                    )}
                    <div
                      className="detail-mobile-hero-art-scrim absolute inset-0"
                      aria-hidden="true"
                    />
                    <div
                      className="detail-mobile-hero-art-fade absolute inset-x-0 bottom-0 h-44"
                      aria-hidden="true"
                    />
                    <div className="absolute inset-x-0 bottom-0 px-4 pb-6 sm:px-6 lg:px-8 xl:px-6 2xl:px-8">
                      <h1 className="detail-anim-1 break-words text-[28px] leading-[1.08] font-semibold tracking-normal text-[var(--detail-hero-fg)]">
                        {book.title}
                        {year && (
                          <span className="font-normal text-[var(--detail-hero-muted)]">
                            {" "}
                            ({year})
                          </span>
                        )}
                      </h1>

                      {seriesLabel && (
                        <div className="detail-anim-2 mt-2 text-[14px] font-medium text-[var(--detail-hero-muted)]">
                          {seriesLabel}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="detail-mobile-info-panel space-y-5 px-4 pt-4 pb-6 sm:px-6 lg:px-8 xl:px-6 2xl:px-8">
                    <div className="detail-anim-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[14.5px] font-medium text-[var(--detail-hero-body)]">
                      {book.pubdate && <span>{formatDate(book.pubdate)}</span>}
                      {book.pubdate && book.publisher && <MetaDot inverse />}
                      {book.publisher && <span>{book.publisher}</span>}
                      {(book.pubdate || book.publisher) && langDisplay && (
                        <MetaDot inverse />
                      )}
                      {langDisplay && <span>{langDisplay}</span>}
                    </div>

                    {book.tags.length > 0 && (
                      <div className="detail-anim-4 flex flex-wrap gap-2">
                        {book.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="detail-tag cursor-default rounded-md border-[var(--detail-hero-border)] bg-[var(--detail-hero-chip-bg)] px-2.5 py-1 text-[12.5px] font-[450] text-[var(--detail-hero-fg)]"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="detail-anim-6 flex min-w-0 items-center gap-2">
                      <BookProgressRing percent={progressPercent} />
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-[var(--detail-hero-fg)]">
                          {t("bookDetail.readingProgress")}
                        </div>
                        <div className="mt-0.5 text-[12.5px] text-[var(--detail-hero-muted)]">
                          {currentProgressDisplay.text}
                        </div>
                      </div>
                    </div>

                    <div className="detail-anim-5 flex min-w-0 items-center gap-2">
                      <Button
                        type="button"
                        className="detail-read-action h-12 min-w-[116px] max-w-none flex-none rounded-full px-5 text-[15px] font-semibold whitespace-nowrap shadow-sm active:scale-[0.98]"
                        disabled={!canReadInApp}
                        onClick={() => {
                          if (!canReadInApp) return
                          void navigateToRead(
                            book.id,
                            activeSelectedFormat ?? undefined,
                          )
                        }}
                      >
                        <BookOpen className="size-5" />
                        <span>{readButtonLabel}</span>
                      </Button>

                      <button
                        type="button"
                        className={detailIconActionButtonClassName}
                        title={
                          isFavorite
                            ? t("bookDetail.unfavorite")
                            : t("bookDetail.favorite")
                        }
                        aria-label={
                          isFavorite
                            ? t("bookDetail.unfavorite")
                            : t("bookDetail.favorite")
                        }
                        aria-pressed={isFavorite}
                        disabled={favoritePending}
                        onClick={handleToggleFavorite}
                      >
                        <Star
                          className={cn("size-6", isFavorite && "text-primary")}
                          fill={isFavorite ? "currentColor" : "none"}
                        />
                      </button>

                      <BookMoreMenu
                        book={book}
                        libraryId={activeLibraryId}
                        fileActionsEnabled={isRemoteLibrary}
                        selectedFormat={activeSelectedFormat ?? undefined}
                        triggerVariant="detail"
                      />
                    </div>

                    <div className="detail-anim-8 min-w-0">
                      <h2 className="mb-2 text-[19px] leading-none font-semibold text-[var(--detail-hero-fg)]">
                        {t("bookDetail.synopsis")}
                      </h2>
                      <div
                        className={cn(
                          "detail-synopsis-wrap relative overflow-hidden transition-[max-height] duration-300 ease-in-out",
                          hasSynopsis && !synopsisExpanded && "max-h-[7em]",
                        )}
                      >
                        <p
                          className={cn(
                            "text-[15px] leading-[1.7] whitespace-pre-line text-[var(--detail-hero-body)]",
                            !hasSynopsis && "text-[var(--detail-hero-subtle)]",
                          )}
                        >
                          {heroSynopsis}
                        </p>
                        {hasSynopsis && !synopsisExpanded && (
                          <div className="detail-hero-synopsis-fade pointer-events-none absolute inset-x-0 bottom-0 h-12" />
                        )}
                      </div>
                      {hasSynopsis && synopsisText.length > 160 && (
                        <button
                          type="button"
                          className="mt-2 inline-flex h-auto items-center gap-1 p-0 text-[13px] font-medium text-[var(--detail-hero-muted)] transition-colors hover:text-[var(--detail-hero-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          onClick={() => setSynopsisExpanded(!synopsisExpanded)}
                        >
                          {synopsisExpanded
                            ? t("bookDetail.collapse")
                            : t("bookDetail.expand")}
                          <ChevronDown
                            className={cn(
                              "size-3.5 transition-transform duration-300",
                              synopsisExpanded && "rotate-180",
                            )}
                          />
                        </button>
                      )}
                    </div>

                    <div className="detail-anim-8 flex shrink-0 flex-wrap gap-x-8 gap-y-3">
                      {authorCredits.map((author) => (
                        <div key={author} className="min-w-[5rem] max-w-full">
                          <div className="truncate text-[14.5px] font-semibold text-[var(--detail-hero-fg)]">
                            {author}
                          </div>
                          <div className="mt-0.5 text-[12.5px] text-[var(--detail-hero-muted)]">
                            {t("bookDetail.authorRole")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="detail-hero-shell overflow-hidden">
                  <div className="detail-hero-main-grid relative z-[2] grid min-w-0 grid-cols-[minmax(152px,33%)_minmax(0,1fr)] items-stretch gap-5 p-4 text-[var(--detail-hero-fg)] sm:p-5 2xl:grid-cols-[minmax(176px,33%)_minmax(0,1fr)] 2xl:gap-7 2xl:p-7">
                    <div className="detail-cover-wrap mx-auto w-[128px] max-w-[58vw] shrink-0 sm:mx-0 sm:w-full">
                      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl shadow-lg">
                        <div
                          className="absolute inset-0"
                          style={{
                            background: generateCoverGradient(book.title),
                          }}
                          aria-hidden="true"
                        />

                        {coverSrc ? (
                          <img
                            src={coverSrc}
                            alt={book.title}
                            className="absolute inset-0 size-full object-cover"
                            onError={handleCoverError}
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center px-5 py-6 text-center">
                            <div className="pointer-events-none absolute inset-0 bg-overlay" />
                            <span className="relative z-10 text-xl leading-[1.35] font-bold text-cover-fg">
                              {book.title}
                            </span>
                            <span className="relative z-10 mt-2 text-[12.5px] text-cover-muted">
                              {displayAuthors}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="detail-hero-info-column flex h-full min-w-0 flex-col justify-start gap-5">
                      <div className="min-w-0">
                        <h1 className="detail-hero-title detail-anim-1 break-words text-[27px] leading-[1.14] font-semibold tracking-normal text-[var(--detail-hero-fg)] sm:text-[29px] 2xl:text-[36px]">
                          {book.title}
                          {year && (
                            <span className="font-normal text-[var(--detail-hero-muted)]">
                              {" "}
                              ({year})
                            </span>
                          )}
                        </h1>

                        {seriesLabel && (
                          <div className="detail-hero-series detail-anim-2 mt-2 text-[15px] font-medium text-[var(--detail-hero-muted)]">
                            {seriesLabel}
                          </div>
                        )}

                        <div className="detail-hero-meta detail-anim-3 mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13.5px] font-medium text-[var(--detail-hero-body)]">
                          {book.pubdate && (
                            <span>{formatDate(book.pubdate)}</span>
                          )}
                          {book.pubdate && book.publisher && (
                            <MetaDot inverse />
                          )}
                          {book.publisher && <span>{book.publisher}</span>}
                          {(book.pubdate || book.publisher) && langDisplay && (
                            <MetaDot inverse />
                          )}
                          {langDisplay && <span>{langDisplay}</span>}
                        </div>

                        {book.tags.length > 0 && (
                          <div className="detail-hero-tags detail-anim-4 mt-3 flex flex-wrap gap-2">
                            {book.tags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="detail-tag cursor-default rounded-md border-[var(--detail-hero-border)] bg-[var(--detail-hero-chip-bg)] px-2.5 py-1 text-[12.5px] font-[450] text-[var(--detail-hero-fg)] backdrop-blur-sm"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="detail-anim-5 flex min-w-0 flex-col gap-3">
                        <div className="detail-hero-progress flex min-w-0 items-center gap-2">
                          <BookProgressRing percent={progressPercent} />
                          <div className="min-w-0">
                            <div className="text-[15px] font-semibold text-[var(--detail-hero-fg)]">
                              {t("bookDetail.readingProgress")}
                            </div>
                            <div className="mt-0.5 max-w-[108px] truncate text-[12.5px] text-[var(--detail-hero-muted)]">
                              {currentProgressDisplay.text}
                            </div>
                          </div>
                        </div>

                        <div className="detail-hero-action-row flex min-w-0 items-center gap-2">
                          <Button
                            type="button"
                            className="detail-read-action h-11 min-w-[116px] max-w-none flex-none rounded-full px-5 text-[15px] font-semibold whitespace-nowrap shadow-sm active:scale-[0.98]"
                            disabled={!canReadInApp}
                            onClick={() => {
                              if (!canReadInApp) return
                              void navigateToRead(
                                book.id,
                                activeSelectedFormat ?? undefined,
                              )
                            }}
                          >
                            <BookOpen className="size-5" />
                            <span>{readButtonLabel}</span>
                          </Button>

                          <button
                            type="button"
                            className={detailIconActionButtonClassName}
                            title={
                              isFavorite
                                ? t("bookDetail.unfavorite")
                                : t("bookDetail.favorite")
                            }
                            aria-label={
                              isFavorite
                                ? t("bookDetail.unfavorite")
                                : t("bookDetail.favorite")
                            }
                            aria-pressed={isFavorite}
                            disabled={favoritePending}
                            onClick={handleToggleFavorite}
                          >
                            <Star
                              className={cn(
                                "size-[18px]",
                                isFavorite && "text-primary",
                              )}
                              fill={isFavorite ? "currentColor" : "none"}
                            />
                          </button>

                          <BookMoreMenu
                            book={book}
                            libraryId={activeLibraryId}
                            fileActionsEnabled={isRemoteLibrary}
                            selectedFormat={activeSelectedFormat ?? undefined}
                            triggerVariant="detail"
                          />
                        </div>
                      </div>

                      <div className="detail-hero-side-extra space-y-5">
                        {renderHeroSynopsis(
                          "detail-anim-7",
                          "max-h-[5.2em]",
                          "text-[14.5px] leading-[1.72]",
                          "h-10",
                        )}
                        {renderHeroAuthors("detail-anim-8", "desktop-side")}
                      </div>
                    </div>

                    <div className="detail-hero-below-extra col-span-2 space-y-5 pt-1">
                      {renderHeroSynopsis(
                        "detail-anim-7",
                        "max-h-[7em]",
                        "text-[15px] leading-[1.7]",
                        "h-12",
                      )}
                      {renderHeroAuthors("detail-anim-8", "desktop-below")}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  "detail-content-stack min-w-0 px-4 pb-10 sm:px-6 lg:px-8 xl:px-6 2xl:px-8",
                  !isNarrowHero && "sm:px-5 lg:px-5 xl:px-5 2xl:px-7",
                )}
              >
                {/* Formats Table */}
                <div className="scroll-mt-6">
                  {book.formats.length > 0 && (
                    <DetailSection title={t("bookDetail.fileFormats")}>
                      <div className="book-format-table overflow-x-auto overflow-y-hidden rounded-md">
                        <table className="w-full min-w-[25rem] table-auto border-collapse">
                          <thead>
                            <tr className="bg-muted text-start text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                              <th className="w-12 rounded-ts-md px-2 py-2 text-center whitespace-nowrap">
                                {t("bookDetail.format")}
                              </th>
                              <th className="w-16 px-2 py-2 text-center whitespace-nowrap">
                                {t("bookDetail.size")}
                              </th>
                              <th className="w-24 px-3 py-2 text-start whitespace-nowrap">
                                {t("library.sort.progress")}
                              </th>
                              <th className="w-14 px-2 py-2 text-center whitespace-nowrap">
                                {t("bookDetail.defaultReadingFormat")}
                              </th>
                              <th className="w-20 rounded-te-md px-2 py-2 text-center whitespace-nowrap">
                                {t("bookDetail.action")}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {book.formats.map((fmt) => {
                              const upperFormat = fmt.toUpperCase()
                              const isReadable =
                                readableFormats.includes(upperFormat)
                              const isDefaultFormat =
                                activeSelectedFormat === upperFormat
                              const rowProgress = getBookProgressSnapshot(
                                progressByBookId,
                                book.id,
                                upperFormat,
                              )
                              const rowProgressDisplay = getProgressDisplay(
                                rowProgress,
                                t,
                              )
                              const rowReadLabel = getReadActionLabel(
                                rowProgress,
                                t,
                              )
                              const setDefaultFormatLabel = t(
                                "bookDetail.setDefaultFormatFor",
                                {
                                  format: upperFormat,
                                },
                              )
                              const setDefaultFormatTooltip = t(
                                "bookDetail.setAsDefaultReadingFormat",
                              )
                              const defaultFormatSwitch = (
                                <Switch
                                  size="sm"
                                  checked={isDefaultFormat}
                                  disabled={!isReadable || isDefaultFormat}
                                  aria-label={setDefaultFormatLabel}
                                  onCheckedChange={(checked) => {
                                    if (!checked || !isReadable) return
                                    setSelectedFormat(upperFormat)
                                    void setBookReadingFormat(
                                      book.id,
                                      upperFormat,
                                    )
                                  }}
                                />
                              )
                              return (
                                <tr
                                  key={fmt}
                                  className="border-b border-border transition-colors last:border-b-0 hover:bg-accent/30"
                                >
                                  <td className="px-2 py-3">
                                    <div className="flex min-w-0 items-center justify-center gap-2.5">
                                      <div
                                        className={cn(
                                          "flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase",
                                          getFormatTone(fmt),
                                        )}
                                      >
                                        {fmt}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-2 py-3 text-center text-[13.5px] whitespace-nowrap">
                                    {formatFileSize(
                                      formatSizeMap.get(fmt) ?? 0,
                                    )}
                                  </td>
                                  <td className="w-24 px-3 py-3">
                                    <div className="flex min-w-0 items-center gap-2">
                                      {rowProgress?.percent !== undefined ? (
                                        <>
                                          <div className="book-format-progress-bar flex min-w-0 flex-1 items-center gap-2">
                                            <Progress
                                              value={rowProgress.percent}
                                              className="h-1.5 min-w-10 flex-1"
                                            />
                                            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                                              {rowProgressDisplay.text}
                                            </span>
                                          </div>
                                          <span className="book-format-progress-compact shrink-0 items-center gap-1.5 text-[12px] tabular-nums text-muted-foreground">
                                            <CircularDownloadProgress
                                              percent={rowProgress.percent}
                                              className="size-5"
                                            />
                                            {rowProgressDisplay.text}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                                          {rowProgressDisplay.text}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="w-14 px-2 py-3 text-center">
                                    {!isDefaultFormat && isReadable ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          {defaultFormatSwitch}
                                        </TooltipTrigger>
                                        <TooltipContent
                                          side="top"
                                          align="center"
                                          sideOffset={6}
                                        >
                                          {setDefaultFormatTooltip}
                                        </TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      defaultFormatSwitch
                                    )}
                                  </td>
                                  <td className="px-2 py-3 text-center">
                                    <div className="flex justify-center">
                                      <ButtonGroup>
                                        {isReadable ? (
                                          <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            title={rowReadLabel}
                                            aria-label={rowReadLabel}
                                            onClick={() =>
                                              navigateToRead(book.id, fmt)
                                            }
                                          >
                                            <BookOpen />
                                          </Button>
                                        ) : null}
                                        {isRemoteLibrary && activeLibraryId ? (
                                          <FormatActionCell
                                            libraryId={activeLibraryId}
                                            bookId={book.id}
                                            format={fmt}
                                          />
                                        ) : null}
                                      </ButtonGroup>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </DetailSection>
                  )}
                </div>

                {/* Identifiers */}
                {book.identifiers.length > 0 && (
                  <DetailSection title={t("bookDetail.identifiersTitle")}>
                    <div className="flex flex-wrap gap-2.5">
                      {book.identifiers.map((id) => (
                        <div
                          key={id.idType}
                          className="flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-[13px]"
                        >
                          <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                            {identifierLabels[id.idType] ?? id.idType}
                          </span>
                          <span className="font-mono text-[12.5px]">
                            {id.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </DetailSection>
                )}

                <BookMetadataSection
                  activeLibraryName={activeLibrary?.name ?? null}
                  book={book}
                  formatCount={book.formats.length}
                />

                {/* Related Books (same series) */}
                {seriesBooks.length > 0 && book.series && (
                  <DetailSection
                    title={t("bookDetail.seriesSection", {
                      series: book.series,
                    })}
                    className="mb-4"
                  >
                    <div className="detail-horizontal-scrollbar flex gap-[18px] overflow-x-auto pb-2">
                      {seriesBooks.map((rb) => (
                        <RelatedBookCard
                          key={rb.id}
                          book={rb}
                          libraryId={activeLibraryId}
                          onClick={() =>
                            navigate({
                              to: "/book/$bookId",
                              params: { bookId: String(rb.id) },
                            })
                          }
                        />
                      ))}
                    </div>
                  </DetailSection>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function DetailPaneHeaderBar({
  onBackToList,
  fullScreenAvailable,
  detailFullScreen,
  onToggleDetailFullScreen,
  showSidebarToggle,
}: {
  onBackToList?: () => void
  fullScreenAvailable: boolean
  detailFullScreen: boolean
  onToggleDetailFullScreen?: () => void
  showSidebarToggle: boolean
}) {
  const { t } = useTranslation()
  const FullScreenIcon = detailFullScreen ? Minimize2 : Maximize2
  const fullScreenLabel = detailFullScreen
    ? t("reader.exitFullscreen")
    : t("reader.fullscreen")
  const NavigationIcon = fullScreenAvailable
    ? detailFullScreen
      ? ChevronLeft
      : X
    : ChevronLeft
  const navigationLabel = fullScreenAvailable
    ? detailFullScreen
      ? t("common.back")
      : t("common.close")
    : t("common.back")
  const navigationTestId =
    fullScreenAvailable && !detailFullScreen
      ? "book-detail-close"
      : "book-detail-back"
  const chromeButtonClass =
    "text-[var(--detail-hero-fg)] hover:bg-[var(--detail-hero-control-bg)] hover:text-[var(--detail-hero-fg)]"

  return (
    <header className="detail-headerbar pointer-events-none absolute inset-x-0 top-0 z-40 flex h-14 items-center justify-between gap-2 px-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-1">
        {showSidebarToggle ? (
          <AppSidebarToggle className={chromeButtonClass} />
        ) : null}
        {onBackToList ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={chromeButtonClass}
            title={navigationLabel}
            aria-label={navigationLabel}
            data-testid={navigationTestId}
            onClick={onBackToList}
          >
            <NavigationIcon className="detail-header-icon" />
          </Button>
        ) : null}
      </div>

      <div className="pointer-events-auto flex items-center gap-1">
        {fullScreenAvailable && onToggleDetailFullScreen ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={chromeButtonClass}
            title={fullScreenLabel}
            aria-label={fullScreenLabel}
            data-testid="book-detail-fullscreen-toggle"
            onClick={onToggleDetailFullScreen}
          >
            <FullScreenIcon className="detail-header-icon" />
          </Button>
        ) : null}
      </div>
    </header>
  )
}

function BookProgressRing({ percent }: { percent: number }) {
  const strokeOffset = 100 - Math.max(0, Math.min(100, percent))

  return (
    <div className="relative grid size-[60px] shrink-0 place-items-center rounded-full">
      <svg
        viewBox="0 0 36 36"
        className="absolute inset-0 size-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          pathLength="100"
          strokeWidth="3.5"
          className="stroke-[var(--detail-progress-track)]"
        />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={strokeOffset}
          strokeLinecap="round"
          strokeWidth="3.5"
          className="stroke-primary transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <div className="detail-progress-ring-inner absolute inset-1 grid place-items-center rounded-full">
        <span className="text-[18px] leading-none font-bold tabular-nums text-[var(--detail-hero-fg)]">
          {percent}
          <span className="text-[11px]">%</span>
        </span>
      </div>
    </div>
  )
}

function BookMetadataSection({
  activeLibraryName,
  book,
  formatCount,
}: {
  activeLibraryName: string | null
  book: BookDetail
  formatCount: number
}) {
  const { t } = useTranslation()
  const uuidValue = book.uuid
    ? book.uuid.length > 18
      ? `${book.uuid.slice(0, 8)}...${book.uuid.slice(-4)}`
      : book.uuid
    : "--"

  return (
    <DetailSection title={t("bookDetail.libraryInfo")}>
      <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
        {activeLibraryName && (
          <FactRow label={t("library.title")} value={activeLibraryName} />
        )}
        <FactRow
          label={t("bookDetail.fileFormats")}
          value={t("bookDetail.formatCount", { count: formatCount })}
        />
        <FactRow
          label={t("bookDetail.pubDate")}
          value={formatDate(book.pubdate)}
        />
        <FactRow
          label={t("bookDetail.addedDate")}
          value={formatDate(book.timestamp)}
        />
        <FactRow
          label={t("bookDetail.lastModified")}
          value={formatDate(book.lastModified)}
        />
        <FactRow label={t("bookDetail.uuid")} value={uuidValue} mono />
        <FactRow
          label={t("bookDetail.sortTitle")}
          value={book.authorSort || "--"}
        />
        <FactRow label={t("bookDetail.path")} value={book.path} mono />
      </dl>
    </DetailSection>
  )
}

function FactRow({
  label,
  value,
  mono,
}: {
  label: string
  value?: string
  mono?: boolean
}) {
  return (
    <div>
      <dt className="mb-1 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      {value ? (
        <dd
          className={cn(
            "min-w-0 break-words text-[13px] leading-relaxed font-medium",
            mono && "font-mono text-[12px]",
          )}
        >
          {value}
        </dd>
      ) : null}
    </div>
  )
}

function FormatActionCell({
  libraryId,
  bookId,
  format,
}: {
  libraryId: string
  bookId: number
  format: string
}) {
  return (
    <FormatActionCellV2 libraryId={libraryId} bookId={bookId} format={format} />
  )
}
function FormatActionCellV2({
  libraryId,
  bookId,
  format,
}: {
  libraryId: string
  bookId: number
  format: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fmt = format.toUpperCase()
  const [pending, setPending] = useState(false)
  const [cancelRequested, setCancelRequested] = useState(false)
  const cancelAfterStartRef = useRef(false)
  const { data: state, isLoading: stateLoading } = useBookFileState(
    libraryId,
    bookId,
    fmt,
  )
  const progress = useDownloadProgress(libraryId, bookId, fmt)

  useEffect(() => {
    if (
      progress?.status === "done" ||
      progress?.status === "error" ||
      progress?.status === "cancelled"
    ) {
      void queryClient.invalidateQueries({
        queryKey: bookFileStateKeys.detail(libraryId, bookId, fmt),
      })
    }
  }, [progress?.status, libraryId, bookId, fmt, queryClient])

  useEffect(() => {
    if (!progress?.status) return
    setPending(false)
    if (progress.status !== "starting" && progress.status !== "downloading") {
      setCancelRequested(false)
      cancelAfterStartRef.current = false
    }
  }, [progress?.status])

  const isDownloading =
    progress?.status === "starting" || progress?.status === "downloading"
  const isPreparing = pending && !isDownloading
  const isPresent = state?.localState === "present"
  const totalBytes = progress?.totalBytes ?? 0
  const bytesWritten = progress?.bytesWritten ?? 0
  const percent =
    totalBytes > 0
      ? Math.min(100, Math.round((bytesWritten / totalBytes) * 100))
      : undefined

  const invalidateFileState = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: bookFileStateKeys.detail(libraryId, bookId, fmt),
    })
  }, [libraryId, bookId, fmt, queryClient])

  const handleDownload = useCallback(() => {
    if (isDownloading || pending) return
    cancelAfterStartRef.current = false
    setCancelRequested(false)
    setPending(true)
    setDownloadStarting(libraryId, bookId, fmt, queryClient)
    api
      .downloadBookFile(libraryId, bookId, fmt)
      .then(() => {
        if (!cancelAfterStartRef.current) return
        setDownloadCancelled(libraryId, bookId, fmt, queryClient)
        return api
          .cancelBookDownload(libraryId, bookId, fmt)
          .then(invalidateFileState)
      })
      .catch((err) => {
        console.error(
          `Failed to download book file from detail. library id: "${libraryId}", book id: ${bookId}, format: "${fmt}", error:`,
          err,
        )
        setDownloadError(libraryId, bookId, fmt, String(err), queryClient)
        setPending(false)
        setCancelRequested(false)
        cancelAfterStartRef.current = false
      })
  }, [
    libraryId,
    bookId,
    fmt,
    isDownloading,
    pending,
    invalidateFileState,
    queryClient,
  ])

  const handleDelete = useCallback(() => {
    api
      .deleteLocalBookFile(libraryId, bookId, fmt)
      .then(() => {
        clearDownloadProgress(libraryId, bookId, fmt, queryClient)
        invalidateFileState()
      })
      .catch((err) => {
        console.error(
          `Failed to delete local book file from detail. library id: "${libraryId}", book id: ${bookId}, format: "${fmt}", error:`,
          err,
        )
        toast.error(t("bookDetail.deleteFileFailed"), {
          description: String(err),
        })
      })
  }, [libraryId, bookId, fmt, invalidateFileState, queryClient, t])

  const handleCancel = useCallback(() => {
    if (pending && !isDownloading) {
      cancelAfterStartRef.current = true
      setCancelRequested(true)
      return
    }
    setDownloadCancelled(libraryId, bookId, fmt, queryClient)
    api
      .cancelBookDownload(libraryId, bookId, fmt)
      .then(invalidateFileState)
      .catch((err) => {
        console.error(
          `Failed to cancel book download from detail. library id: "${libraryId}", book id: ${bookId}, format: "${fmt}", error:`,
          err,
        )
        toast.error(t("bookDetail.cancelDownloadFailed"), {
          description: String(err),
        })
        setDownloadStarting(libraryId, bookId, fmt, queryClient)
      })
  }, [
    libraryId,
    bookId,
    fmt,
    invalidateFileState,
    isDownloading,
    pending,
    queryClient,
    t,
  ])

  if (stateLoading) {
    return (
      <Button variant="ghost" size="icon-sm" disabled>
        <Loader2 className="animate-spin" />
      </Button>
    )
  }

  if (isPreparing || isDownloading) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className="group/download relative"
        title={t("bookDetail.cancelDownload")}
        aria-label={t("bookDetail.cancelDownload")}
        onClick={handleCancel}
        disabled={cancelRequested}
      >
        <CircularDownloadProgress
          percent={percent}
          className={cn(
            "transition-opacity group-hover/download:opacity-0",
            cancelRequested && "opacity-40",
          )}
        />
        {cancelRequested ? (
          <Loader2 className="absolute animate-spin opacity-100" />
        ) : (
          <X className="absolute opacity-0 transition-opacity group-hover/download:opacity-100" />
        )}
      </Button>
    )
  }

  if (isPresent) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-destructive hover:text-destructive"
        title={t("bookDetail.deleteFile")}
        aria-label={t("bookDetail.deleteFile")}
        onClick={handleDelete}
      >
        <Trash2 />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={t("bookDetail.downloadFile")}
      aria-label={t("bookDetail.downloadFile")}
      onClick={handleDownload}
      disabled={pending}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Download />}
    </Button>
  )
}

function MetaDot({ inverse = false }: { inverse?: boolean }) {
  return (
    <span
      className={cn(
        "inline-block size-[3px] rounded-full opacity-55",
        inverse ? "bg-[var(--detail-hero-dot)]" : "bg-muted-foreground",
      )}
    />
  )
}

function DetailSection({
  title,
  children,
  className,
  flush = false,
}: {
  title: string
  children: ReactNode
  className?: string
  flush?: boolean
}) {
  return (
    <div className={cn(!flush && "mt-8", className)}>
      <h2 className="mb-3 text-[15px] font-semibold">{title}</h2>
      {children}
    </div>
  )
}

function RelatedBookCard({
  book,
  libraryId,
  onClick,
}: {
  book: CalibreBook
  libraryId: string | null
  onClick: () => void
}) {
  const coverFailuresRevision = useSyncExternalStore(
    subscribeCoverFailures,
    getCoverFailuresRevision,
    getCoverFailuresRevision,
  )
  const coverFailureKey = getCoverFailureKey({
    libraryId,
    bookPath: book.path,
    kind: "expected",
  })
  const imgFailed = coverFailuresRevision >= 0 && isBrokenCover(coverFailureKey)
  const showCover = Boolean(book.hasCover && libraryId && !imgFailed)
  const { coverSrc, coverCacheKey, coverLoadError } = useCoverObjectUrl({
    libraryId,
    bookPath: book.path,
    enabled: showCover,
    reloadKey: coverFailuresRevision,
  })

  useEffect(() => {
    if (coverLoadError) {
      markBrokenCover(coverFailureKey)
    }
  }, [coverFailureKey, coverLoadError])

  return (
    <button
      type="button"
      onClick={onClick}
      className="group/related w-[120px] shrink-0 text-start"
    >
      <div className="relative aspect-[2/3] w-[120px] overflow-hidden rounded-lg shadow-md transition-all duration-200 group-hover/related:-translate-y-[3px]">
        <div
          className="absolute inset-0"
          style={{ background: generateCoverGradient(book.title) }}
          aria-hidden="true"
        />

        {coverSrc ? (
          <img
            src={coverSrc}
            alt={book.title}
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
            onError={() => {
              if (coverCacheKey) {
                removeCachedCoverObjectUrl(coverCacheKey)
              }
              markBrokenCover(coverFailureKey)
            }}
          />
        ) : (
          <div className="absolute inset-0 flex size-full flex-col items-center justify-center px-2 py-3 text-center">
            <span className="text-[13px] font-semibold text-cover-fg [text-shadow:0_1px_3px_rgba(0,0,0,0.3)]">
              {book.title}
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-[12.5px] leading-[1.3] font-semibold transition-colors duration-200 group-hover/related:text-primary">
        {book.title}
      </p>
      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
        {book.authors.join(", ")}
      </p>
    </button>
  )
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  return doc.body.textContent ?? ""
}
