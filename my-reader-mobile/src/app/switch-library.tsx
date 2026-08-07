import AddIcon from "@expo/material-symbols/add.xml"
import CloseIcon from "@expo/material-symbols/close.xml"
import { router, Stack } from "expo-router"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Platform, ScrollView, View as NativeView } from "react-native"

import { AndroidHeaderIconButton } from "@/src/components/ui/android-header-icon-button"
import { useThemePalette } from "@/src/design/tokens"
import { LibrarySwitcherList } from "@/src/features/library/components/library-switcher-list"
import { useAppStore } from "@/src/store/app-store"
import { Text, View } from "@/tw"

export default function LibrarySwitcherSheetRoute() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const hasLibraries = useAppStore((state) => state.libraries.length > 0)
  const dismiss = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
      return
    }

    router.replace("/library")
  }, [])
  const addLibrary = useCallback(() => {
    router.push("/settings/add-library")
  }, [])

  return (
    <>
      {Platform.OS === "ios" ? (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              accessibilityLabel={t("library.switchLibraryAlert.close")}
              icon="xmark"
              onPress={dismiss}
            />
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              accessibilityLabel={t("library.addLibrary")}
              icon="plus"
              onPress={addLibrary}
            />
          </Stack.Toolbar>
        </>
      ) : null}
      <NativeView
        collapsable={false}
        testID="library-switcher-content"
        style={{ flex: 1, backgroundColor: palette.background }}
      >
        {Platform.OS === "android" ? (
          <View className="h-16 flex-row items-center px-2">
            <View className="w-12 items-start">
              <AndroidHeaderIconButton
                accessibilityLabel={t("library.switchLibraryAlert.close")}
                icon={CloseIcon}
                onPress={dismiss}
                testID="library-switcher-close-button"
              />
            </View>
            <Text
              className="flex-1 text-center text-xl font-semibold"
              style={{ color: palette.text }}
            >
              {t("library.allLibraries")}
            </Text>
            <View className="w-12 items-end">
              <AndroidHeaderIconButton
                accessibilityLabel={t("library.addLibrary")}
                icon={AddIcon}
                onPress={addLibrary}
                testID="library-switcher-add-button"
              />
            </View>
          </View>
        ) : null}
        {hasLibraries ? (
          <ScrollView
            testID="library-switcher-scroll-view"
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 16,
            }}
            style={{ flex: 1 }}
          >
            <LibrarySwitcherList onDismiss={dismiss} />
          </ScrollView>
        ) : (
          <View className="flex-1 px-4 py-4">
            <LibrarySwitcherList onDismiss={dismiss} />
          </View>
        )}
      </NativeView>
    </>
  )
}
