import { useSyncExternalStore } from "react"

import type { BookUploadTaskProgress } from "@/src/services/core/book-transfer"

export type BookUploadState = {
  taskId: string
  bookUuid: string
  progress: number | null
}

type Listener = () => void
type UploadRequestListener = (libraryId: string) => void

let states: Record<string, BookUploadState> = {}
const listeners = new Set<Listener>()
const uploadRequestListeners = new Set<UploadRequestListener>()
const pendingUploadRequests = new Set<string>()
let nextRequestSequence = 0

function publish(next: Record<string, BookUploadState>): void {
  states = next
  for (const listener of listeners) listener()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getBookUploadState(
  libraryId: string | undefined,
): BookUploadState | undefined {
  return libraryId ? states[libraryId] : undefined
}

export function applyBookUploadTaskProgress(
  libraryId: string,
  task: BookUploadTaskProgress,
): void {
  const progress =
    task.total > 0
      ? Math.max(0, Math.min(1, task.completed / task.total))
      : null
  const current = states[libraryId]
  if (
    current?.taskId === task.taskId &&
    current.bookUuid === task.bookUuid &&
    current.progress === progress
  ) {
    return
  }
  publish({
    ...states,
    [libraryId]: {
      taskId: task.taskId,
      bookUuid: task.bookUuid,
      progress,
    },
  })
}

export function clearBookUploadTaskProgress(
  libraryId: string,
  taskId: string,
): void {
  if (states[libraryId]?.taskId !== taskId) return
  const next = { ...states }
  delete next[libraryId]
  publish(next)
}

function deliverPendingUploadRequests(): void {
  if (uploadRequestListeners.size === 0) return
  const requests = [...pendingUploadRequests]
  pendingUploadRequests.clear()
  for (const libraryId of requests) {
    for (const listener of uploadRequestListeners) listener(libraryId)
  }
}

export function requestPendingBookUploads(
  libraryId: string,
  bookUuid?: string,
): void {
  if (bookUuid && !states[libraryId]) {
    nextRequestSequence += 1
    publish({
      ...states,
      [libraryId]: {
        taskId: `book-upload-request:${libraryId}:${nextRequestSequence}`,
        bookUuid,
        progress: null,
      },
    })
  }
  pendingUploadRequests.add(libraryId)
  deliverPendingUploadRequests()
}

export function subscribePendingBookUploads(
  listener: UploadRequestListener,
): () => void {
  uploadRequestListeners.add(listener)
  deliverPendingUploadRequests()
  return () => uploadRequestListeners.delete(listener)
}

export function useBookUploadBookUuid(
  libraryId: string | undefined,
): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => getBookUploadState(libraryId)?.bookUuid,
    () => undefined,
  )
}

export function useBookUploadProgress(
  libraryId: string | undefined,
  bookUuid: string | undefined,
): number | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => {
      const state = getBookUploadState(libraryId)
      return state && state.bookUuid === bookUuid ? state.progress : undefined
    },
    () => undefined,
  )
}
