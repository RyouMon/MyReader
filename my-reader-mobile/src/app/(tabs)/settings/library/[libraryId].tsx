import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import LibraryDetailScreen from "@/src/features/library/library-detail-screen";

export default function LibraryDetailRoute() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen
        options={{
          title: t("settings.libraryDetail"),
          headerLargeTitle: false,
        }}
      />
      <LibraryDetailScreen />
    </>
  );
}
