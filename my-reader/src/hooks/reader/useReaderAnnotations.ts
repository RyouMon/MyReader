import {
  canonicalizeReaderAnnotationLocator,
  type ReaderAnnotationColor,
  type ReaderAnnotationKind,
  sortReaderAnnotations,
} from "@my-reader/tools/reader-annotations"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import i18n from "@/i18n"
import type { ReaderAnnotationDto } from "@/lib/tauri-api"
import { api } from "@/lib/tauri-api"

export type ReaderAnnotation = Omit<
  ReaderAnnotationDto,
  "locator" | "color" | "kind" | "createdAt" | "updatedAt"
> & {
  locator: ReaderLocator
  color: ReaderAnnotationColor
  kind: ReaderAnnotationKind
  createdAt: number
  updatedAt: number
}

type UseReaderAnnotationsOptions = {
  libraryId: string | null
  bookId: number
  format: string
  enabled: boolean
}

type AnnotationDraft = {
  locator: ReaderLocator
  color: ReaderAnnotationColor
  note?: string | null
}

function annotationFromDto(row: ReaderAnnotationDto): ReaderAnnotation {
  return {
    ...row,
    kind: "highlight",
    color: row.color as ReaderAnnotationColor,
    locator: canonicalizeReaderAnnotationLocator(row.locator as ReaderLocator),
    createdAt: row.createdAt ?? 0,
    updatedAt: row.updatedAt ?? 0,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useReaderAnnotations({
  libraryId,
  bookId,
  format,
  enabled,
}: UseReaderAnnotationsOptions) {
  const [annotations, setAnnotations] = useState<ReaderAnnotation[]>([])
  const [loading, setLoading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadGeneration, setReloadGeneration] = useState(0)
  const mutatingRef = useRef(false)
  const normalizedFormat = format.toUpperCase()
  const scopeKey = `${libraryId ?? ""}:${bookId}:${normalizedFormat}`
  const scopeKeyRef = useRef(scopeKey)
  scopeKeyRef.current = scopeKey

  useEffect(() => {
    void reloadGeneration
    let cancelled = false
    mutatingRef.current = false
    setMutating(false)
    if (!enabled || !libraryId || !normalizedFormat) {
      setAnnotations([])
      setLoading(false)
      setLoadError(null)
      return
    }

    setAnnotations([])
    setLoading(true)
    setLoadError(null)
    void api
      .listReaderAnnotations(libraryId, bookId, normalizedFormat)
      .then((rows) => {
        if (cancelled) return
        setAnnotations(sortReaderAnnotations(rows.map(annotationFromDto)))
      })
      .catch((reason: unknown) => {
        if (!cancelled) setLoadError(errorMessage(reason))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [bookId, enabled, libraryId, normalizedFormat, reloadGeneration])

  const mutate = useCallback(
    async <T>(operation: () => Promise<T>, apply: (value: T) => void) => {
      if (!enabled || !libraryId || mutatingRef.current) return undefined
      const mutationScope = scopeKey
      mutatingRef.current = true
      setMutating(true)
      try {
        const value = await operation()
        if (scopeKeyRef.current === mutationScope) apply(value)
        return value
      } catch (reason) {
        if (scopeKeyRef.current === mutationScope) {
          toast.error(i18n.t("reader.annotationSaveFailed"), {
            description: errorMessage(reason),
          })
        }
        return undefined
      } finally {
        if (scopeKeyRef.current === mutationScope) {
          mutatingRef.current = false
          setMutating(false)
        }
      }
    },
    [enabled, libraryId, scopeKey],
  )

  const addAnnotation = useCallback(
    async ({ locator, color, note }: AnnotationDraft) =>
      mutate(
        () =>
          api.addReaderAnnotation(
            libraryId,
            bookId,
            normalizedFormat,
            canonicalizeReaderAnnotationLocator(locator),
            color,
            note?.trim() || null,
          ),
        (row) =>
          setAnnotations((current) =>
            sortReaderAnnotations([...current, annotationFromDto(row)]),
          ),
      ),
    [bookId, libraryId, mutate, normalizedFormat],
  )

  const updateAnnotation = useCallback(
    async (
      annotation: Pick<ReaderAnnotation, "id">,
      changes: Pick<ReaderAnnotation, "color" | "note">,
    ) =>
      mutate(
        () =>
          api.updateReaderAnnotation(
            libraryId,
            bookId,
            normalizedFormat,
            annotation.id,
            changes.color,
            changes.note?.trim() || null,
          ),
        (row) =>
          setAnnotations((current) =>
            sortReaderAnnotations(
              current.map((item) =>
                item.id === annotation.id ? annotationFromDto(row) : item,
              ),
            ),
          ),
      ),
    [bookId, libraryId, mutate, normalizedFormat],
  )

  const deleteAnnotation = useCallback(
    async (annotation: Pick<ReaderAnnotation, "id">) =>
      mutate(
        () =>
          api.deleteReaderAnnotation(
            libraryId,
            bookId,
            normalizedFormat,
            annotation.id,
          ),
        () =>
          setAnnotations((current) =>
            current.filter((item) => item.id !== annotation.id),
          ),
      ),
    [bookId, libraryId, mutate, normalizedFormat],
  )

  const retry = useCallback(() => {
    setReloadGeneration((generation) => generation + 1)
  }, [])

  return useMemo(
    () => ({
      annotations,
      loading,
      mutating,
      loadError,
      retry,
      addAnnotation,
      updateAnnotation,
      deleteAnnotation,
    }),
    [
      addAnnotation,
      annotations,
      deleteAnnotation,
      loadError,
      loading,
      mutating,
      retry,
      updateAnnotation,
    ],
  )
}
