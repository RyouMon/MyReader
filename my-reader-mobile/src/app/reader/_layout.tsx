import { Stack } from "expo-router";

export default function ReaderLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
        gestureEnabled: false,
      }}
    />
  );
}
