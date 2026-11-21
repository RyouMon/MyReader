import { RemoteDirectoryBrowserScreen } from "@/src/features/settings/components/remote-directory-browser-screen"
export default function GoogleDriveBrowserRoute() {
  return (
    <RemoteDirectoryBrowserScreen
      sourceType="gdrive"
      browserRoute="/settings/gdrive/browser"
      translationNamespace="cloud.browser"
    />
  )
}
