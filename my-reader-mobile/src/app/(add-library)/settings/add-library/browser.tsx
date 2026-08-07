import { useLocalSearchParams } from "expo-router"

import { RemoteDirectoryBrowserScreen } from "@/src/features/settings/components/remote-directory-browser-screen"

export default function AddLibraryBrowserRoute() {
  const { sourceType } = useLocalSearchParams<{ sourceType?: string }>()

  if (sourceType === "onedrive") {
    return (
      <RemoteDirectoryBrowserScreen
        sourceType="onedrive"
        browserRoute="/settings/add-library/browser"
        translationNamespace="onedrive.browser"
      />
    )
  }

  return (
    <RemoteDirectoryBrowserScreen
      sourceType="webdav"
      browserRoute="/settings/add-library/browser"
      translationNamespace="webdav.browser"
    />
  )
}
