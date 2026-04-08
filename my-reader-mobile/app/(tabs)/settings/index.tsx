import { Stack } from "expo-router";

import SettingsScreen from "@/src/screen/settings-screen";

export default function SettingsRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "设置",
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
        }}
      />
      <SettingsScreen />
    </>
  );
}
