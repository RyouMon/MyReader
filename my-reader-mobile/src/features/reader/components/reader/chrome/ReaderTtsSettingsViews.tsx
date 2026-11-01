import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import type { TtsVoice } from "@my-reader/readium"
import type { MenuAction } from "@react-native-menu/menu"
import { SymbolView } from "expo-symbols"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Platform, Pressable, View as RNView, StyleSheet } from "react-native"
import { Button, FormSlider } from "@/src/components"
import { TtsPreviewControls } from "@/src/components/tts-preview-controls"
import { ttsMaximumPlaybackSpeed } from "@/src/constants/tts"
import {
  type ReaderChromePalette,
  readerFormColors,
} from "@/src/design/reader-chrome-palette"
import type { useTtsPreview } from "@/src/domain/tts/use-tts-preview"
import type {
  MobileTtsConfig,
  MobileTtsProviderProfile,
  TtsPlayback,
} from "@/src/services/core/tts"
import { Text, View } from "@/tw"
import { ReaderTtsMenuRow } from "./ReaderTtsSettingsFields"

export function ReaderTtsPlaybackSettings({
  hidden = false,
  config,
  palette,
  selectedProfile,
  selectedEngineKey,
  engineOptions,
  applyEngine,
  voicesLoading,
  selectedVoice,
  selectedVoiceId,
  voiceActions,
  selectVoice,
  updatePlayback,
  previewState,
  previewVoiceId,
  canPreview,
  startPreview,
  stopPreview,
  openProviders,
}: {
  hidden?: boolean
  config: MobileTtsConfig
  palette: ReaderChromePalette
  selectedProfile: MobileTtsProviderProfile | undefined
  selectedEngineKey: string
  engineOptions: { key: string; label: string }[]
  applyEngine: (key: string) => Promise<void>
  voicesLoading: boolean
  selectedVoice: TtsVoice | undefined
  selectedVoiceId: string | undefined
  voiceActions: MenuAction[]
  selectVoice: (voiceId: string) => Promise<void>
  updatePlayback: (patch: Partial<TtsPlayback>) => Promise<void>
  previewState: ReturnType<typeof useTtsPreview>["state"]
  canPreview: boolean
  previewVoiceId: string | null
  startPreview: (voiceId?: string) => Promise<void>
  stopPreview: () => void
  openProviders: () => void
}) {
  const { t } = useTranslation()
  const colors = readerFormColors(palette)
  if (hidden) return null
  return (
    <View className="gap-4">
      <TtsPreviewControls
        state={previewState}
        canPreview={canPreview}
        onStart={() => void startPreview()}
        onStop={stopPreview}
        colors={colors}
      />
      <ReaderTtsMenuRow
        title={t("settings.tts.engine")}
        value={
          engineOptions.find((option) => option.key === selectedEngineKey)
            ?.label ?? ""
        }
        actions={engineOptions.map((option) => ({
          id: option.key,
          title: option.label,
          state: option.key === selectedEngineKey ? "on" : "off",
        }))}
        onSelect={(key) => void applyEngine(key)}
        palette={palette}
      />
      <ReaderTtsMenuRow
        title={t("settings.tts.voice")}
        preview={{
          previewVoiceId,
          onPreview: (id) => void startPreview(id),
          onStopPreview: stopPreview,
        }}
        value={
          voicesLoading
            ? t("settings.tts.loading")
            : (selectedVoice?.name ??
              selectedVoiceId ??
              t("settings.tts.automaticVoice"))
        }
        actions={voiceActions}
        palette={palette}
        onSelect={(voiceId) => void selectVoice(voiceId)}
      />
      <FormSlider
        label={t("settings.tts.speed")}
        value={Math.min(
          config.playback.speed,
          ttsMaximumPlaybackSpeed(selectedProfile),
        )}
        onChange={(speed) => void updatePlayback({ speed })}
        min={0.5}
        max={ttsMaximumPlaybackSpeed(selectedProfile)}
        step={0.1}
        formatValue={(value) => `${value.toFixed(1)}×`}
        colors={colors}
      />
      <FormSlider
        label={t("settings.tts.pitch")}
        value={config.playback.pitch}
        onChange={(pitch) => void updatePlayback({ pitch })}
        min={0.5}
        max={2}
        step={0.1}
        formatValue={(value) => value.toFixed(1)}
        colors={colors}
      />
      <Button
        title={t("ttsSettings.manageProviders")}
        variant="secondary"
        onPress={openProviders}
        colors={{
          backgroundColor: palette.segmentIdle,
          textColor: palette.accentText,
          underlayColor: palette.segmentActive,
        }}
      />
    </View>
  )
}

export function ReaderTtsSettingsHeader({
  palette,
  canGoBack,
  goBack,
  headerTitle,
  action,
}: {
  palette: ReaderChromePalette
  canGoBack: boolean
  goBack: () => void
  headerTitle: string
  action?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <RNView style={styles.header}>
      {canGoBack ? (
        <Pressable
          accessibilityLabel={t("back")}
          accessibilityRole="button"
          onPress={goBack}
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.56 : 1 },
          ]}
        >
          {Platform.OS === "ios" ? (
            <SymbolView
              name="chevron.left"
              size={22}
              tintColor={palette.text}
            />
          ) : (
            <MaterialIcons name="arrow-back" size={24} color={palette.text} />
          )}
        </Pressable>
      ) : null}
      <Text
        accessibilityLabel={headerTitle}
        accessibilityRole="header"
        className="text-lg font-bold"
        numberOfLines={1}
        style={[styles.headerTitle, { color: palette.text }]}
      >
        {headerTitle}
      </Text>
      {action}
    </RNView>
  )
}

const styles = StyleSheet.create({
  header: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 20,
    paddingBottom: 6,
    paddingTop: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    marginLeft: -8,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    minWidth: 0,
    flex: 1,
  },
  saveButton: {
    minWidth: 52,
    minHeight: 36,
    alignItems: "flex-end",
    justifyContent: "center",
  },
})
