import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

export default function BookLayout() {
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: t("bookDetail.title"),
      }}
    >
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
