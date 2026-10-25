type LocalSidecarWork = {
  libraryId: string
  required: boolean
  locationChanged?: boolean
}

const listeners = new Set<(work: LocalSidecarWork) => void>()

export function announceLocalSidecarWork(
  libraryId: string,
  options?: { required?: boolean; locationChanged?: boolean },
): void {
  for (const listener of listeners) {
    listener({
      libraryId,
      required: options?.required === true,
      ...(options?.locationChanged ? { locationChanged: true } : {}),
    })
  }
}

export function subscribeLocalSidecarWork(
  listener: (work: LocalSidecarWork) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
