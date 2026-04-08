import { Stack } from "expo-router";

import LibraryRootScreen from "@/src/screen/library-root-screen";

export default function LibraryRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
        }}
      />
      <LibraryRootScreen />
    </>
  );
}
