import { errorMessage } from "@/lib/error-presentation"
import { apiErrorKind } from "@/lib/api-error"
import type { CalibreBook } from "@my-reader/tools/types/book"
import { useNavigate } from "@tanstack/react-router"
import { isTauri } from "@tauri-apps/api/core"
import {
  AlertCircle,
  ChevronLeft,
  Loader2,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import AppSidebarToggle from "@/components/library/AppSidebarToggle"
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
import { Input } from "@/components/ui/input"
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
import { openReaderInNewWindow } from "@/lib/readerWindow"
import { getBookProgressSnapshot } from "@/lib/readingProgress"
import type { BookDetail } from "@/lib/tauri-api"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import { BookDetailFrame, DETAIL_CARD_CLASS } from "./BookDetailFrame"
import { BookDetailHero } from "./BookDetailHero"
import { BookDetailFormats } from "./BookDetailFormats"
import { BookDetailSections } from "./BookDetailSections"
import { useBookDetailCover } from "@/hooks/useBookDetailCover"

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
  onLibraryChanged?: () => void
  onDeleteBook?: (book: Pick<BookDetail, "id" | "title">) => void
}

const MOBILE_HERO_BREAKPOINT = 559

type BookDetailFailure = "libraryUnavailable" | "loadFailed" | "notFound"

function classifyBookDetailFailure(error: unknown): BookDetailFailure {
  const kind = apiErrorKind(error)
  if (kind === "NoActiveLibrary" || kind === "LibraryNotFound")
    return "libraryUnavailable"
  return kind === "NotFound" ? "notFound" : "loadFailed"
}

