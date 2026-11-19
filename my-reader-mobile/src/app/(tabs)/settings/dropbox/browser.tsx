import { RemoteDirectoryBrowserScreen } from "@/src/features/settings/components/remote-directory-browser-screen"
export default function DropboxBrowserRoute() {
  return (
    <RemoteDirectoryBrowserScreen
      sourceType="dropbox"
      browserRoute="/settings/dropbox/browser"
      translationNamespace="cloud.browser"
    />
  )
}
