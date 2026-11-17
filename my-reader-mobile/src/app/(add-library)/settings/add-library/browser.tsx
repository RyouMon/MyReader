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

  if (
    sourceType === "gdrive" ||
    sourceType === "dropbox" ||
    sourceType === "s3"
  ) {
    return (
      <RemoteDirectoryBrowserScreen
        sourceType={sourceType}
        browserRoute="/settings/add-library/browser"
        translationNamespace="cloud.browser"
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
