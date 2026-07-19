import { formatHumanReadableTime } from "@my-reader/tools/human-readable-time"
import {
  READER_ANNOTATION_COLORS,
  type ReaderAnnotationColor,
} from "@my-reader/tools/reader-annotations"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { Pencil, SquarePen } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
  ReaderSidePanelScrollArea,
} from "@/components/reader/shared/ReaderSidePanelChrome"
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

type ReadiumAnnotationPanelProps = {
  visible: boolean
  annotations: ReadiumAnnotationRow[]
  loading: boolean
  mutating: boolean
  error?: string | null
  onRetry: () => void
  onSelect: (row: ReadiumAnnotationRow) => void
  onEdit: (row: ReadiumAnnotationRow) => void
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
  onClose,
}: ReadiumAnnotationPanelProps) {
  const { i18n, t } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language

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
            <ul className="space-y-1">
              {annotations.map((annotation) => (
                <li
                  key={annotation.id}
                  className="reader-chrome-toc-item group flex items-start gap-1 rounded-md"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-2.5 rounded-md px-2 py-2.5 text-start"
                    onClick={() => onSelect(annotation)}
                  >
                    <span
                      className="mt-1 size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          READER_ANNOTATION_COLORS[annotation.color],
                      }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-sm font-medium leading-5">
                        {annotation.excerpt}
                      </span>
                      {annotation.note ? (
                        <span className="mt-1 line-clamp-2 block text-xs leading-4 text-reader-chrome-muted">
                          {annotation.note}
                        </span>
                      ) : null}
                      <span className="mt-1 block text-xs text-reader-chrome-muted">
                        {formatHumanReadableTime(
                          annotation.createdAt,
                          language,
                        )}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="m-1 flex size-8 shrink-0 items-center justify-center rounded-md text-reader-chrome-muted transition-colors hover:bg-[var(--reader-chrome-segment-idle)] hover:text-reader-chrome-active disabled:opacity-50"
                    aria-label={t("reader.editAnnotation")}
                    title={t("reader.editAnnotation")}
                    disabled={mutating}
                    onClick={() => onEdit(annotation)}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ReaderSidePanelScrollArea>
    </ReaderSidePanelFrame>
  )
}
