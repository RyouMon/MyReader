import { useAppStore } from "@/src/store/app-store"

import { openSyncContext } from "./context"
import { evictLocalFile } from "./transfer"

/** Evicts a downloaded file from local cache only. */
export async function evictLocalFileForLibrary(
  libraryId: string,
  relativePath: string,
): Promise<void> {
  const state = useAppStore.getState()
  const library = state.libraries.find((item) => item.id === libraryId)
  if (!library) return
  const ctx = await openSyncContext(library, state.dataSources)
  await evictLocalFile(ctx, relativePath)
}
