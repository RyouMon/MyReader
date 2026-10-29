import { router, Stack, useFocusEffect } from "expo-router"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { ActivityIndicator } from "react-native"
import { Button, ListRow, Screen, SectionCard } from "@/src/components"
import { showErrorAlert } from "@/src/constants/alert-with-status-bar"
import { useThemePalette } from "@/src/design/tokens"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { getTtsConfig, type MobileTtsConfig } from "@/src/services/core/tts"
import { errorMessage } from "@/src/i18n/error-message"
import { View } from "@/tw"

export default function TtsProvidersScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const [config, setConfig] = useState<MobileTtsConfig | null>(null)
  const { options, toolbar } = useScreenHeader({
    title: t("ttsSettings.providers"),
    back: "hidden",
    close: { variant: "layout" },
    backTitle: t("back"),
  })
  useFocusEffect(
    useCallback(() => {
      let active = true
      void getTtsConfig()
        .then((config) => {
          if (active) setConfig(config)
        })
        .catch((error: unknown) => {
          if (active)
            showErrorAlert(t("settings.tts.loadFailed"), errorMessage(error))
        })
      return () => {
        active = false
      }
    }, [t]),
  )
  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <Screen>
        {config ? (
          <TtsProviderList profiles={config.providers} />
        ) : (
          <ActivityIndicator color={palette.primary} />
        )}
      </Screen>
    </>
  )
}

function TtsProviderList({
  profiles,
}: {
  profiles: MobileTtsConfig["providers"]
}) {
  const { t } = useTranslation()
  return (
    <View className="gap-3">
      {profiles.length > 0 ? (
        <SectionCard>
          {profiles.map((profile, index) => (
            <ListRow
              key={profile.id}
              title={profile.name}
              detail={`${profile.kind === "qwen" ? "Qwen" : t("settings.tts.providerKinds.openAiCompatible")} · ${profile.endpoint}`}
              isLast={index === profiles.length - 1}
              onPress={() =>
                router.push({
                  pathname: "/tts-providers/form",
                  params: { providerId: profile.id },
                })
              }
            />
          ))}
        </SectionCard>
      ) : null}
      <Button
        title={t("settings.tts.addProvider")}
        icon={{ ios: "plus", android: "add" }}
        onPress={() => router.push("/tts-providers/profile")}
      />
    </View>
  )
}
