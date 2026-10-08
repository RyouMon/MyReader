import { extractYear } from "@my-reader/tools/book-metadata"
import { BookOpen, ChevronDown, Star } from "lucide-react"
import type { Ref } from "react"
import { useTranslation } from "react-i18next"
import { SectionHeader } from "@/components/common/SectionHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { generateCoverGradient } from "@/lib/cover-gradient"
import {
  getProgressDisplay,
  getReadActionLabel,
  type BookProgressSnapshot,
} from "@/lib/readingProgress"
import type { BookDetail } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { BookMoreMenu } from "./BookMoreMenu"
import { formatDate, stripHtml } from "./bookDetailFormatting"

interface HeroReading {
  selectedFormat: string | null
  progress: BookProgressSnapshot | undefined
  onRead: (id: number, format?: string) => void
}

interface HeroActions {
  libraryId: string | null
  isRemoteLibrary: boolean
  isManagedLibrary: boolean
  isFavorite: boolean
  favoritePending: boolean
  onToggleFavorite: () => void
  onEditMetadata: () => void
  onDeleteBook?: (book: Pick<BookDetail, "id" | "title">) => void
}

type HeroVariant = "mobile" | "desktop"

interface BookDetailHeroProps {
  book: BookDetail
  coverSrc: string | null
  handleCoverError: () => void
  mobileCoverArtRef: Ref<HTMLDivElement>
  synopsisExpanded: boolean
  setSynopsisExpanded: (expanded: boolean) => void
  reading: HeroReading
  actions: HeroActions
}

const DETAIL_ICON_ACTION_CLASS =
  "detail-icon-action inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--detail-hero-control-bg)] text-[var(--detail-hero-fg)] shadow-sm transition-colors hover:bg-[var(--detail-hero-control-hover)] hover:text-[var(--detail-hero-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"

export function BookDetailHero({
  book,
  coverSrc,
  handleCoverError,
  mobileCoverArtRef,
  synopsisExpanded,
  setSynopsisExpanded,
  reading,
  actions,
}: BookDetailHeroProps) {
  const { t } = useTranslation()
  const languageMap = useLanguageMap()
  const year = extractYear(book.pubdate)
  const displayAuthors = book.authors.join(", ")
  const langDisplay = book.languages
    .map((code) => languageMap[code] ?? code)
    .join(", ")
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
  const authorCredits =
    book.authors.length > 0 ? book.authors : [t("bookDetail.unknownAuthor")]
  return (
    <>
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
          <HeroMetadata
            book={book}
            langDisplay={langDisplay}
            variant="mobile"
          />

          <HeroTags tags={book.tags} variant="mobile" />

          <div className="detail-anim-6 flex min-w-0 items-center gap-2">
            <HeroProgress progress={reading.progress} variant="mobile" />
          </div>

          <div className="detail-anim-5 flex min-w-0 items-center gap-2">
            <BookHeroActions
              book={book}
              reading={reading}
              actions={actions}
              variant="mobile"
            />
          </div>

          <HeroSynopsis
            synopsisText={synopsisText}
            synopsisExpanded={synopsisExpanded}
            setSynopsisExpanded={setSynopsisExpanded}
            className="detail-anim-8"
            maxHeightClass="max-h-[7em]"
            textClassName="text-[15px] leading-[1.7]"
            fadeHeightClass="h-12"
          />

          <HeroAuthors
            className="detail-anim-8"
            authorCredits={authorCredits}
          />
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

              <HeroMetadata
                book={book}
                langDisplay={langDisplay}
                variant="desktop"
              />

              <HeroTags tags={book.tags} variant="desktop" />
            </div>

            <div className="detail-anim-5 flex min-w-0 flex-col gap-3">
              <div className="detail-hero-progress flex min-w-0 items-center gap-2">
                <HeroProgress progress={reading.progress} variant="desktop" />
              </div>

              <div className="detail-hero-action-row flex min-w-0 items-center gap-2">
                <BookHeroActions
                  book={book}
                  reading={reading}
                  actions={actions}
                  variant="desktop"
                />
              </div>
            </div>

            <div className="detail-hero-side-extra space-y-5">
              <HeroSynopsis
                synopsisText={synopsisText}
                synopsisExpanded={synopsisExpanded}
                setSynopsisExpanded={setSynopsisExpanded}
                className="detail-anim-7"
                maxHeightClass="max-h-[5.2em]"
                textClassName="text-[14.5px] leading-[1.72]"
                fadeHeightClass="h-10"
              />
              <HeroAuthors
                className="detail-anim-8"
                authorCredits={authorCredits}
              />
            </div>
          </div>

          <div className="detail-hero-below-extra col-span-2 space-y-5 pt-1">
            <HeroSynopsis
              synopsisText={synopsisText}
              synopsisExpanded={synopsisExpanded}
              setSynopsisExpanded={setSynopsisExpanded}
              className="detail-anim-7"
              maxHeightClass="max-h-[7em]"
              textClassName="text-[15px] leading-[1.7]"
              fadeHeightClass="h-12"
            />
            <HeroAuthors
              className="detail-anim-8"
              authorCredits={authorCredits}
            />
          </div>
        </div>
      </div>
    </>
  )
}

