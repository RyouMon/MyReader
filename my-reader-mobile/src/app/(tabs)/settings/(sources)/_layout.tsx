import { Stack } from "expo-router"
import { useStackScreenOptions } from "@/src/navigation/hooks/use-stack-screen-options"

export const unstable_settings = { anchor: "data-sources" }

export default function DataSourcesLayout() {
  return <Stack screenOptions={useStackScreenOptions()} />
}
