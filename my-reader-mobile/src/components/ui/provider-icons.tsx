import { Image, View } from "react-native"
import Svg, { Path } from "react-native-svg"

import { useThemePalette } from "@/src/design/tokens"
import DROPBOX_GLYPH from "../../../assets/images/providers/dropbox-glyph-128.png"
import GOOGLE_DRIVE_LOGO from "../../../assets/images/providers/google-drive-2026.png"

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
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5.5C4 3.57 7.58 2 12 2s8 1.57 8 3.5S16.42 9 12 9 4 7.43 4 5.5Zm0 0V12c0 1.93 3.58 3.5 8 3.5s8-1.57 8-3.5V5.5M4 12v6.5c0 1.93 3.58 3.5 8 3.5s8-1.57 8-3.5V12"
        stroke={palette.primary}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
