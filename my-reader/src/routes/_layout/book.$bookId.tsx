import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { invoke, isTauri } from "@tauri-apps/api/core"
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  EllipsisVertical,
  FolderOpen,
  Plus,
  Send,
  Star,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useLibrary } from "@/stores/libraryStore"
import { buildCoverUrl } from "@/lib/cover"
import { openReaderInNewWindow } from "@/lib/readerWindow"
import {
  isReadableInAppFormat,
  pickReadableFormat,
} from "@/lib/readFormats"
import { cn } from "@/lib/utils"
import type { BookDetail, CalibreBook } from "my-reader-tools/types/book"

export const Route = createFileRoute("/_layout/book/$bookId")({
  component: BookDetailPage,
})

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function generateCoverGradient(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360
  return `linear-gradient(160deg, hsl(${hue}, 30%, 30%) 0%, hsl(${hue + 30}, 25%, 20%) 50%, hsl(${hue + 15}, 20%, 15%) 100%)`
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

const FORMAT_LABELS: Record<string, string> = {
  EPUB: "可重排版",
  PDF: "固定版式",
  MOBI: "Kindle 格式",
  AZW3: "Kindle 格式",
  TXT: "纯文本",
  CBZ: "漫画归档",
  DJVU: "扫描文档",
  FB2: "FictionBook",
}

const IDENTIFIER_LABELS: Record<string, string> = {
  isbn: "ISBN",
  goodreads: "Goodreads",
  douban: "豆瓣",
  amazon: "Amazon",
  google: "Google",
  barnesnoble: "B&N",
}

function formatLanguage(code: string): string {
  const map: Record<string, string> = {
    zho: "中文",
    chi: "中文",
    eng: "English",
    jpn: "日本語",
    kor: "한국어",
    fra: "Français",
    deu: "Deutsch",
    spa: "Español",
    rus: "Русский",
  }
  return map[code] ?? code
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  try {
    const d = new Date(dateStr)
    if (d.getFullYear() <= 100) return "—"
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
  const { bookId } = useParams({ from: "/_layout/book/$bookId" })
  const navigate = useNavigate()
  const { activeLibraryId, activeLibrary } = useLibrary()

  const [book, setBook] = useState<BookDetail | null>(null)
  const [seriesBooks, setSeriesBooks] = useState<CalibreBook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFavorite, setIsFavorite] = useState(false)
  const [onShelf, setOnShelf] = useState(true)
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
        const detail = await invoke<BookDetail>("get_book_detail", {
          libraryId: activeLibraryId,
          bookId: Number(bookId),
        })
        setBook(detail)
        setSelectedFormat(pickReadableFormat(detail.formats))
        setCoverFailed(brokenCovers.has(detail.path))
        console.info(
          `Success to load book detail. book id: ${detail.id}, title: "${detail.title}", series: "${detail.series ?? ""}"`,
        )

        if (detail.series) {
          console.info(
            `Start to load series books. series name: "${detail.series}", exclude book id: ${detail.id}`,
          )
          const related = await invoke<CalibreBook[]>("get_series_books", {
            libraryId: activeLibraryId,
            seriesName: detail.series,
            excludeBookId: detail.id,
          })
          setSeriesBooks(related)
          console.info(
            `Success to load series books. count: ${related.length}`,
          )
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

  const navigateToRead = useCallback(
    async (id: number, fmt?: string) => {
      if (isTauri()) {
        console.info(
          `Start to open reader window from book detail. book id: ${id}, format: "${fmt?.toUpperCase() ?? ""}", title: "${book?.title ?? ""}"`,
        )
        try {
          await openReaderInNewWindow(String(id), fmt?.toUpperCase(), book?.title)
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
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="size-8 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
        <p className="text-sm">加载书籍详情…</p>
      </div>
    )
  }

  if (error || !book) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center text-destructive">
        <p className="text-base font-medium">加载失败</p>
        <p className="max-w-md text-sm opacity-80">{error}</p>
        <Button
          variant="link"
          size="sm"
          onClick={() => navigate({ to: "/" })}
          className="mt-2 px-0 text-sm"
        >
          返回书库
        </Button>
      </div>
    )
  }

  const showRealCover = book.hasCover && activeLibraryId && !coverFailed
  const coverSrc = showRealCover
    ? buildCoverUrl(activeLibraryId, book.path)
    : null
  const year = extractYear(book.pubdate)
  const displayAuthors = book.authors.join(", ")
  const langDisplay = book.languages.map(formatLanguage).join(", ")
  const ratingStars = book.rating ? Math.round(book.rating / 2) : 0
  const ratingValue = book.rating ? (book.rating / 2).toFixed(1) : null
  const formatSizeMap = new Map(
    book.formatSizes.map((fs) => [fs.format, fs.sizeBytes]),
  )
  const readableFormats = book.formats.filter(isReadableInAppFormat)
  const canReadInApp = readableFormats.length > 0

  const seriesLabel =
    book.series && book.seriesIndex
      ? `${book.series} · 第 ${Number.isInteger(book.seriesIndex) ? book.seriesIndex : book.seriesIndex.toFixed(1)} 部`
      : book.series

  return (
    <>
      {/* Toolbar */}
      <div
        className={cn(
          "detail-toolbar flex shrink-0 items-center gap-3 border-b bg-background px-7 py-3 transition-all duration-150 z-5",
          toolbarScrolled
            ? "border-border shadow-xs"
            : "border-transparent",
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/" })}
          className="group/back text-[13.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft
            data-icon="inline-start"
            className="transition-transform group-hover/back:-translate-x-0.5"
          />
          返回书库
        </Button>

        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "size-8",
              isFavorite && "text-primary hover:text-primary",
            )}
            title={isFavorite ? "取消收藏" : "收藏"}
            onClick={() => setIsFavorite(!isFavorite)}
          >
            <Star
              className="size-[18px]"
              fill={isFavorite ? "currentColor" : "none"}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="打开文件位置"
          >
            <FolderOpen className="size-[18px]" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" title="更多">
            <EllipsisVertical className="size-[18px]" />
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
              <div className="relative aspect-[2/3] w-[220px] overflow-hidden rounded-xl shadow-cover">
                {coverSrc ? (
                  <img
                    src={coverSrc}
                    alt={book.title}
                    className="absolute inset-0 size-full object-cover"
                    onError={handleCoverError}
                  />
                ) : (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center px-6 py-6 text-center"
                    style={{ background: generateCoverGradient(book.title) }}
                  >
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, transparent 55%, var(--cover-scrim-rest))",
                      }}
                    />
                    <span className="relative z-10 font-serif text-2xl leading-[1.35] font-bold text-ink-inverse [text-shadow:0_2px_6px_rgba(0,0,0,0.3)]">
                      {book.title}
                    </span>
                    <span className="relative z-10 mt-2 text-[13px] text-ink-inverse/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.2)]">
                      {displayAuthors}
                    </span>
                  </div>
                )}

                {/* Format badges on cover */}
                {book.formats.length > 0 && (
                  <div className="absolute right-3 bottom-3 left-3 z-[2] flex flex-wrap gap-[5px]">
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
              <h1 className="detail-anim-1 font-serif text-[28px] leading-[1.3] font-bold">
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
                            color={i < ratingStars ? "var(--primary)" : "currentColor"}
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
                  未开始
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
                      const fmt =
                        selectedFormat ?? pickReadableFormat(book.formats)
                      void navigateToRead(book.id, fmt ?? undefined)
                    }}
                  >
                    <BookOpen data-icon="inline-start" className="size-[18px]" />
                    <span>开始阅读</span>
                    {selectedFormat && (
                      <span className="ml-0.5 text-[13px] font-normal opacity-80">
                        ({selectedFormat})
                      </span>
                    )}
                  </Button>
                  <div ref={dropdownRef} className="relative">
                    <Button
                      variant="ghost"
                      disabled={!canReadInApp}
                      className="h-full rounded-none border-0 border-l border-white/20 bg-transparent px-3 text-primary-foreground hover:bg-primary/90"
                      onClick={(e) => {
                        e.stopPropagation()
                        setFormatDropdownOpen(!formatDropdownOpen)
                      }}
                    >
                      <ChevronDown className="size-[14px]" />
                    </Button>
                    {formatDropdownOpen && (
                      <div className="animate-in fade-in-0 slide-in-from-top-1 absolute top-[calc(100%+6px)] right-0 z-50 min-w-[200px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg duration-150">
                        <div className="border-b border-border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          选择阅读格式
                        </div>
                        {readableFormats.map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[13.5px] transition-colors hover:bg-accent",
                              selectedFormat === fmt &&
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
                                "flex size-8 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-bold uppercase",
                                getFormatTone(fmt),
                              )}
                            >
                              {fmt}
                            </div>
                            <div className="min-w-0 flex-1 text-left">
                              <div className="font-semibold">{fmt}</div>
                              <div className="mt-px text-[12px] text-muted-foreground">
                                {formatFileSize(formatSizeMap.get(fmt) ?? 0)}
                                {FORMAT_LABELS[fmt]
                                  ? ` · ${FORMAT_LABELS[fmt]}`
                                  : ""}
                              </div>
                            </div>
                            <div className="w-4 shrink-0">
                              {selectedFormat === fmt && (
                                <Check className="size-4 text-primary" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  variant="outline"
                  className={cn(
                    "gap-[7px] px-5",
                    onShelf &&
                      "border-primary bg-primary/8 font-medium text-primary hover:bg-primary/12",
                  )}
                  onClick={() => setOnShelf(!onShelf)}
                >
                  {onShelf ? (
                    <Check className="size-4" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {onShelf ? "已加入书架" : "加入书架"}
                </Button>

                <Button variant="outline" className="gap-[5px] px-3.5">
                  <Download className="size-[15px]" />
                  下载
                </Button>
              </div>
            </div>
          </div>

          {/* Synopsis */}
          {book.comment && (
            <DetailSection title="简介">
              <div
                className={cn(
                  "detail-synopsis-wrap relative overflow-hidden transition-[max-height] duration-300 ease-in-out",
                  !synopsisExpanded && "max-h-[7.5em]",
                )}
              >
                <div
                  className="text-[14.5px] leading-[1.85] whitespace-pre-line"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: Calibre stores HTML comments
                  dangerouslySetInnerHTML={{ __html: stripHtml(book.comment) }}
                />
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
                {synopsisExpanded ? "收起" : "展开全文"}
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
            <DetailSection title="文件格式">
              <div className="overflow-hidden rounded-t-md">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-muted text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="rounded-tl-md px-3.5 py-2">格式</th>
                      <th className="px-3.5 py-2">大小</th>
                      <th className="rounded-tr-md px-3.5 py-2 text-right">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {book.formats.map((fmt) => (
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
                        <td className="px-3.5 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {isReadableInAppFormat(fmt) ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 border-primary bg-primary/8 px-2.5 text-[12px] font-medium text-primary hover:bg-primary/12"
                                onClick={() => navigateToRead(book.id, fmt)}
                              >
                                <BookOpen className="size-3" />
                                阅读
                              </Button>
                            ) : (
                              <span className="pr-2 text-[12px] text-muted-foreground">
                                不支持
                              </span>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="size-7 p-0"
                            >
                              <Download className="size-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="size-7 p-0"
                            >
                              <Send className="size-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailSection>
          )}

          {/* Identifiers */}
          {book.identifiers.length > 0 && (
            <DetailSection title="标识符">
              <div className="flex flex-wrap gap-2.5">
                {book.identifiers.map((id) => (
                  <div
                    key={id.idType}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[13px]"
                  >
                    <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                      {IDENTIFIER_LABELS[id.idType] ?? id.idType}
                    </span>
                    <span className="font-mono text-[12.5px]">{id.value}</span>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          {/* File Details */}
          <DetailSection title="书库信息">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
              <InfoCard label="添加日期" value={formatDate(book.timestamp)} />
              <InfoCard label="出版日期" value={formatDate(book.pubdate)} />
              <InfoCard
                label="最后修改"
                value={formatDate(book.lastModified)}
              />
              {book.uuid && (
                <InfoCard
                  label="UUID"
                  value={
                    book.uuid.length > 16
                      ? `${book.uuid.slice(0, 8)}…${book.uuid.slice(-4)}`
                      : book.uuid
                  }
                  mono
                />
              )}
              <InfoCard label="库中路径" value={book.path} mono />
              <InfoCard label="排序标题" value={book.authorSort} />
            </div>
          </DetailSection>

          {/* Related Books (same series) */}
          {seriesBooks.length > 0 && book.series && (
            <DetailSection title={`同系列 · ${book.series}`} className="mb-4">
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
          {book.title} · {book.formats.length} 种格式 · {book.path}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              activeLibrary ? "bg-library-indicator-on" : "bg-library-indicator-off",
            )}
          />
          {activeLibrary ? "已同步" : "未连接"}
        </div>
      </footer>
    </>
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
      <h2 className="mb-3.5 border-b border-border pb-2.5 font-serif text-lg font-semibold">
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
      className="group/related w-[120px] shrink-0 text-left"
    >
      <div className="aspect-[2/3] w-[120px] overflow-hidden rounded-lg shadow-card transition-all duration-200 group-hover/related:-translate-y-[3px]">
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={book.title}
            className="size-full object-cover"
            loading="lazy"
            onError={() => {
              brokenCovers.add(book.path)
              setImgFailed(true)
            }}
          />
        ) : (
          <div
            className="flex size-full flex-col items-center justify-center px-2 py-3 text-center"
            style={{ background: generateCoverGradient(book.title) }}
          >
            <span className="font-serif text-[13px] font-semibold text-ink-inverse [text-shadow:0_1px_3px_rgba(0,0,0,0.3)]">
              {book.title}
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 font-serif text-[12.5px] leading-[1.3] font-semibold transition-colors duration-200 group-hover/related:text-primary">
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
