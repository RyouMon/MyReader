import { Stack } from "expo-router";

import { useStackScreenOptions } from "@/src/navigation/hooks/use-stack-screen-options";

export const unstable_settings = {
  anchor: "index",
};

export default function WebDavModalStackLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[dataSourceId]" />
      <Stack.Screen name="add" />
      <Stack.Screen name="browser" />
    </Stack>
  );
}
