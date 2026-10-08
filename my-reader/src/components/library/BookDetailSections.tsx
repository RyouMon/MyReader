import type { CalibreBook } from "@my-reader/tools/types/book"
import { type ReactNode, useEffect, useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { SectionHeader } from "@/components/common/SectionHeader"
import { useCoverObjectUrl } from "@/hooks/useCoverObjectUrl"
import { generateCoverGradient } from "@/lib/cover-gradient"
import {
  getCoverFailureKey,
  getCoverFailuresRevision,
  isBrokenCover,
  markBrokenCover,
  subscribeCoverFailures,
} from "@/lib/coverFailureCache"
import { removeCachedCoverObjectUrl } from "@/lib/coverObjectUrlCache"
import type { BookDetail } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { formatDate } from "./bookDetailFormatting"

export function BookDetailSections({
  book,
  seriesBooks,
  libraryId,
  libraryName,
  onOpenBook,
}: {
  book: BookDetail
  seriesBooks: CalibreBook[]
  libraryId: string | null
  libraryName: string | null
  onOpenBook: (id: number) => void
}) {
  const { t } = useTranslation()
  const identifierLabels = useIdentifierLabels()
  return (
    <>
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
                <span className="font-mono text-[12.5px]">{id.value}</span>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      <BookMetadataSection
        activeLibraryName={libraryName}
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
                libraryId={libraryId}
                onClick={() => onOpenBook(rb.id)}
              />
            ))}
          </div>
        </DetailSection>
      )}
    </>
  )
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
          <FactRow label={t("library.label")} value={activeLibraryName} />
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

export function DetailSection({
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
      <SectionHeader title={title} />
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