export default function BookDetailPane({
  bookId,
  className,
  onBackToList,
  forceNarrowHero = false,
  forceWideHero = false,
  fullScreenAvailable,
  detailFullScreen,
  onToggleDetailFullScreen,
  showSidebarToggle,
  onLibraryChanged,
  onDeleteBook,
}: BookDetailPaneProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const activeLibraryId = useLibraryUiStore((s) => s.activeLibraryId)
  const { data: libraries = [], isLoading: librariesLoading } =
    useLibrariesQuery()
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

  const [book, setBook] = useState<BookDetail | null>(null)
  const [seriesBooks, setSeriesBooks] = useState<CalibreBook[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<BookDetailFailure | null>(null)
  const [reloadIndex, setReloadIndex] = useState(0)
  const [synopsisExpanded, setSynopsisExpanded] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null)
  const [isNarrowHero, setIsNarrowHero] = useState(false)
  const [showNarrowCoverBackdrop, setShowNarrowCoverBackdrop] = useState(false)
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftAuthors, setDraftAuthors] = useState("")
  const [savingMetadata, setSavingMetadata] = useState(false)
  const [detailHeroElement, setDetailHeroElement] =
    useState<HTMLDivElement | null>(null)

  const bodyHostRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const mobileCoverArtRef = useRef<HTMLDivElement>(null)

  useOverlayScrollbar(
    bodyHostRef,
    bodyRef,
    !loading && !failure && Boolean(book),
  )

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
      setFailure(null)
      setBook(null)
      if (librariesLoading) return
      if (!activeLibraryId || !activeLibrary) {
        setFailure("libraryUnavailable")
        setLoading(false)
        return
      }
      console.info(
        `Start to load book detail page. book id: "${bookId}", library id: "${activeLibraryId ?? ""}"`,
      )
      try {
        const detail = await api.getBookDetail(activeLibraryId, Number(bookId))
        if (cancelled) return
        setBook(detail)
        setFailure(null)
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
        setFailure(classifyBookDetailFailure(e))
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
  }, [activeLibrary, activeLibraryId, bookId, librariesLoading, reloadIndex])

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

  const { coverSrc, handleCoverError } = useBookDetailCover(
    book,
    activeLibraryId,
  )

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

  const handleReturnToLibrary = useCallback(() => {
    if (onBackToList) {
      onBackToList()
      return
    }
    navigate({ to: "/" })
  }, [navigate, onBackToList])

  const handleOpenMetadataEditor = useCallback(() => {
    if (!book) return
    setDraftTitle(book.title)
    setDraftAuthors(book.authors.join(", "))
    setMetadataDialogOpen(true)
  }, [book])

  const handleSaveMetadata = useCallback(async () => {
    if (!book || savingMetadata) return
    const title = draftTitle.trim()
    const authors = draftAuthors
      .split(/[,，]/)
      .map((author) => author.trim())
      .filter(Boolean)
    if (!title || authors.length === 0) return

    setSavingMetadata(true)
    try {
      const updated = await api.updateBookMetadata(
        activeLibraryId,
        book.id,
        title,
        authors,
      )
      setBook((current) => (current ? { ...current, ...updated } : current))
      setMetadataDialogOpen(false)
      onLibraryChanged?.()
    } catch (error) {
      toast.error(t("bookDetail.updateMetadataFailed"), {
        description: errorMessage(error),
      })
    } finally {
      setSavingMetadata(false)
    }
  }, [
    activeLibraryId,
    book,
    draftAuthors,
    draftTitle,
    onLibraryChanged,
    savingMetadata,
    t,
  ])

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

  const header = (
    <DetailPaneHeaderBar
      onBackToList={onBackToList}
      fullScreenAvailable={fullScreenAvailable}
      detailFullScreen={detailFullScreen}
      onToggleDetailFullScreen={onToggleDetailFullScreen}
      showSidebarToggle={showSidebarToggle}
    />
  )
  if (loading || failure || !book) {
    return (
      <BookDetailStatus
        loading={loading}
        failure={failure}
        className={className}
        header={header}
        onRetry={() => setReloadIndex((value) => value + 1)}
        onReturnToLibrary={handleReturnToLibrary}
      />
    )
  }

  const activeSelectedFormat =
    selectedFormat ??
    selectedFormatById[String(book.id)] ??
    book.preferredFormat
  const currentProgress = getBookProgressSnapshot(
    progressByBookId,
    book.id,
    activeSelectedFormat,
  )
  const isRemoteLibrary =
    activeLibrary?.sourceType != null && activeLibrary.sourceType !== "local"
  const isManagedLibrary = activeLibrary?.libraryType === "myreader"

  return (
    <BookDetailFrame
      className={className}
      title={book.title}
      isNarrowHero={isNarrowHero}
      forceWideHero={forceWideHero}
      showNarrowCoverBackdrop={showNarrowCoverBackdrop}
      coverSrc={coverSrc}
      handleCoverError={handleCoverError}
      bodyHostRef={bodyHostRef}
      bodyRef={bodyRef}
      handleDetailScroll={handleDetailScroll}
      setDetailHeroElement={setDetailHeroElement}
      header={header}
      hero={
        <BookDetailHero
          book={book}
          coverSrc={coverSrc}
          handleCoverError={handleCoverError}
          mobileCoverArtRef={mobileCoverArtRef}
          synopsisExpanded={synopsisExpanded}
          setSynopsisExpanded={setSynopsisExpanded}
          reading={{
            selectedFormat: activeSelectedFormat,
            progress: currentProgress,
            onRead: navigateToRead,
          }}
          actions={{
            libraryId: activeLibraryId,
            isRemoteLibrary,
            isManagedLibrary,
            isFavorite,
            favoritePending,
            onToggleFavorite: handleToggleFavorite,
            onEditMetadata: handleOpenMetadataEditor,
            onDeleteBook,
          }}
        />
      }
      content={
        <>
          <BookDetailFormats
            book={book}
            activeSelectedFormat={activeSelectedFormat}
            progressByBookId={progressByBookId}
            isRemoteLibrary={isRemoteLibrary}
            activeLibraryId={activeLibraryId}
            onSelectFormat={(format) => {
              setSelectedFormat(format)
              void setBookReadingFormat(book.id, format)
            }}
            navigateToRead={navigateToRead}
          />

          <BookDetailSections
            book={book}
            seriesBooks={seriesBooks}
            libraryId={activeLibraryId}
            libraryName={activeLibrary?.name ?? null}
            onOpenBook={(id) =>
              navigate({
                to: "/book/$bookId",
                params: { bookId: String(id) },
              })
            }
          />
        </>
      }
      dialog={
        <BookMetadataDialog
          open={metadataDialogOpen}
          onOpenChange={setMetadataDialogOpen}
          draftTitle={draftTitle}
          setDraftTitle={setDraftTitle}
          draftAuthors={draftAuthors}
          setDraftAuthors={setDraftAuthors}
          savingMetadata={savingMetadata}
          onSave={handleSaveMetadata}
        />
      }
    />
  )
}

