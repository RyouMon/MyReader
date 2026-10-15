import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useTranslation } from "react-i18next"
import { BookOpen, ChevronRight } from "lucide-react"
import {
  groupCatalogFacets,
  type CatalogCover,
  type CatalogFacet,
  type CatalogFacetKind,
  type CatalogNavigation,
  type CatalogToken,
} from "@my-reader/tools/catalog-navigation"
import { useCoverObjectUrl } from "@/hooks/useCoverObjectUrl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import BookGrid, { type LibraryViewMode } from "./BookGrid"

const EMPTY_BOOKS = new Map()
const savedOffsets = new Map<string, number>()
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("")

function CoverTile({
  cover,
  libraryId,
}: {
  cover: CatalogCover
  libraryId: string | null
}) {
  const [failed, setFailed] = useState(false)
  const { coverSrc } = useCoverObjectUrl({
    libraryId,
    bookPath: cover.path,
    enabled: cover.hasCover,
  })
  return coverSrc && !failed ? (
    <img
      src={coverSrc}
      alt=""
      className="size-full object-cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
      <BookOpen className="size-1/3" />
    </div>
  )
}

function SeriesCard({
  facet,
  mode,
  libraryId,
  onSelect,
}: {
  facet: CatalogFacet
  mode: LibraryViewMode
  libraryId: string | null
  onSelect: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group w-full rounded-md text-start hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        mode === "list" && "flex min-h-14 items-center gap-3 px-2.5 py-1.5",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "grid grid-cols-2 grid-rows-2 overflow-hidden rounded-md bg-muted shadow-sm",
          mode === "grid"
            ? "aspect-[2/3] w-full"
            : "h-[42px] w-[30px] shrink-0",
        )}
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="min-h-0 min-w-0">
            {facet.covers[index] && (
              <CoverTile cover={facet.covers[index]} libraryId={libraryId} />
            )}
          </div>
        ))}
      </div>
      <div className={cn("min-w-0", mode === "grid" && "pt-2")}>
        <div className="truncate text-sm font-medium text-foreground">
          {facet.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {t("library.collections.bookCount", { count: facet.bookCount })}
        </div>
      </div>
    </button>
  )
}

function IndexedDirectory({
  scrollKey,
  facets,
  onSelect,
}: {
  scrollKey: string
  facets: CatalogFacet[]
  onSelect: (name: string) => void
}) {
  const { t } = useTranslation()
  const scroll = useRef<HTMLDivElement>(null)
  const rows = useMemo(
    () =>
      groupCatalogFacets(facets).flatMap((group) => [
        { letter: group.title, facet: null as CatalogFacet | null },
        ...group.data.map((facet) => ({ letter: group.title, facet })),
      ]),
    [facets],
  )
  const virtualizer = useVirtualizer({
    count: rows.length,
    initialOffset: savedOffsets.get(scrollKey) ?? 0,
    getScrollElement: () => scroll.current,
    estimateSize: (index) => (rows[index].facet ? 52 : 32),
    overscan: 8,
  })
  useLayoutEffect(() => {
    const element = scroll.current
    if (!element) return
    element.scrollTop = savedOffsets.get(scrollKey) ?? 0
    return () => {
      savedOffsets.set(scrollKey, element.scrollTop)
    }
  }, [scrollKey])
  const jump = (letter: string) => {
    const index = rows.findIndex((row) => row.letter === letter)
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "start" })
  }
  return (
    <div className="relative flex min-h-0 flex-1">
      <div
        ref={scroll}
        className="flex-1 overflow-y-auto px-6 pe-12"
        role="list"
        aria-label={t("catalog.directory")}
      >
        <div
          className="relative"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index]
            return (
              <div
                key={item.key}
                role="listitem"
                className="absolute inset-x-0 top-0"
                style={{
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                {row.facet ? (
                  <button
                    type="button"
                    className="flex h-full w-full items-center gap-3 border-b border-border text-start hover:bg-muted"
                    onClick={() => onSelect(row.facet!.name)}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {row.facet.name}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {row.facet.bookCount}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                ) : (
                  <h2 className="flex h-full items-center bg-background text-xs font-semibold text-muted-foreground">
                    {row.letter}
                  </h2>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <nav
        aria-label={t("catalog.alphabetIndex")}
        className="absolute end-1 top-1/2 flex max-h-full -translate-y-1/2 touch-none flex-col overflow-y-auto text-xs text-primary"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          const rect = event.currentTarget.getBoundingClientRect()
          jump(
            ALPHABET[
              Math.min(
                26,
                Math.max(
                  0,
                  Math.floor(((event.clientY - rect.top) / rect.height) * 27),
                ),
              )
            ],
          )
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          const rect = event.currentTarget.getBoundingClientRect()
          jump(
            ALPHABET[
              Math.min(
                26,
                Math.max(
                  0,
                  Math.floor(((event.clientY - rect.top) / rect.height) * 27),
                ),
              )
            ],
          )
        }}
      >
        {ALPHABET.map((letter) => (
          <button
            key={letter}
            type="button"
            className="w-7 py-0.5 disabled:text-muted-foreground/40"
            disabled={!rows.some((row) => row.letter === letter)}
            onClick={() => jump(letter)}
            aria-label={t("catalog.jumpTo", { letter })}
          >
            {letter}
          </button>
        ))}
      </nav>
    </div>
  )
}

export function CatalogDirectory({
  kind,
  navigation,
  libraryId,
  search,
  viewMode,
  loading,
  error,
  onRetry,
  onSelect,
}: {
  kind: CatalogFacetKind
  navigation: CatalogNavigation
  libraryId: string | null
  search: string
  viewMode: LibraryViewMode
  loading: boolean
  error: string | null
  onRetry: () => void
  onSelect: (token: CatalogToken) => void
}) {
  const { t } = useTranslation()
  const facets = useMemo(
    () =>
      navigation[kind].filter((facet) =>
        facet.name
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
      ),
    [navigation, kind, search],
  )
  const scrollKey = JSON.stringify([libraryId, kind, search])
  const content = error ? (
    <div role="alert" className="p-6 text-sm text-danger">
      {error}
      <Button onClick={onRetry}>{t("catalog.retry")}</Button>
    </div>
  ) : loading ? (
    <p className="p-6 text-sm text-muted-foreground">{t("catalog.loading")}</p>
  ) : facets.length === 0 ? (
    <p className="p-6 text-sm text-muted-foreground">
      {t("catalog.emptyDirectory")}
    </p>
  ) : kind === "series" ? (
    <BookGrid
      key={scrollKey}
      scrollKey={scrollKey}
      books={EMPTY_BOOKS}
      libraryId={libraryId}
      total={facets.length}
      viewMode={viewMode}
      ensureRange={() => undefined}
      renderItem={(index, mode) => (
        <SeriesCard
          facet={facets[index]}
          mode={mode}
          libraryId={libraryId}
          onSelect={() => onSelect({ kind, value: facets[index].name })}
        />
      )}
    />
  ) : (
    <IndexedDirectory
      key={scrollKey}
      scrollKey={scrollKey}
      facets={facets}
      onSelect={(value) => onSelect({ kind, value })}
    />
  )
  return (
    <Fragment>
      <h1 className="px-6 py-4 text-xl font-semibold">
        {t(`catalog.${kind}`)}
      </h1>
      {content}
    </Fragment>
  )
}
