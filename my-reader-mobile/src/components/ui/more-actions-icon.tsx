import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { SymbolView } from "expo-symbols"
import { Platform } from "react-native"

type MoreActionsIconProps = {
  size: number
  color: string
}

/**
 * Platform-consistent "more actions" icon:
 * - iOS: SF Symbol ellipsis
 * - Android: Material Icons more-horiz
 */
export function MoreActionsIcon({ size, color }: MoreActionsIconProps) {
  if (Platform.OS === "ios") {
    return <SymbolView name="ellipsis" size={size} tintColor={color} />
  }
  return <MaterialIcons name="more-horiz" size={size} color={color} />
}
