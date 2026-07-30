import { Redirect, useLocalSearchParams } from "expo-router"
import { useEffect } from "react"

import { switchActiveLibrary } from "@/src/domain/library/hooks/library-actions"
import { useAppStore } from "@/src/store/app-store"

/**
 * 兼容旧链接 /library/[libraryId]：同步当前书库后统一到根路由 /library。
 */
export default function LibraryIdBridgeRoute() {
  const { libraryId } = useLocalSearchParams<{ libraryId?: string }>()

  useEffect(() => {
    if (typeof libraryId !== "string") return
    const { activeLibraryId } = useAppStore.getState()
    if (activeLibraryId !== libraryId) {
      void switchActiveLibrary(libraryId)
    }
  }, [libraryId])

  return <Redirect href="/library" />
}
