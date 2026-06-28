import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { SymbolView } from "expo-symbols"
import { Platform } from "react-native"

type CloudIconProps = {
  size: number
  color: string
}

export function CloudIcon({ size, color }: CloudIconProps) {
  if (Platform.OS === "ios") {
    return <SymbolView name="cloud.fill" size={size} tintColor={color} />
  }
  return <MaterialIcons name="cloud" size={size} color={color} />
}
