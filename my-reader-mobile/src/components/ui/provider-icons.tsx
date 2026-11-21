import { Image, View } from "react-native"

import { useThemePalette } from "@/src/design/tokens"
import DROPBOX_GLYPH from "../../../assets/images/providers/dropbox-glyph-128.png"
import GOOGLE_DRIVE_LOGO from "../../../assets/images/providers/google-drive-2026.png"
import { PlatformIcon } from "./platform-icon"

type ProviderIconProps = {
  size?: number
}

export function GoogleDriveIcon({ size = 24 }: ProviderIconProps) {
  return (
    <Image
      source={GOOGLE_DRIVE_LOGO}
      accessible={false}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  )
}

export function DropboxIcon({ size = 24 }: ProviderIconProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image
        source={DROPBOX_GLYPH}
        accessible={false}
        style={{ width: size * 1.5, height: size * 1.5 }}
        resizeMode="contain"
      />
    </View>
  )
}

export function S3StorageIcon({ size = 24 }: ProviderIconProps) {
  const palette = useThemePalette()
  return (
    <PlatformIcon
      name={{ ios: "externaldrive.fill", android: "storage" }}
      size={size}
      color={palette.primary}
    />
  )
}
