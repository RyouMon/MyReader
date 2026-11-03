import { appendLlmProgress } from "@my-reader/tools/llm-progress"
import { useCallback, useEffect, useRef, useState } from "react"
import { subscribeNarrationAnalysis } from "./narration-chapter"
import type { NarrationBookContext } from "./narration-playback"

export function useNarrationAnalysisProgress(
  book: NarrationBookContext | undefined,
) {
  const libraryId = book?.library.id
  const bookId = book?.bookId
  const contentVersion = book?.contentVersion
  const active = useRef<AbortSignal | null>(null)
  const ignored = useRef(new WeakSet<AbortSignal>())
  const [signal, setSignal] = useState<AbortSignal | null>(null)
  const [progress, setProgress] = useState({ kind: "", text: "" })
  const reset = useCallback((ignoreCurrent = false) => {
    const previous = active.current
    if (previous && ignoreCurrent) ignored.current.add(previous)
    active.current = null
    setSignal(null)
    setProgress({ kind: "", text: "" })
    return previous
  }, [])
  useEffect(() => {
    reset()
    return subscribeNarrationAnalysis((event) => {
      if (
        event.book.library.id !== libraryId ||
        event.book.bookId !== bookId ||
        event.book.contentVersion !== contentVersion
      )
        return
      if (event.kind === "finished") {
        if (active.current === event.signal) reset()
      } else if (!event.signal.aborted && !ignored.current.has(event.signal)) {
        if (active.current !== event.signal) setProgress({ kind: "", text: "" })
        active.current = event.signal
        setSignal(event.signal)
        setProgress((previous) => appendLlmProgress(previous, event))
      }
    })
  }, [libraryId, bookId, contentVersion, reset])
  return { signal, text: progress.text, reset }
}
