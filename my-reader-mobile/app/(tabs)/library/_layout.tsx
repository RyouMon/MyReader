import { Stack } from "expo-router";

import { useStackScreenOptions } from "@/src/hooks/use-stack-screen-options";

export default function LibraryStackLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[libraryId]" />
    </Stack>
  );
}
