import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { SymbolView, type SFSymbol } from "expo-symbols"
import type { ComponentProps } from "react"
import { Platform } from "react-native"

type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"]
export type PlatformIconName =
  | MaterialIconName
  | { ios: SFSymbol; android: MaterialIconName }

export function PlatformIcon({
  name,
  size,
  color,
}: {
  name: PlatformIconName
  size: number
  color: string
}) {
  if (typeof name !== "string" && Platform.OS === "ios") {
    return <SymbolView name={name.ios} size={size} tintColor={color} />
  }
  return (
    <MaterialIcons
      name={typeof name === "string" ? name : name.android}
      size={size}
      color={color}
    />
  )
}
