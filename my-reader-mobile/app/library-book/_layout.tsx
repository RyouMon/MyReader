import { Stack } from "expo-router";

export default function LibraryBookLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: "书籍详情",
      }}
    />
  );
}