function DetailPaneHeaderBar({
  onBackToList,
  fullScreenAvailable = false,
  detailFullScreen = false,
  onToggleDetailFullScreen,
  showSidebarToggle = false,
}: {
  onBackToList?: () => void
  fullScreenAvailable?: boolean
  detailFullScreen?: boolean
  onToggleDetailFullScreen?: () => void
  showSidebarToggle?: boolean
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

function BookMetadataDialog({
  open,
  onOpenChange,
  draftTitle,
  setDraftTitle,
  draftAuthors,
  setDraftAuthors,
  savingMetadata,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  draftTitle: string
  setDraftTitle: (value: string) => void
  draftAuthors: string
  setDraftAuthors: (value: string) => void
  savingMetadata: boolean
  onSave: () => Promise<void>
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bookDetail.editMetadataTitle")}</DialogTitle>
          <DialogDescription>{t("bookMore.editMetadata")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <label
            className="grid gap-2 text-sm font-medium"
            htmlFor="book-title"
          >
            {t("bookDetail.titleLabel")}
            <Input
              id="book-title"
              value={draftTitle}
              disabled={savingMetadata}
              onChange={(event) => setDraftTitle(event.target.value)}
            />
          </label>
          <label
            className="grid gap-2 text-sm font-medium"
            htmlFor="book-authors"
          >
            {t("bookDetail.authorsLabel")}
            <Input
              id="book-authors"
              value={draftAuthors}
              placeholder={t("bookDetail.authorsPlaceholder")}
              disabled={savingMetadata}
              onChange={(event) => setDraftAuthors(event.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={savingMetadata}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={
              savingMetadata ||
              !draftTitle.trim() ||
              !draftAuthors
                .split(/[,，]/)
                .some((author) => author.trim().length > 0)
            }
            onClick={() => void onSave()}
          >
            {savingMetadata
              ? t("bookDetail.savingMetadata")
              : t("bookDetail.saveMetadata")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BookDetailStatus({
  loading,
  failure,
  className,
  header,
  onRetry,
  onReturnToLibrary,
}: {
  loading: boolean
  failure: BookDetailFailure | null
  className?: string
  header: ReactNode
  onRetry: () => void
  onReturnToLibrary: () => void
}) {
  const { t } = useTranslation()
  if (loading) {
    return (
      <section
        className={cn(DETAIL_CARD_CLASS, className)}
        data-testid="book-detail-pane"
      >
        {header}
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

  const resolvedFailure = failure ?? "notFound"
  return (
    <section
      className={cn(DETAIL_CARD_CLASS, className)}
      data-testid="book-detail-pane"
    >
      {header}
      <Empty className="min-h-0 flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertCircle className="text-destructive" />
          </EmptyMedia>
          <EmptyTitle>{t(`bookDetail.${resolvedFailure}.title`)}</EmptyTitle>
          <EmptyDescription>
            {t(`bookDetail.${resolvedFailure}.detail`)}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            size="sm"
            onClick={
              resolvedFailure === "loadFailed" ? onRetry : onReturnToLibrary
            }
          >
            {t(
              resolvedFailure === "loadFailed"
                ? "bookDetail.retry"
                : "bookDetail.backToLibrary",
            )}
          </Button>
        </EmptyContent>
      </Empty>
    </section>
  )
}
