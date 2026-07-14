import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { SymbolView } from "expo-symbols"
import { Platform } from "react-native"

const READER_CHROME_ICON_SOURCE = {
  check: { ios: "checkmark", android: "check" },
  close: { ios: "xmark", android: "close" },
  delete: { ios: "trash", android: "delete-outline" },
  more: { ios: "ellipsis", android: "more-horiz" },
  bookmark: { ios: "bookmark", android: "bookmark-border" },
  bookmarkActive: { ios: "bookmark.fill", android: "bookmark" },
  manage: { ios: "checklist", android: "checklist" },
  settings: { ios: "slider.horizontal.3", android: "tune" },
  toc: { ios: "list.bullet", android: "list" },
} as const

export type ReaderChromeIconName = keyof typeof READER_CHROME_ICON_SOURCE

type ReaderChromeIconProps = {
  name: ReaderChromeIconName
  size: number
  color: string
}

export function ReaderChromeIcon({ name, size, color }: ReaderChromeIconProps) {
  const icon = READER_CHROME_ICON_SOURCE[name]

  if (Platform.OS === "ios") {
    return <SymbolView name={icon.ios} size={size} tintColor={color} />
  }

  return <MaterialIcons name={icon.android} size={size} color={color} />
}
