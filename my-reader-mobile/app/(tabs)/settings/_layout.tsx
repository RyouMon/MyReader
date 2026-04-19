import { Stack } from "expo-router";

import { useStackScreenOptions } from "@/src/hooks/use-stack-screen-options";

export default function SettingsStackLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="library/[libraryId]" options={{ title: "书库详情" }} />
      <Stack.Screen name="add-library/index" options={{ title: "添加书库" }} />
    </Stack>
  );
}
