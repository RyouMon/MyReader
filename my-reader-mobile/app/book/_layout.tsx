import { Stack } from "expo-router";

export default function BookLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: "书籍详情",
      }}
    />
  );
}
