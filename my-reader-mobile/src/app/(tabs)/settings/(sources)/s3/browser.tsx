import { RemoteDirectoryBrowserScreen } from "@/src/features/settings/components/remote-directory-browser-screen"
export default function S3BrowserRoute() {
  return (
    <RemoteDirectoryBrowserScreen
      sourceType="s3"
      browserRoute="/settings/s3/browser"
      translationNamespace="cloud.browser"
    />
  )
}
