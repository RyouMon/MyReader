import { useNavigate } from "@tanstack/react-router"
import { isTauri } from "@tauri-apps/api/core"
import { useCallback } from "react"
import { openReaderInNewWindow } from "@/lib/readerWindow"

interface OpenReaderInput {
  bookId: number | string
  format?: string | null
  title?: string | null
}

export function useOpenReader() {
  const navigate = useNavigate()

  return useCallback(
    async ({ bookId, format, title }: OpenReaderInput) => {
      const normalizedBookId = String(bookId)
      const normalizedFormat = format?.toUpperCase()

      if (isTauri()) {
        await openReaderInNewWindow(
          normalizedBookId,
          normalizedFormat,
          title ?? undefined,
        )
        return
      }

      navigate({
        to: "/read/$bookId",
        params: { bookId: normalizedBookId },
        search: normalizedFormat ? { format: normalizedFormat } : {},
      })
    },
    [navigate],
  )
}
