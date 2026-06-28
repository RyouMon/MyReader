import { Stack } from "expo-router"

export default function ReaderLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTitle: "",
        animation: "fade",
        gestureEnabled: false,
      }}
    />
  )
}
