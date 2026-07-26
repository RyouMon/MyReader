import type { SidecarSyncReason } from "./sidecar-scheduler"

export type LibrarySidecarWork = {
  libraryId: string
  reason: SidecarSyncReason
}

type Listener = (work: LibrarySidecarWork) => void

const listeners = new Set<Listener>()

export function announceLibrarySidecarWork(work: LibrarySidecarWork): void {
  for (const listener of listeners) listener(work)
}

export function subscribeLibrarySidecarWork(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
