import { useEffect, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { api } from "@/lib/tauri-api"
import type { CharacterDraftRequestDto } from "@/lib/tauri-specta"

export function useCharacterDraft(libraryId: string | null, bookId: number) {
  const [progress, setProgress] = useState({ libraryId, bookId, text: "" })
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current += 1
    },
    [libraryId, bookId],
  )
  const draftCharacters = useMutation({
    mutationFn: async (request: CharacterDraftRequestDto) => {
      const current = ++generation.current
      let text = ""
      let kind = ""
      setProgress({ libraryId, bookId, text: "" })
      try {
        return await api.draftBookCharacters(libraryId!, request, (event) => {
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
        })
      } finally {
        if (current === generation.current) {
          generation.current += 1
          setProgress({ libraryId, bookId, text: "" })
        }
      }
    },
  })
  return {
    draftCharacters,
    draftProgress:
      progress.libraryId === libraryId && progress.bookId === bookId
        ? progress.text
        : "",
  }
}
