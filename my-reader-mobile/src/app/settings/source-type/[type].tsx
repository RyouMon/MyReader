import { Redirect, useLocalSearchParams } from "expo-router"

import { CloudAddDataSourceScreen } from "@/src/features/cloud/cloud-add-data-source-screen"
import OneDriveAddDataSourceScreen from "@/src/features/onedrive/onedrive-add-data-source-screen"
import AddWebDavDataSourceScreen from "@/src/features/webdav/add-webdav-data-source-screen"

export default function AddDataSourceRoute() {
  const { type } = useLocalSearchParams<{ type: string }>()
  switch (type) {
    case "webdav":
      return <AddWebDavDataSourceScreen />
    case "onedrive":
      return <OneDriveAddDataSourceScreen />
    case "gdrive":
    case "dropbox":
    case "s3":
      return <CloudAddDataSourceScreen provider={type} />
    default:
      return <Redirect href="/settings/source-type" />
  }
}
