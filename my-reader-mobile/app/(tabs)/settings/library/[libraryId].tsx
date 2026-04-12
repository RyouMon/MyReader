import { Stack } from "expo-router";

import LibraryDetailScreen from "@/src/screen/library-detail-screen";

export default function LibraryDetailRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "书库详情",
          headerLargeTitle: false,
        }}
      />
      <LibraryDetailScreen />
    </>
  );
}
