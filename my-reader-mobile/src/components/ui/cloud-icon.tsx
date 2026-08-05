import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { SymbolView } from "expo-symbols"
import { Platform } from "react-native"

type CloudIconProps = {
  size: number
  color: string
  variant?: "filled" | "dashed"
}

export function CloudIcon({ size, color, variant = "filled" }: CloudIconProps) {
  if (Platform.OS === "ios") {
    return (
      <SymbolView
        name={variant === "dashed" ? "icloud.dashed" : "cloud.fill"}
        size={size}
        tintColor={color}
      />
    )
  }
  return (
    <MaterialIcons
      name={variant === "dashed" ? "cloud-queue" : "cloud"}
      size={size}
      color={color}
    />
  )
}
