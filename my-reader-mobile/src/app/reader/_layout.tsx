import { Stack } from "expo-router"
import { Platform } from "react-native"

export default function ReaderLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTitle: "",
        animation: Platform.select({
          ios: "slide_from_bottom",
          android: "slide_from_bottom",
          default: "slide_from_bottom",
        }),
        gestureEnabled: false,
      }}
    />
  )
}
