import { formatHumanReadableTime } from "@my-reader/tools/human-readable-time"
import {
  READER_ANNOTATION_COLORS,
  type ReaderAnnotationColor,
} from "@my-reader/tools/reader-annotations"
import { compactReaderSearchSnippet } from "@my-reader/tools/reader-search"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { SquarePen } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import { ReaderItemList } from "@/components/reader/shared/ReaderItemList"
import {
  Empty,
  EmptyDescription,
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
  const language = i18n.resolvedLanguage ?? i18n.language
  const rows =
    error || loading
      ? []
      : annotations.map((annotation) => ({
          id: annotation.id,
          content: (
            <AnnotationContent annotation={annotation} language={language} />
          ),
        }))

  return (
    <ReaderSidePanelFrame visible={visible} side="left">
      <ReaderSidePanelHeader
        title={t("reader.annotations")}
        icon={SquarePen}
        onClose={onClose}
      />
      <ReaderItemList
        key={String(visible)}
        rows={rows}
        mutating={mutating}
        labels={{
          select: t("reader.selectAnnotation"),
          deselect: t("reader.deselectAnnotation"),
          selected: (count) => t("reader.selectedAnnotations", { count }),
          deleteSelected: t("reader.deleteSelectedAnnotations"),
        }}
        onOpen={(id) => {
          const annotation = annotations.find((row) => row.id === id)
          if (annotation) onSelect(annotation)
        }}
        editAction={{
          label: t("reader.editAnnotation"),
          onSelect: (id) => {
            const annotation = annotations.find((row) => row.id === id)
            if (annotation) onEdit(annotation)
          },
        }}
        onDelete={async (ids) => {
          for (const annotation of annotations.filter((row) =>
            ids.includes(row.id),
          )) {
            await onDelete(annotation)
          }
        }}
      >
        {error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p
              className="whitespace-pre-wrap text-xs text-destructive"
              role="alert"
            >
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
                {t("reader.empty.annotations.title")}
              </EmptyTitle>
              <EmptyDescription className="text-xs text-reader-chrome-muted">
                {t("reader.empty.annotations.detail")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </ReaderItemList>
    </ReaderSidePanelFrame>
  )
}

function AnnotationContent({
  annotation,
  language,
}: {
  annotation: ReadiumAnnotationRow
  language: string
}) {
  const contextLengths = annotationContextLengths(annotation)
  const snippet = compactReaderSearchSnippet(
    annotation.locator,
    contextLengths.before,
    contextLengths.after,
  )
  const position = annotation.locator.locations?.position
  return (
    <>
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
        {formatHumanReadableTime(annotation.createdAt, language)}
      </span>
    </>
  )
}
