import { RemoteDirectoryBrowserScreen } from "@/src/features/settings/components/remote-directory-browser-screen";

export default function OneDriveBrowserScreen() {
  return (
    <RemoteDirectoryBrowserScreen
      sourceType="onedrive"
      browserRoute="/settings/onedrive/browser"
      translationNamespace="onedrive.browser"
    />
  );
}
