import { RemoteDirectoryBrowserScreen } from "@/src/features/settings/components/remote-directory-browser-screen";

export default function WebDavBrowserScreen() {
  return (
    <RemoteDirectoryBrowserScreen
      sourceType="webdav"
      browserRoute="/settings/webdav/browser"
      translationNamespace="webdav.browser"
    />
  );
}
