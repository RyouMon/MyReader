import { parseSyncStage } from "@my-reader/tools/sync-status"

import type { LibrarySyncObserver } from "@/src/domain/sync/types"

import { useAppStore } from "./app-store"

/** Writes Core observations into the mobile presentation cache. */
export const observeLibrarySync: LibrarySyncObserver = (observation) => {
  const state = useAppStore.getState()
  switch (observation.type) {
    case "started":
      state.startLibrarySync(observation)
      return
    case "progress": {
      const stage = parseSyncStage(observation.stage)
      if (!stage) return
      state.updateLibrarySyncProgress({ ...observation, stage })
      return
    }
    case "succeeded":
      state.succeedLibrarySync(observation)
      return
    case "unchanged":
      state.finishLibrarySyncUnchanged(observation)
      return
    case "failed":
      state.failLibrarySync(observation)
      return
    case "cancelled":
      state.cancelLibrarySync(observation)
  }
}
