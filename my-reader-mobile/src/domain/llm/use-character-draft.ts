import { appendLlmProgress } from "@my-reader/tools/llm-progress"
import { useEffect, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import type { Library } from "@my-reader/tools/types/library"
import {
  draftBookCharacters,
  searchBookCharacterSources,
  type CharacterDraftInput,
} from "@/src/services/core/narration"

type Book = Parameters<typeof draftBookCharacters>[1]

export function useCharacterDraft(library: Library, book: Book) {
  const controller = useRef<AbortController | null>(null)
  const [progress, setProgress] = useState("")
  useEffect(
    () => () => {
      controller.current?.abort()
    },
    [library.id, book.bookId],
  )
  const begin = () => {
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    return next
  }
  const searchSources = useMutation({
    mutationFn: (title: string) =>
      searchBookCharacterSources(library, { ...book, title }, begin().signal),
  })
  const draftCharacters = useMutation({
    mutationFn: async (input: CharacterDraftInput) => {
      const current = begin()
      let output = { kind: "", text: "" }
      let active = true
      setProgress("")
      try {
        const result = await draftBookCharacters(
          library,
          book,
          input,
          (kind, delta) => {
            if (!active || current.signal.aborted) return
            output = appendLlmProgress(output, { kind, delta })
            setProgress(output.text)
          },
          current.signal,
        )
        if (current.signal.aborted)
          throw Object.assign(new Error("Aborted"), { name: "AbortError" })
        return result
      } finally {
        active = false
        if (controller.current === current) {
          controller.current = null
          if (!current.signal.aborted) setProgress("")
        }
      }
    },
  })
  const cancelDraft = () => {
    controller.current?.abort()
    draftCharacters.reset()
    setProgress("")
  }
  return { searchSources, draftCharacters, progress, cancelDraft }
}
