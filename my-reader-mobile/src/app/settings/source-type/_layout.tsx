import { Stack } from "expo-router"

import { useStackScreenOptions } from "@/src/navigation/hooks/use-stack-screen-options"

export const unstable_settings = { anchor: "index" }

export default function AddDataSourceLayout() {
  const screenOptions = useStackScreenOptions()
  return <Stack screenOptions={screenOptions} />
}
