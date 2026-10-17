import { api } from "@/lib/tauri-api"

const SAVE_DEBOUNCE_MS = 1600
type PendingSave = { timer: number; save: () => Promise<void> }
let pendingSave: PendingSave | null = null
let latestSave: PendingSave | null = null
let writeTail = Promise.resolve()

/** Drain this reader window's latest position before destroying its webview. */
export async function flushReaderProgress(): Promise<void> {
  let saving: Promise<void>
  do {
    saving = pendingSave?.save() ?? writeTail
    await saving
  } while (pendingSave || saving !== writeTail)
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
          .catch(() => {})
          .then(async () => {
            await api.setReadingProgress(...position)
          })
          .catch((error: unknown) => {
            if (latestSave === entry) {
              pendingSave = entry
              write = null
            }
            console.error("[useLocatorProgressSync] save failed:", error)
            throw error
          })
        writeTail = write
      }
      return write
    },
  }
  pendingSave = entry
  latestSave = entry
  entry.timer = window.setTimeout(
    () => void entry.save().catch(() => {}),
    SAVE_DEBOUNCE_MS,
  )
  return () => {
    window.clearTimeout(entry.timer)
    if (pendingSave === entry) pendingSave = null
    if (latestSave === entry) latestSave = null
  }
}
