import CloudIcon from "@expo/material-symbols/cloud.xml"
import CloudAlertIcon from "@expo/material-symbols/cloud_alert.xml"
import CloudDoneIcon from "@expo/material-symbols/cloud_done.xml"
import CloudDownloadIcon from "@expo/material-symbols/cloud_download.xml"
import CloudOffIcon from "@expo/material-symbols/cloud_off.xml"
import CloudSyncIcon from "@expo/material-symbols/cloud_sync.xml"
import CloudUploadIcon from "@expo/material-symbols/cloud_upload.xml"
import type { SyncIndicatorState } from "@my-reader/tools/sync-status"
import { Host, Icon } from "@expo/ui/jetpack-compose"
import { SymbolView } from "expo-symbols"
import {
  Platform,
  type ColorValue,
  type ImageSourcePropType,
} from "react-native"

import { SYNC_STATUS_IOS_SYMBOLS } from "../sync-status-visuals"

const ANDROID_ICON_BY_STATE: Record<SyncIndicatorState, ImageSourcePropType> = {
  idle: CloudIcon,
  offline: CloudOffIcon,
  recent_success: CloudDoneIcon,
  unchanged: CloudDoneIcon,
  syncing: CloudSyncIcon,
  pushing: CloudUploadIcon,
  pulling: CloudDownloadIcon,
  failed: CloudAlertIcon,
}

export function SyncStatusIcon({
  indicator,
  color,
  size = 32,
}: {
  indicator: SyncIndicatorState
  color: ColorValue
  size?: number
}) {
  if (Platform.OS === "android") {
    return (
      <Host matchContents pointerEvents="none">
        <Icon
          source={ANDROID_ICON_BY_STATE[indicator]}
          size={size}
          tint={color}
        />
      </Host>
    )
  }

  return (
    <SymbolView
      name={SYNC_STATUS_IOS_SYMBOLS[indicator]}
      resizeMode="scaleAspectFit"
      size={size}
      tintColor={color}
      weight="regular"
    />
  )
}
