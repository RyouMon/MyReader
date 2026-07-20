import { formatHumanReadableTime } from "@my-reader/tools/human-readable-time"
import {
  READER_ANNOTATION_COLORS,
  type ReaderAnnotationColor,
} from "@my-reader/tools/reader-annotations"
import { compactReaderSearchSnippet } from "@my-reader/tools/reader-search"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { Check, CircleCheck, Pencil, SquarePen, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
  ReaderSidePanelScrollArea,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export type ReadiumAnnotationRow = {
  id: string
  locator: ReaderLocator
  excerpt: string
  note: string | null
  color: ReaderAnnotationColor
  createdAt: number
}

const ANNOTATION_PREVIEW_TARGET_LENGTH = 38
const ANNOTATION_MIN_CONTEXT_LENGTH = 6

function annotationContextLengths(annotation: ReadiumAnnotationRow) {
  const highlight =
    annotation.locator.text?.highlight?.replace(/\s+/g, " ").trim() ||
    annotation.excerpt.replace(/\s+/g, " ").trim()
  const contextBudget = Math.max(
    ANNOTATION_MIN_CONTEXT_LENGTH * 2,
    ANNOTATION_PREVIEW_TARGET_LENGTH - Array.from(highlight).length,
  )
  return {
    before: Math.floor(contextBudget / 2),
    after: Math.ceil(contextBudget / 2),
  }
}

type ReadiumAnnotationPanelProps = {
  visible: boolean
  annotations: ReadiumAnnotationRow[]
  loading: boolean
  mutating: boolean
  error?: string | null
  onRetry: () => void
  onSelect: (row: ReadiumAnnotationRow) => void
  onEdit: (row: ReadiumAnnotationRow) => void
  onDelete: (row: ReadiumAnnotationRow) => unknown
  onClose?: () => void
}

export function ReadiumAnnotationPanel({
  visible,
  annotations,
  loading,
  mutating,
  error,
  onRetry,
  onSelect,
  onEdit,
  onDelete,
  onClose,
}: ReadiumAnnotationPanelProps) {
  const { i18n, t } = useTranslation()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const language = i18n.resolvedLanguage ?? i18n.language
  const selectedAnnotations = annotations.filter((annotation) =>
    selectedIds.has(annotation.id),
  )
  const selectionMode = selectedAnnotations.length > 0

  useEffect(() => {
    if (!visible) setSelectedIds(new Set())
  }, [visible])

  useEffect(() => {
    if (!selectionMode) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedIds(new Set())
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectionMode])

  function startSelection(annotationId: string) {
    setSelectedIds((current) => new Set(current).add(annotationId))
  }

  function toggleSelection(annotationId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(annotationId)) next.delete(annotationId)
      else next.add(annotationId)
      return next
    })
  }

  async function deleteSelected() {
    if (mutating) return
    for (const annotation of selectedAnnotations) await onDelete(annotation)
    setSelectedIds(new Set())
  }

  return (
    <ReaderSidePanelFrame visible={visible} side="left">
      <ReaderSidePanelHeader
        title={t("reader.annotations")}
        icon={SquarePen}
        onClose={onClose}
      />
      <ReaderSidePanelScrollArea className="flex min-h-full flex-col">
        <div className="flex flex-1 flex-col px-4 py-3">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-xs text-destructive" role="alert">
                {t("reader.annotationLoadFailed")}: {error}
              </p>
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm text-reader-chrome-active hover:bg-[var(--reader-chrome-segment-idle)]"
                onClick={onRetry}
              >
                {t("common.retry")}
              </button>
            </div>
          ) : loading ? (
            <p className="py-8 text-center text-sm text-reader-chrome-muted">
              {t("common.loading")}
            </p>
          ) : annotations.length === 0 ? (
            <Empty className="text-reader-chrome-fg">
              <EmptyHeader>
                <EmptyMedia
                  variant="icon"
                  className="bg-[var(--reader-chrome-segment-idle)] text-reader-chrome-muted"
                >
                  <SquarePen />
                </EmptyMedia>
                <EmptyTitle className="text-sm font-semibold text-reader-chrome-fg">
                  {t("reader.noAnnotations")}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="space-y-0.5">
              {annotations.map((annotation) => {
                const contextLengths = annotationContextLengths(annotation)
                const snippet = compactReaderSearchSnippet(
                  annotation.locator,
                  contextLengths.before,
                  contextLengths.after,
                )
                const position = annotation.locator.locations?.position
                const selected = selectedIds.has(annotation.id)
                return (
                  <ContextMenu key={annotation.id} modal={false}>
                    <ContextMenuTrigger asChild>
                      <li>
                        <button
                          type="button"
                          aria-pressed={selectionMode ? selected : undefined}
                          className={`reader-chrome-toc-item flex w-full items-start gap-2.5 rounded-md px-2 py-2.5 text-start transition-colors ${selected ? "bg-[var(--reader-chrome-toc-row-active)]" : ""}`}
                          onClick={() => {
                            if (selectionMode) {
                              toggleSelection(annotation.id)
                              return
                            }
                            onSelect(annotation)
                          }}
                        >
                          {selectionMode ? (
                            <span
                              aria-hidden="true"
                              className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${selected ? "border-reader-chrome-active bg-reader-chrome-active text-[var(--reader-panel-bg)]" : "border-reader-chrome-muted text-transparent"}`}
                            >
                              <Check className="size-3" strokeWidth={2.5} />
                            </span>
                          ) : null}
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-start gap-1">
                              <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-5 text-reader-chrome-muted">
                                {snippet.before}
                                <mark
                                  className="box-decoration-clone rounded-sm px-0.5 font-medium text-reader-chrome-fg"
                                  style={{
                                    backgroundColor: `${READER_ANNOTATION_COLORS[annotation.color]}66`,
                                  }}
                                >
                                  {snippet.highlight || annotation.excerpt}
                                </mark>
                                {snippet.after}
                              </span>
                              {position != null ? (
                                <span className="shrink-0 whitespace-nowrap text-end text-sm tabular-nums text-reader-chrome-muted">
                                  {position}
                                </span>
                              ) : null}
                            </span>
                            {annotation.note ? (
                              <span className="mt-1 line-clamp-2 block text-sm font-medium leading-5 text-reader-chrome-fg">
                                {annotation.note}
                              </span>
                            ) : null}
                            <span className="mt-0.5 block truncate text-xs leading-4 text-reader-chrome-muted">
                              {formatHumanReadableTime(
                                annotation.createdAt,
                                language,
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-40">
                      <ContextMenuItem
                        onSelect={() => {
                          if (selected) toggleSelection(annotation.id)
                          else startSelection(annotation.id)
                        }}
                      >
                        <CircleCheck />
                        {selected
                          ? t("reader.deselectAnnotation")
                          : t("reader.selectAnnotation")}
                      </ContextMenuItem>
                      <ContextMenuItem
                        disabled={mutating}
                        onSelect={() => onEdit(annotation)}
                      >
                        <Pencil />
                        {t("reader.editAnnotation")}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        disabled={mutating}
                        onSelect={() => void onDelete(annotation)}
                      >
                        <Trash2 />
                        {t("common.delete")}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })}
            </ul>
          )}
        </div>
      </ReaderSidePanelScrollArea>
      {selectionMode ? (
        <div className="relative flex min-h-14 shrink-0 items-center border-t border-reader-chrome-border px-4">
          <p
            className="w-full text-center text-xs font-medium text-reader-chrome-muted"
            aria-live="polite"
          >
            {t("reader.selectedAnnotations", {
              count: selectedAnnotations.length,
            })}
          </p>
          <button
            type="button"
            className="absolute end-3 flex size-9 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            aria-label={t("reader.deleteSelectedAnnotations")}
            title={t("reader.deleteSelectedAnnotations")}
            disabled={mutating}
            onClick={() => void deleteSelected()}
          >
            <Trash2 className="size-[18px]" />
          </button>
        </div>
      ) : null}
    </ReaderSidePanelFrame>
  )
}
