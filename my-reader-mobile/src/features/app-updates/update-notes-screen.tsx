import CloseIcon from "@expo/material-symbols/close.xml"
import { Redirect, router } from "expo-router"
import { useTranslation } from "react-i18next"
import { Platform, View as NativeView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { AndroidHeaderIconButton } from "@/src/components/ui/android-header-icon-button"
import {
  ANDROID_HEADER_EDGE_INSET,
  AndroidHeaderActions,
  AndroidHeaderTitle,
} from "@/src/components/ui/android-header-layout"
import { useThemePalette } from "@/src/design/tokens"
import { ScrollView, Text, View } from "@/tw"
import { ReleaseNotes } from "./release-notes"
import { useAppUpdate } from "./use-app-update"

export default function UpdateNotesScreen() {
  return Platform.OS === "android" ? (
    <AndroidUpdateNotesScreen />
  ) : (
    <Redirect href="/settings" />
  )
}

function AndroidUpdateNotesScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const insets = useSafeAreaInsets()
  const { data } = useAppUpdate()
  if (!data?.version) return <Redirect href="/settings" />

  const dismiss = () => {
    if (router.canGoBack()) router.back()
    else router.replace("/settings")
  }

  return (
    <NativeView
      collapsable={false}
      style={{ flex: 1, backgroundColor: palette.background }}
    >
      <View
        className="min-h-14 flex-row items-center"
        style={{ paddingHorizontal: ANDROID_HEADER_EDGE_INSET }}
      >
        <AndroidHeaderTitle color={palette.text}>
          {t("appUpdates.notes")}
        </AndroidHeaderTitle>
        <AndroidHeaderActions>
          <AndroidHeaderIconButton
            accessibilityLabel={t("common.close")}
            icon={CloseIcon}
            onPress={dismiss}
          />
        </AndroidHeaderActions>
      </View>
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <Text className="mb-4 text-base" style={{ color: palette.textMuted }}>
          {t("appUpdates.latestVersion", { version: data.version })}
        </Text>
        <ReleaseNotes>
          {data.notes?.trim() || t("appUpdates.notesEmpty")}
        </ReleaseNotes>
      </ScrollView>
    </NativeView>
  )
}
