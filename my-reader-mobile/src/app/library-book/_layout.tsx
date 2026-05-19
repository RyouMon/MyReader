import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

export default function LibraryBookLayout() {
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: t("bookDetail.title"),
      }}
    />
  );
}
