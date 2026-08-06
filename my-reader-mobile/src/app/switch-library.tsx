import CloseIcon from "@expo/material-symbols/close.xml"
import { router, Stack } from "expo-router"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Platform, ScrollView } from "react-native"

import { AndroidHeaderIconButton } from "@/src/components/ui/android-header-icon-button"
import { useThemePalette } from "@/src/design/tokens"
import { LibrarySwitcherList } from "@/src/features/library/components/library-switcher-list"
import { Text, View } from "@/tw"

export default function LibrarySwitcherSheetRoute() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const dismiss = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
      return
    }

    router.replace("/library")
  }, [])

  return (
    <>
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            accessibilityLabel={t("library.switchLibraryAlert.close")}
            icon="xmark"
            onPress={dismiss}
          />
        </Stack.Toolbar>
      ) : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
        style={{ flex: 1, backgroundColor: palette.background }}
      >
        {Platform.OS === "android" ? (
          <View className="mb-3 flex-row items-center justify-between pl-2">
            <Text
              className="text-xl font-semibold"
              style={{ color: palette.text }}
            >
              {t("library.allLibraries")}
            </Text>
            <AndroidHeaderIconButton
              accessibilityLabel={t("library.switchLibraryAlert.close")}
              icon={CloseIcon}
              onPress={dismiss}
              testID="library-switcher-close-button"
            />
          </View>
        ) : null}
        <LibrarySwitcherList onDismiss={dismiss} />
      </ScrollView>
    </>
  )
}
