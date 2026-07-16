import {
  type ReaderSearchResultItem,
  resolveReaderSearchResults,
} from "@my-reader/tools/reader-search"
import type { ReaderLocator, ReaderTocItem } from "@my-reader/tools/reader-toc"
import { AlertCircle, Loader2, Search, SearchX, X } from "lucide-react"
import { type FormEvent, useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
  ReaderSidePanelScrollArea,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import type { ReaderSearchStatus } from "@/hooks/reader/useReaderSearch"
import { cn } from "@/lib/utils"

type ReadiumSearchPanelProps = {
  visible: boolean
  query: string
  locators: ReaderLocator[]
  toc: ReaderTocItem[]
  positions: ReaderLocator[]
  resultCount?: number
  loading: boolean
  done: boolean
  error: unknown
  status: ReaderSearchStatus
  activeLocator: ReaderLocator | null
  onQueryChange: (query: string) => void
  onSearch: () => void
  onClear: () => void
  onLoadMore: () => void | Promise<void>
  onSelect: (locator: ReaderLocator) => void
  onClose: () => void
}

export function ReadiumSearchPanel({
  visible,
  query,
  locators,
  toc,
  positions,
  resultCount,
  loading,
  done,
  error,
  status,
  activeLocator,
  onQueryChange,
  onSearch,
  onClear,
  onLoadMore,
  onSelect,
  onClose,
}: ReadiumSearchPanelProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(loading)
  const results = useMemo<ReaderSearchResultItem[]>(
    () =>
      resolveReaderSearchResults({
        locators,
        toc,
        positions,
        fallbackTitle: t("reader.searchResult"),
      }),
    [locators, positions, t, toc],
  )

  useEffect(() => {
    if (!visible) return
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [visible])

  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current
    if (!visible || !sentinel || done || results.length === 0) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !loadingRef.current) void onLoadMore()
      },
      { rootMargin: "0px 0px 120px" },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [done, onLoadMore, results.length, visible])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSearch()
  }

  const emptyState = useMemo(() => {
    if (locators.length > 0) return null
    if (status === "error") {
      return {
        icon: AlertCircle,
        title: t("reader.searchInBookFailed"),
        description: t("reader.searchInBookFailedHint"),
        role: "alert" as const,
      }
    }
    if (status === "empty") {
      return {
        icon: SearchX,
        title: t("reader.noSearchResults"),
        description: t("reader.noSearchResultsHint"),
        role: "status" as const,
      }
    }
    if (status === "idle") {
      return {
        icon: Search,
        title: t("reader.searchInBookPlaceholder"),
        description: t("reader.searchInBookHint"),
        role: "status" as const,
      }
    }
    return null
  }, [locators.length, status, t])

  return (
    <ReaderSidePanelFrame visible={visible} side="left">
      <ReaderSidePanelHeader
        title={t("reader.search")}
        icon={Search}
        onClose={onClose}
      />
      <form
        className="shrink-0 border-b border-reader-chrome-border px-4 py-3"
        onSubmit={submit}
      >
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute start-3 size-4 text-reader-chrome-muted"
            aria-hidden
          />
          {/* biome-ignore lint/a11y/useSemanticElements: WebKit adds a second clear action to type="search"; the explicit role preserves search semantics. */}
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            inputMode="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("reader.searchInBookPlaceholder")}
            aria-label={t("reader.searchInBookPlaceholder")}
            className="h-9 w-full rounded-md border border-reader-chrome-border bg-[var(--reader-chrome-segment-idle)] ps-9 pe-9 text-sm text-reader-chrome-fg outline-none placeholder:text-reader-chrome-muted focus:border-reader-chrome-active"
          />
          {query ? (
            <button
              type="button"
              className="absolute end-1.5 grid size-7 place-items-center rounded-md text-reader-chrome-muted transition-colors hover:bg-[var(--reader-chrome-segment-active)] hover:text-reader-chrome-fg"
              title={t("reader.clearSearch")}
              aria-label={t("reader.clearSearch")}
              onClick={onClear}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </form>
      <ReaderSidePanelScrollArea
        className="flex min-h-full flex-col py-2"
        scrollbarAutoHide="never"
      >
        {loading && locators.length === 0 ? (
          <div
            className="flex flex-1 items-center justify-center gap-2 px-3 text-xs text-reader-chrome-muted"
            role="status"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("reader.searchingInBook")}
          </div>
        ) : null}
        {emptyState ? (
          <Empty className="text-reader-chrome-fg" role={emptyState.role}>
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="bg-[var(--reader-chrome-segment-idle)] text-reader-chrome-muted"
              >
                <emptyState.icon />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-semibold text-reader-chrome-fg">
                {emptyState.title}
              </EmptyTitle>
              <EmptyDescription className="text-reader-chrome-muted">
                {emptyState.description}
              </EmptyDescription>
            </EmptyHeader>
            {status === "error" ? (
              <EmptyContent>
                <button
                  type="button"
                  className="h-9 w-full rounded-md border border-reader-chrome-border bg-[var(--reader-chrome-action-surface)] px-4 text-sm font-medium text-[var(--reader-chrome-action-text)] transition-colors hover:bg-[var(--reader-chrome-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--reader-chrome-active)]"
                  onClick={onSearch}
                >
                  {t("common.retry")}
                </button>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : null}
        {results.length > 0 ? (
          <>
            <p className="px-4 pb-2 pt-1 text-[11px] tabular-nums text-reader-chrome-muted">
              {t(
                done
                  ? "reader.searchResultCount"
                  : "reader.searchResultCountPartial",
                {
                  count: done
                    ? (resultCount ?? locators.length)
                    : locators.length,
                },
              )}
            </p>
            <ol className="space-y-0.5 px-4">
              {results.map((result, index) => {
                const { locator } = result
                const { before, highlight, after } = result.snippet
                const active = activeLocator === locator
                return (
                  <li key={`${locator.href}-${index}`}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-md px-2 py-3 text-start transition-colors",
                        active
                          ? "bg-[var(--reader-chrome-toc-row-active)]"
                          : "hover:bg-[var(--reader-chrome-toc-row-hover)]",
                      )}
                      aria-pressed={active}
                      onClick={() => onSelect(locator)}
                    >
                      <span className="mb-1 flex items-start gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-reader-chrome-fg">
                          {result.title}
                        </span>
                        {result.position != null ? (
                          <span className="w-10 shrink-0 text-end text-sm tabular-nums text-reader-chrome-muted">
                            <span className="sr-only">
                              {t("reader.searchResultPosition", {
                                position: result.position,
                              })}
                            </span>
                            <span aria-hidden>{result.position}</span>
                          </span>
                        ) : null}
                      </span>
                      <span className="line-clamp-2 text-sm leading-5 text-reader-chrome-muted">
                        {before}
                        <mark className="bg-transparent font-bold text-reader-chrome-active">
                          {highlight}
                        </mark>
                        {after}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
            {!done ? (
              <div
                ref={loadMoreSentinelRef}
                data-testid="reader-search-load-sentinel"
                className="flex min-h-10 items-center justify-center px-4 py-2 text-xs text-reader-chrome-muted"
                role={loading ? "status" : undefined}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : error ? (
                  t("reader.searchInBookFailed")
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </ReaderSidePanelScrollArea>
    </ReaderSidePanelFrame>
  )
}
