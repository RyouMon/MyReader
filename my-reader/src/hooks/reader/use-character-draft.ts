import { useEffect, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { api } from "@/lib/tauri-api"
import type { CharacterDraftRequestDto } from "@/lib/tauri-specta"

export function useCharacterDraft(libraryId: string | null, bookId: number) {
  const [progress, setProgress] = useState({ libraryId, bookId, text: "" })
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      generation.current += 1
      controller.current?.abort()
    },
    [libraryId, bookId],
  )
  const draftCharacters = useMutation({
    mutationFn: async (request: CharacterDraftRequestDto) => {
      const current = ++generation.current
      controller.current?.abort()
      const abort = new AbortController()
      controller.current = abort
      let text = ""
      let kind = ""
      setProgress({ libraryId, bookId, text: "" })
      try {
        const result = await api.draftBookCharacters(
          libraryId!,
          request,
          (event) => {
            if (current !== generation.current) return
            if (event.kind === "started") {
              text = ""
              kind = ""
            } else {
              if (kind !== event.kind) text = ""
              kind = event.kind
              // The UI only needs the recent tail, not an unbounded transcript.
              text = Array.from(text + event.delta)
                .slice(-2048)
                .join("")
            }
            setProgress({ libraryId, bookId, text })
          },
          abort.signal,
        )
        if (abort.signal.aborted)
          throw new DOMException("Aborted", "AbortError")
        return result
      } finally {
        if (controller.current === abort) controller.current = null
        if (current === generation.current) {
          generation.current += 1
          setProgress({ libraryId, bookId, text: "" })
        }
      }
    },
  })
  return {
    draftCharacters,
    cancelDraft: () => {
      generation.current += 1
      controller.current?.abort()
      draftCharacters.reset()
      setProgress({ libraryId, bookId, text: "" })
    },
    draftProgress:
      progress.libraryId === libraryId && progress.bookId === bookId
        ? progress.text
        : "",
  }
}
