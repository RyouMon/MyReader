import {
  libraryLocationProblemKey,
  libraryLocationTitleKey,
} from "@my-reader/i18n/mobile"
import { router } from "expo-router"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/src/components/ui"
import { useThemePalette } from "@/src/design/tokens"
import type { LibraryLocation } from "@/src/services/core/library-location"
import { ScrollView, Text, View } from "@/tw"

export function LibraryLocationNotice({
  location,
  sourceType,
}: {
  location: LibraryLocation
  sourceType?: string | null
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const [details, setDetails] = useState(false)
  function sourceSettings() {
    if (!location.dataSourceId) {
      router.push("/settings")
      return
    }
    router.push({
      pathname:
        sourceType === "onedrive"
          ? "/settings/onedrive/[dataSourceId]"
          : "/settings/webdav/[dataSourceId]",
      params: { dataSourceId: location.dataSourceId },
    })
  }
  return (
    <View className="gap-3">
      <Text
        selectable
        className="text-base font-bold"
        style={{ color: palette.text }}
      >
        {location.libraryName}
      </Text>
      {location.dataSourceName ? (
        <Text selectable style={{ color: palette.text }}>
          {t("libraryLocation.dataSource")}: {location.dataSourceName}
        </Text>
      ) : null}
      {location.sourceRoot ? (
        <Text selectable style={{ color: palette.text }}>
          {t("libraryLocation.sourceRoot")}: {location.sourceRoot}
        </Text>
      ) : null}
      <Text selectable style={{ color: palette.text }}>
        {t("libraryLocation.currentPath")}: {location.path}
      </Text>
      <Text selectable style={{ color: palette.text }}>
        {t("libraryLocation.effectivePath")}: {location.effectivePath}
      </Text>
      {location.problem ? (
        <View accessibilityLiveRegion="polite" className="gap-2">
          <Text
            className="text-base font-bold"
            style={{ color: palette.danger }}
          >
            {t(libraryLocationTitleKey(location.problem))}
          </Text>
          <Text selectable style={{ color: palette.text }}>
            {t(libraryLocationProblemKey(location.problem), {
              path: location.effectivePath,
            })}
          </Text>
          {location.problem === "data_source" ||
          location.problem === "credential" ? (
            <Button
              title={t("libraryLocation.sourceSettings")}
              onPress={sourceSettings}
            />
          ) : null}
        </View>
      ) : null}
      {location.detail ? (
        <View className="gap-2">
          <Button
            title={t("libraryLocation.technicalDetails")}
            onPress={() => setDetails((value) => !value)}
          />
          {details ? (
            <ScrollView className="max-h-40" nestedScrollEnabled>
              <Text selectable style={{ color: palette.textMuted }}>
                {location.detail}
              </Text>
            </ScrollView>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
