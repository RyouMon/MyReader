import { Stack } from "expo-router"

import { useStackScreenOptions } from "@/src/navigation/hooks/use-stack-screen-options"

/** 保证 Modal 路由有锚点，避免深链时底层栈被清空（Expo Router modals）。 */
export const unstable_settings = {
  anchor: "index",
}

export default function LibraryStackLayout() {
  const screenOptions = useStackScreenOptions()

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[libraryId]" />
    </Stack>
  )
}
