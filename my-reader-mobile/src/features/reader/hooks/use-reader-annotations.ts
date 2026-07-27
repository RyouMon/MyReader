import type { Locator } from "@my-reader/readium"
import type { ReaderAnnotationColor } from "@my-reader/tools/reader-annotations"
import { sortReaderAnnotations } from "@my-reader/tools/reader-annotations"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"

import {
  addReaderAnnotation,
  listReaderAnnotations,
  type ReaderAnnotation,
  removeReaderAnnotation,
  updateReaderAnnotation,
} from "@/src/features/reader/reader-annotations"
import type { Library } from "@/src/domain/types"
import { queryKeys } from "@/src/services/query/query-keys"

const EMPTY_ANNOTATIONS: ReaderAnnotation[] = []

type AnnotationMutation =
  | {
      action: "add"
      locator: Locator
      color: ReaderAnnotationColor
      note?: string | null
    }
  | {
      action: "update"
      annotation: ReaderAnnotation
      color: ReaderAnnotationColor
      note?: string | null
    }
  | { action: "remove"; annotation: ReaderAnnotation }

function logAnnotationFailure(
  operation: "load" | AnnotationMutation["action"],
  scope: {
    library: Library
    bookId: number
    format: string
  },
  error: unknown,
  annotationId?: string,
): void {
  console.error(`[reader-annotations] ${operation}:failed`, {
    libraryId: scope.library.id,
    bookId: scope.bookId,
    format: scope.format,
    annotationId: annotationId ?? null,
    error,
    cause: error instanceof Error ? error.cause : undefined,
  })
}

export function useReaderAnnotations(
  library: Library | null,
  bookId: number | null,
  format: string | null,
) {
  const queryClient = useQueryClient()
  const normalizedFormat = format?.toUpperCase() ?? null
  const scope = useMemo(() => {
    if (!library || bookId == null || normalizedFormat !== "EPUB") return null
    return { library, bookId, format: normalizedFormat }
  }, [bookId, library, normalizedFormat])
  const queryKey = queryKeys.readerAnnotations(
    scope?.library.id,
    scope?.bookId,
    scope?.format,
  )
  const query = useQuery({
    queryKey,
    enabled: scope !== null,
    queryFn: async () => {
      if (!scope) return []
      try {
        return await listReaderAnnotations(
          scope.library,
          scope.bookId,
          scope.format,
        )
      } catch (error) {
        logAnnotationFailure("load", scope, error)
        throw error
      }
    },
  })
  const mutation = useMutation({
    mutationFn: async (input: AnnotationMutation) => {
      if (!scope) throw new Error("Annotation scope is unavailable")
      try {
        if (input.action === "add") {
          return await addReaderAnnotation(
            scope.library,
            scope.bookId,
            scope.format,
            input.locator,
            input.color,
            input.note,
          )
        }
        if (input.action === "update") {
          return await updateReaderAnnotation(
            scope.library,
            input.annotation,
            input.color,
            input.note,
          )
        }
        await removeReaderAnnotation(scope.library, input.annotation.id)
        return input.annotation
      } catch (error) {
        logAnnotationFailure(
          input.action,
          scope,
          error,
          input.action === "add" ? undefined : input.annotation.id,
        )
        throw error
      }
    },
    onSuccess: (annotation, input) => {
      queryClient.setQueryData<ReaderAnnotation[]>(queryKey, (current = []) =>
        input.action === "remove"
          ? current.filter((row) => row.id !== annotation.id)
          : sortReaderAnnotations([
              ...current.filter((row) => row.id !== annotation.id),
              annotation,
            ]),
      )
    },
  })
  const mutateAsync = mutation.mutateAsync
  const resetMutation = mutation.reset
  const refetch = query.refetch

  const add = useCallback(
    (locator: Locator, color: ReaderAnnotationColor, note?: string | null) =>
      mutateAsync({ action: "add", locator, color, note }),
    [mutateAsync],
  )
  const update = useCallback(
    (
      annotation: ReaderAnnotation,
      color: ReaderAnnotationColor,
      note?: string | null,
    ) => mutateAsync({ action: "update", annotation, color, note }),
    [mutateAsync],
  )
  const remove = useCallback(
    (annotation: ReaderAnnotation) =>
      mutateAsync({ action: "remove", annotation }).then(() => {}),
    [mutateAsync],
  )
  const retry = useCallback(() => {
    resetMutation()
    void refetch()
  }, [refetch, resetMutation])

  return useMemo(
    () => ({
      annotations: query.data ?? EMPTY_ANNOTATIONS,
      loading: query.isLoading,
      mutating: mutation.isPending,
      error: query.error ?? mutation.error,
      add,
      update,
      remove,
      retry,
    }),
    [
      add,
      mutation.error,
      mutation.isPending,
      query.data,
      query.error,
      query.isLoading,
      remove,
      retry,
      update,
    ],
  )
}