function BookHeroActions({
  book,
  reading,
  actions,
  variant,
}: {
  book: BookDetail
  reading: HeroReading
  actions: HeroActions
  variant: HeroVariant
}) {
  const { t } = useTranslation()
  const canReadInApp = book.readableFormats.length > 0
  const readButtonLabel = canReadInApp
    ? getReadActionLabel(reading.progress, t)
    : t("bookMore.noReadableFormat")
  const favoriteLabel = actions.isFavorite
    ? t("bookDetail.unfavorite")
    : t("bookDetail.favorite")
  return (
    <>
      <Button
        type="button"
        className={cn(
          "detail-read-action min-w-[116px] max-w-none flex-none rounded-full px-5 text-[15px] font-semibold whitespace-nowrap shadow-sm active:scale-[0.98]",
          variant === "mobile" ? "h-12" : "h-11",
        )}
        disabled={!canReadInApp}
        onClick={() => {
          if (!canReadInApp) return
          void reading.onRead(book.id, reading.selectedFormat ?? undefined)
        }}
      >
        <BookOpen className="size-5" />
        <span>{readButtonLabel}</span>
      </Button>

      <button
        type="button"
        className={DETAIL_ICON_ACTION_CLASS}
        title={favoriteLabel}
        aria-label={favoriteLabel}
        aria-pressed={actions.isFavorite}
        disabled={actions.favoritePending}
        onClick={actions.onToggleFavorite}
      >
        <Star
          className={cn(
            variant === "mobile" ? "size-6" : "size-[18px]",
            actions.isFavorite && "text-primary",
          )}
          fill={actions.isFavorite ? "currentColor" : "none"}
        />
      </button>

      <BookMoreMenu
        book={book}
        libraryId={actions.libraryId}
        fileActionsEnabled={actions.isRemoteLibrary}
        onEditMetadata={
          actions.isManagedLibrary ? actions.onEditMetadata : undefined
        }
        onDeleteBook={
          actions.isManagedLibrary && actions.onDeleteBook
            ? () => actions.onDeleteBook?.(book)
            : undefined
        }
        selectedFormat={reading.selectedFormat ?? undefined}
        triggerVariant="detail"
      />
    </>
  )
}

function HeroSynopsis({
  synopsisText,
  synopsisExpanded,
  setSynopsisExpanded,
  className,
  maxHeightClass,
  textClassName,
  fadeHeightClass,
}: {
  synopsisText: string
  synopsisExpanded: boolean
  setSynopsisExpanded: (expanded: boolean) => void
  className: string
  maxHeightClass: string
  textClassName: string
  fadeHeightClass: string
}) {
  const { t } = useTranslation()
  const hasSynopsis = synopsisText.length > 0
  const heroSynopsis = hasSynopsis ? synopsisText : t("bookDetail.noSynopsis")
  return (
    <div className={cn("min-w-0", className)}>
      <SectionHeader
        className="mb-2"
        title={t("bookDetail.synopsis")}
        titleClassName="text-[19px] leading-none font-semibold text-[var(--detail-hero-fg)]"
      />
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
}

function HeroAuthors({
  authorCredits,
  className,
}: {
  authorCredits: string[]
  className: string
}) {
  const { t } = useTranslation()
  return (
    <div className={cn("flex shrink-0 flex-wrap gap-x-8 gap-y-3", className)}>
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
  )
}

function HeroMetadata({
  book,
  langDisplay,
  variant,
}: {
  book: BookDetail
  langDisplay: string
  variant: HeroVariant
}) {
  return (
    <div
      className={cn(
        "detail-anim-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 font-medium text-[var(--detail-hero-body)]",
        variant === "mobile"
          ? "text-[14.5px]"
          : "detail-hero-meta mt-3 text-[13.5px]",
      )}
    >
      {book.pubdate && <span>{formatDate(book.pubdate)}</span>}
      {book.pubdate && book.publisher && <MetaDot inverse />}
      {book.publisher && <span>{book.publisher}</span>}
      {(book.pubdate || book.publisher) && langDisplay && <MetaDot inverse />}
      {langDisplay && <span>{langDisplay}</span>}
    </div>
  )
}

function HeroTags({ tags, variant }: { tags: string[]; variant: HeroVariant }) {
  if (tags.length === 0) return null
  return (
    <div
      className={cn(
        "detail-anim-4 flex flex-wrap gap-2",
        variant === "desktop" && "detail-hero-tags mt-3",
      )}
    >
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className={cn(
            "detail-tag cursor-default rounded-md border-[var(--detail-hero-border)] bg-[var(--detail-hero-chip-bg)] px-2.5 py-1 text-[12.5px] font-[450] text-[var(--detail-hero-fg)]",
            variant === "desktop" && "backdrop-blur-sm",
          )}
        >
          {tag}
        </Badge>
      ))}
    </div>
  )
}

function HeroProgress({
  progress,
  variant,
}: {
  progress: BookProgressSnapshot | undefined
  variant: HeroVariant
}) {
  const { t } = useTranslation()
  const percent =
    typeof progress?.percent === "number" ? Math.round(progress.percent) : 0
  return (
    <>
      <BookProgressRing percent={percent} />
      <div className="min-w-0">
        <div className="text-[15px] font-semibold text-[var(--detail-hero-fg)]">
          {t("bookDetail.readingProgress")}
        </div>
        <div
          className={cn(
            "mt-0.5 text-[12.5px] text-[var(--detail-hero-muted)]",
            variant === "desktop" && "max-w-[108px] truncate",
          )}
        >
          {getProgressDisplay(progress, t).text}
        </div>
      </div>
    </>
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
