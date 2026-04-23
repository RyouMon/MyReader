import { Stack } from "expo-router";

import SyncScreen from "@/src/screen/sync-screen";

export default function SyncRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "同步与下载",
          headerLargeTitle: false,
        }}
      />
      <SyncScreen />
    </>
  );
}
