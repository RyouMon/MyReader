import { Stack } from "expo-router";

import HomeScreen from "@/src/screen/home-screen";

export default function HomeRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "我的阅读",
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
        }}
      />
      <HomeScreen />
    </>
  );
}
