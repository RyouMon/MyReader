export const TTS_REQUEST_TIMEOUT_MS = 20_000

/** Bounds synthesis, including credential/bridge waits, and cancels late work. */
export async function runTtsRequest<T>(
  request: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  let rejectPending!: (error: Error) => void
  const interrupted = new Promise<never>((_, reject) => {
    rejectPending = reject
  })
  const abort = () => {
    const error = new Error("TTS_SYNTHESIS_CANCELLED")
    error.name = "AbortError"
    rejectPending(error)
    controller.abort()
  }
  const timeout = setTimeout(() => {
    rejectPending(new Error("TTS_REQUEST_TIMEOUT (20s)"))
    controller.abort()
  }, TTS_REQUEST_TIMEOUT_MS)
  signal?.addEventListener("abort", abort, { once: true })
  try {
    if (signal?.aborted) abort()
    return await Promise.race([
      interrupted,
      controller.signal.aborted ? interrupted : request(controller.signal),
    ])
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", abort)
  }
}
