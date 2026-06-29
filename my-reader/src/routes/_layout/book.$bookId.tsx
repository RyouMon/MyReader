import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { CircularDownloadProgress } from "@/components/library/CircularDownloadProgress"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
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
import {
  clearDownloadProgress,
  setDownloadCancelled,
  setDownloadError,
  setDownloadStarting,
  useDownloadProgress,
} from "@/hooks/useDownloadProgress"
import { buildCoverUrl } from "@/lib/cover"
import { generateCoverGradient } from "@/lib/cover-gradient"
import { openReaderInNewWindow } from "@/lib/readerWindow"
import { getReadableFormats, pickReadableFormat } from "@/lib/readFormats"
import type { BookDetail } from "@/lib/tauri-api"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import type { CalibreBook } from "@my-reader/tools/types/book"
import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { isTauri } from "@tauri-apps/api/core"
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  Loader2,
  Star,
  Trash2,
  X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

export const Route = createFileRoute("/_layout/book/$bookId")({
  component: BookDetailPage,
})

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

function useFormatLabels(): Record<string, string> {
  const { t } = useTranslation()
  return {
    EPUB: t("bookDetail.formats.EPUB"),
    PDF: t("bookDetail.formats.PDF"),
    MOBI: t("bookDetail.formats.MOBI"),
    AZW3: t("bookDetail.formats.AZW3"),
    TXT: t("bookDetail.formats.TXT"),
    CBZ: t("bookDetail.formats.CBZ"),
    DJVU: t("bookDetail.formats.DJVU"),
    FB2: t("bookDetail.formats.FB2"),
  }
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

/** Module-level set consistent with BookCard */
const brokenCovers = new Set<string>()

function BookDetailPage() {
  const { t } = useTranslation()
  const { bookId } = useParams({ from: "/_layout/book/$bookId" })
  const navigate = useNavigate()
  const activeLibraryId = useLibraryUiStore((s) => s.activeLibraryId)
  const { data: libraries = [] } = useLibrariesQuery()
  const { data: selectedFormatById = {} } =
    useBookReadingFormats(activeLibraryId)
  const setBookReadingFormat = useSetBookReadingFormat(activeLibraryId)
  const activeLibrary = libraries.find((l) => l.id === activeLibraryId) ?? null
  const { favoriteSet } = useFavoriteBookSet(activeLibraryId)
  const {
    addFavoriteBook,
    removeFavoriteBook,
    isPending: favoritePending,
  } = useFavoriteBookMutations(activeLibraryId)
  const formatLabels = useFormatLabels()
  const identifierLabels = useIdentifierLabels()
  const languageMap = useLanguageMap()

  const [book, setBook] = useState<BookDetail | null>(null)
  const [seriesBooks, setSeriesBooks] = useState<CalibreBook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [synopsisExpanded, setSynopsisExpanded] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null)
  const [formatDropdownOpen, setFormatDropdownOpen] = useState(false)
  const [toolbarScrolled, setToolbarScrolled] = useState(false)
  const [coverFailed, setCoverFailed] = useState(false)

  const bodyRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      console.info(
        `Start to load book detail page. book id: "${bookId}", library id: "${activeLibraryId ?? ""}"`,
      )
      try {
        const detail = await api.getBookDetail(activeLibraryId, Number(bookId))
        setBook(detail)
        setSelectedFormat(null)
        setCoverFailed(brokenCovers.has(detail.path))
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
          setSeriesBooks(related)
          console.info(`Success to load series books. count: ${related.length}`)
        }
      } catch (e) {
        console.error(
          `Failed to load book detail page. book id: "${bookId}", library id: "${activeLibraryId ?? ""}", error:`,
          e,
        )
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [bookId, activeLibraryId])

  const handleScroll = useCallback(() => {
    if (bodyRef.current) {
      setToolbarScrolled(bodyRef.current.scrollTop > 8)
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setFormatDropdownOpen(false)
      }
    }
    document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [])

  const handleCoverError = useCallback(() => {
    if (book) {
      brokenCovers.add(book.path)
      setCoverFailed(true)
    }
  }, [book])

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

  if (loading) {
    return (
      <Empty className="min-h-0 flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Loader2 className="animate-spin" />
          </EmptyMedia>
          <EmptyTitle>{t("bookDetail.loading")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  if (error || !book) {
    return (
      <Empty className="min-h-0 flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertCircle className="text-destructive" />
          </EmptyMedia>
          <EmptyTitle>{t("bookDetail.loadFailed")}</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/" })}
          >
            {t("bookDetail.backToLibrary")}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const showRealCover = book.hasCover && activeLibraryId && !coverFailed
  const coverSrc = showRealCover
    ? buildCoverUrl(activeLibraryId, book.path)
    : null
  const year = extractYear(book.pubdate)
  const displayAuthors = book.authors.join(", ")
  const langDisplay = book.languages
    .map((code) => languageMap[code] ?? code)
    .join(", ")
  const ratingStars = book.rating ? Math.round(book.rating / 2) : 0
  const ratingValue = book.rating ? (book.rating / 2).toFixed(1) : null
  const formatSizeMap = new Map(
    book.formatSizes.map((fs) => [fs.format, fs.sizeBytes]),
  )
  const readableFormats = getReadableFormats(book.formats)
  const canReadInApp = readableFormats.length > 0
  const activeSelectedFormat =
    selectedFormat ??
    selectedFormatById[String(book.id)] ??
    pickReadableFormat(book.formats)
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

  return (
    <>
      {/* Toolbar */}
      <div
        className={cn(
          "detail-toolbar flex shrink-0 items-center gap-3 border-b bg-background px-7 py-3 transition-all duration-150 z-5",
          toolbarScrolled ? "border-border shadow-xs" : "border-transparent",
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/" })}
          className="group/back text-[13.5px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft
            data-icon="inline-start"
            className="transition-transform group-hover/back:-translate-x-0.5 rtl:group-hover/back:translate-x-0.5"
          />
          {t("bookDetail.backToLibrary")}
        </Button>

        <div className="ms-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "size-8",
              isFavorite && "text-primary hover:text-primary",
            )}
            title={
              isFavorite ? t("bookDetail.unfavorite") : t("bookDetail.favorite")
            }
            disabled={favoritePending}
            onClick={handleToggleFavorite}
          >
            <Star
              className="size-[18px]"
              fill={isFavorite ? "currentColor" : "none"}
            />
          </Button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div
        ref={bodyRef}
        className="detail-body flex-1 overflow-y-auto px-9 pt-7 pb-12"
        onScroll={handleScroll}
      >
        <div className="mx-auto max-w-[56rem]">
          {/* Hero */}
          <div className="detail-hero mb-8 flex gap-9">
            {/* Cover */}
            <div className="detail-cover-wrap w-[220px] shrink-0">
              <div className="relative aspect-[2/3] w-[220px] overflow-hidden rounded-xl shadow-md">
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
                    onError={handleCoverError}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-6 py-6 text-center">
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, transparent 55%, var(--cover-scrim-rest))",
                      }}
                    />
                    <span className="relative z-10 text-2xl leading-[1.35] font-bold text-ink-inverse [text-shadow:0_2px_6px_rgba(0,0,0,0.3)]">
                      {book.title}
                    </span>
                    <span className="relative z-10 mt-2 text-[13px] text-ink-inverse/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.2)]">
                      {displayAuthors}
                    </span>
                  </div>
                )}

                {/* Format badges on cover */}
                {book.formats.length > 0 && (
                  <div className="absolute end-3 bottom-3 start-3 z-[2] flex flex-wrap gap-[5px]">
                    {book.formats.map((fmt) => (
                      <Badge
                        key={fmt}
                        variant="outline"
                        className="rounded-sm border-ink-inverse/10 bg-overlay px-2 py-[3px] text-[11px] font-semibold uppercase tracking-wide text-ink-inverse/90 backdrop-blur-sm"
                      >
                        {fmt}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Meta */}
            <div className="detail-meta flex min-w-0 flex-1 flex-col pt-1">
              <h1 className="detail-anim-1 text-[28px] leading-[1.3] font-bold">
                {book.title}
              </h1>

              {seriesLabel && (
                <div className="detail-anim-2 mt-1 text-[15px] text-muted-foreground">
                  {seriesLabel}
                </div>
              )}

              <div className="detail-anim-3 mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
                {book.authors.map((author) => (
                  <span
                    key={author}
                    className="cursor-pointer text-[15px] font-medium text-primary transition-colors hover:text-accent-foreground"
                  >
                    {author}
                  </span>
                ))}
              </div>

              <div className="detail-anim-4 my-3.5 h-px w-full bg-border" />

              {/* Meta row */}
              <div className="detail-anim-5 flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-[13.5px] text-muted-foreground">
                {year && <span>{year}</span>}
                {year && book.publisher && <MetaDot />}
                {book.publisher && <span>{book.publisher}</span>}
                {(year || book.publisher) && langDisplay && <MetaDot />}
                {langDisplay && <span>{langDisplay}</span>}
                {ratingValue && (
                  <>
                    <MetaDot />
                    <span className="flex items-center gap-1.5">
                      <span className="flex gap-0.5">
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star
                            key={i}
                            className="size-[13px]"
                            fill={i < ratingStars ? "currentColor" : "none"}
                            color={
                              i < ratingStars
                                ? "var(--primary)"
                                : "currentColor"
                            }
                          />
                        ))}
                      </span>
                      {ratingValue}
                    </span>
                  </>
                )}
              </div>

              {/* Tags */}
              {book.tags.length > 0 && (
                <div className="detail-anim-6 mt-4 flex flex-wrap gap-2">
                  {book.tags.map((tag, i) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="detail-tag cursor-default bg-card px-3 py-1 text-[12.5px] font-[450] text-secondary-foreground transition-colors hover:border-primary hover:bg-secondary hover:text-primary"
                      style={{ animationDelay: `${0.42 + i * 0.04}s` }}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Reading progress placeholder */}
              <div className="detail-anim-7 mt-[18px] flex items-center gap-2.5">
                <BookOpen className="size-[15px] text-primary opacity-80" />
                <Progress value={0} className="h-[5px] max-w-[200px]" />
                <span className="text-[13px] tabular-nums text-muted-foreground">
                  {t("library.notAdded")}
                </span>
              </div>

              {/* Actions */}
              <div className="detail-anim-8 mt-[22px] flex flex-wrap items-stretch gap-2.5">
                {/* Split read button */}
                <div className="flex overflow-hidden rounded-md border border-primary/20 bg-primary text-primary-foreground shadow-sm">
                  <Button
                    disabled={!canReadInApp}
                    className="rounded-none border-0 bg-transparent px-[22px] py-2.5 text-[15px] font-semibold text-primary-foreground shadow-none hover:bg-primary/90"
                    onClick={() => {
                      if (!canReadInApp) return
                      void navigateToRead(
                        book.id,
                        activeSelectedFormat ?? undefined,
                      )
                    }}
                  >
                    <BookOpen
                      data-icon="inline-start"
                      className="size-[18px]"
                    />
                    <span>{t("bookCard.startReading")}</span>
                    {activeSelectedFormat && (
                      <span className="ms-0.5 text-[13px] font-normal opacity-80">
                        ({activeSelectedFormat})
                      </span>
                    )}
                  </Button>
                  <div ref={dropdownRef} className="relative">
                    <Button
                      variant="ghost"
                      disabled={!canReadInApp}
                      className="h-full rounded-none border-0 border-s border-white/20 bg-transparent px-3 text-primary-foreground hover:bg-primary/90"
                      onClick={(e) => {
                        e.stopPropagation()
                        setFormatDropdownOpen(!formatDropdownOpen)
                      }}
                    >
                      <ChevronDown className="size-[14px]" />
                    </Button>
                    {formatDropdownOpen && (
                      <div className="animate-in fade-in-0 slide-in-from-top-1 absolute top-[calc(100%+6px)] end-0 z-50 min-w-[200px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg duration-150">
                        <div className="border-b border-border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("bookDetail.selectFormat")}
                        </div>
                        {readableFormats.map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[13.5px] transition-colors hover:bg-accent",
                              activeSelectedFormat === fmt &&
                                "bg-primary/8 font-medium text-primary",
                            )}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedFormat(fmt)
                              setFormatDropdownOpen(false)
                              navigateToRead(book.id, fmt)
                            }}
                          >
                            <div
                              className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-md text-[11px] font-bold uppercase",
                                getFormatTone(fmt),
                              )}
                            >
                              {fmt}
                            </div>
                            <div className="min-w-0 flex-1 text-start">
                              <div className="font-semibold">{fmt}</div>
                              <div className="mt-px text-[12px] text-muted-foreground">
                                {formatFileSize(formatSizeMap.get(fmt) ?? 0)}
                                {formatLabels[fmt]
                                  ? ` 路 ${formatLabels[fmt]}`
                                  : ""}
                              </div>
                            </div>
                            <div className="w-4 shrink-0">
                              {activeSelectedFormat === fmt && (
                                <Check className="size-4 text-primary" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Synopsis */}
          {book.comment && (
            <DetailSection title={t("bookDetail.synopsis")}>
              <div
                className={cn(
                  "detail-synopsis-wrap relative overflow-hidden transition-[max-height] duration-300 ease-in-out",
                  !synopsisExpanded && "max-h-[7.5em]",
                )}
              >
                <div className="text-[14.5px] leading-[1.85] whitespace-pre-line">
                  {stripHtml(book.comment)}
                </div>
                {!synopsisExpanded && (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
                    style={{
                      background:
                        "linear-gradient(to bottom, transparent, var(--background))",
                    }}
                  />
                )}
              </div>
              <Button
                variant="link"
                size="sm"
                className="mt-2 h-auto gap-1 px-0 text-[13px] font-medium"
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
              </Button>
            </DetailSection>
          )}

          {/* Formats Table */}
          {book.formats.length > 0 && (
            <DetailSection title={t("bookDetail.fileFormats")}>
              <div className="overflow-hidden rounded-t-md">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-muted text-start text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="rounded-ts-md px-3.5 py-2">
                        {t("bookDetail.format")}
                      </th>
                      <th className="px-3.5 py-2">{t("bookDetail.size")}</th>
                      <th className="px-3.5 py-2 text-center">
                        {t("bookDetail.defaultReadingFormat")}
                      </th>
                      <th className="rounded-te-md px-3.5 py-2 text-end">
                        {t("bookDetail.action")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {book.formats.map((fmt) => {
                      const upperFormat = fmt.toUpperCase()
                      const isReadable = readableFormats.includes(upperFormat)
                      const isDefaultFormat =
                        activeSelectedFormat === upperFormat
                      return (
                        <tr
                          key={fmt}
                          className="border-b border-border transition-colors last:border-b-0 hover:bg-accent/30"
                        >
                          <td className="px-3.5 py-3">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={cn(
                                  "flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase",
                                  getFormatTone(fmt),
                                )}
                              >
                                {fmt}
                              </div>
                              <span className="text-[13.5px] font-medium">
                                {fmt}
                              </span>
                            </div>
                          </td>
                          <td className="px-3.5 py-3 text-[13.5px]">
                            {formatFileSize(formatSizeMap.get(fmt) ?? 0)}
                          </td>
                          <td className="px-3.5 py-3 text-center">
                            <Switch
                              size="sm"
                              checked={isDefaultFormat}
                              disabled={!isReadable || isDefaultFormat}
                              aria-label={t("bookDetail.setDefaultFormatFor", {
                                format: upperFormat,
                              })}
                              onCheckedChange={(checked) => {
                                if (!checked || !isReadable) return
                                setSelectedFormat(upperFormat)
                                void setBookReadingFormat(book.id, upperFormat)
                              }}
                            />
                          </td>
                          <td className="px-3.5 py-3 text-end">
                            <div className="flex justify-end">
                              <ButtonGroup>
                                {isReadable ? (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    title={t("bookCard.startReading")}
                                    aria-label={t("bookCard.startReading")}
                                    onClick={() => navigateToRead(book.id, fmt)}
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

          {/* Identifiers */}
          {book.identifiers.length > 0 && (
            <DetailSection title={t("bookDetail.identifiersTitle")}>
              <div className="flex flex-wrap gap-2.5">
                {book.identifiers.map((id) => (
                  <div
                    key={id.idType}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[13px]"
                  >
                    <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                      {identifierLabels[id.idType] ?? id.idType}
                    </span>
                    <span className="font-mono text-[12.5px]">{id.value}</span>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          {/* File Details */}
          <DetailSection title={t("bookDetail.libraryInfo")}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
              <InfoCard
                label={t("bookDetail.addedDate")}
                value={formatDate(book.timestamp)}
              />
              <InfoCard
                label={t("bookDetail.pubDate")}
                value={formatDate(book.pubdate)}
              />
              <InfoCard
                label={t("bookDetail.lastModified")}
                value={formatDate(book.lastModified)}
              />
              {book.uuid && (
                <InfoCard
                  label={t("bookDetail.uuid")}
                  value={
                    book.uuid.length > 16
                      ? `${book.uuid.slice(0, 8)}鈥?{book.uuid.slice(-4)}`
                      : book.uuid
                  }
                  mono
                />
              )}
              <InfoCard label={t("bookDetail.path")} value={book.path} mono />
              <InfoCard
                label={t("bookDetail.sortTitle")}
                value={book.authorSort}
              />
            </div>
          </DetailSection>

          {/* Related Books (same series) */}
          {seriesBooks.length > 0 && book.series && (
            <DetailSection
              title={t("bookDetail.seriesSection", { series: book.series })}
              className="mb-4"
            >
              <div className="flex gap-[18px] overflow-x-auto pb-2">
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

      {/* Status Bar */}
      <footer className="flex shrink-0 items-center justify-between border-t border-border bg-background px-7 py-2 text-[12.5px] text-muted-foreground">
        <span>
          {book.title} 路{" "}
          {t("bookDetail.formatCount", { count: book.formats.length })} 路{" "}
          {book.path}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              activeLibrary
                ? "bg-library-indicator-on"
                : "bg-library-indicator-off",
            )}
          />
          {activeLibrary
            ? t("bookDetail.synced")
            : t("bookDetail.notConnected")}
        </div>
      </footer>
    </>
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

function MetaDot() {
  return (
    <span className="inline-block size-[3px] rounded-full bg-muted-foreground opacity-50" />
  )
}

function DetailSection({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("mt-9", className)}>
      <h2 className="mb-3.5 border-b border-border pb-2.5 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </div>
  )
}

function InfoCard({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3.5">
      <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-sm font-medium",
          mono && "font-mono break-all text-[12.5px]",
        )}
      >
        {value}
      </div>
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
  const [imgFailed, setImgFailed] = useState(() => brokenCovers.has(book.path))
  const showCover = book.hasCover && libraryId && !imgFailed
  const coverSrc = showCover ? buildCoverUrl(libraryId, book.path) : null

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
              brokenCovers.add(book.path)
              setImgFailed(true)
            }}
          />
        ) : (
          <div className="absolute inset-0 flex size-full flex-col items-center justify-center px-2 py-3 text-center">
            <span className="text-[13px] font-semibold text-ink-inverse [text-shadow:0_1px_3px_rgba(0,0,0,0.3)]">
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
