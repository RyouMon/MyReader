import { api } from "@/lib/tauri-api"

const SAVE_DEBOUNCE_MS = 1600
let pendingSave: { timer: number; save: () => Promise<void> } | null = null
let writeTail = Promise.resolve()

/** Drain this reader window's latest position before destroying its webview. */
export function flushReaderProgress(): Promise<void> {
  return pendingSave?.save() ?? writeTail
}

export function scheduleReaderProgressSave(
  ...position: Parameters<typeof api.setReadingProgress>
): () => void {
  if (pendingSave) window.clearTimeout(pendingSave.timer)
  let write: Promise<void> | null = null
  const entry = {
    timer: 0,
    save() {
      window.clearTimeout(entry.timer)
      if (pendingSave === entry) pendingSave = null
      if (!write) {
        write = writeTail
          .then(async () => {
            await api.setReadingProgress(...position)
          })
          .catch((error: unknown) => {
            console.error("[useLocatorProgressSync] save failed:", error)
          })
        writeTail = write
      }
      return write
    },
  }
  pendingSave = entry
  entry.timer = window.setTimeout(() => void entry.save(), SAVE_DEBOUNCE_MS)
  return () => {
    window.clearTimeout(entry.timer)
    if (pendingSave === entry) pendingSave = null
  }
}
