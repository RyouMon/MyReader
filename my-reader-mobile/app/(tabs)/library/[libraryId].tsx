import { Redirect, useLocalSearchParams } from "expo-router";

import { useAppStore } from "@/src/store/app-store";

/**
 * 兼容旧链接 /library/[libraryId]：同步当前书库后统一到根路由 /library。
 */
export default function LibraryIdBridgeRoute() {
  const { libraryId } = useLocalSearchParams<{ libraryId?: string }>();

  if (typeof libraryId === "string") {
    const { activeLibraryId, setActiveLibrary } = useAppStore.getState();
    if (activeLibraryId !== libraryId) {
      void setActiveLibrary(libraryId);
    }
  }

  return <Redirect href="/library" />;
}
