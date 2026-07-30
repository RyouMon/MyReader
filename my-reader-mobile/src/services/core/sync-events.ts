type LocalSidecarWork = {
  libraryId: string
}

const listeners = new Set<(work: LocalSidecarWork) => void>()

export function announceLocalSidecarWork(libraryId: string): void {
  for (const listener of listeners) listener({ libraryId })
}

export function subscribeLocalSidecarWork(
  listener: (work: LocalSidecarWork) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
