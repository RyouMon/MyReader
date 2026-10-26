import type { TtsVoice } from "@my-reader/readium"
import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import type { MenuAction } from "@react-native-menu/menu"
import { SymbolView } from "expo-symbols"
import { useTranslation } from "react-i18next"
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View as RNView,
} from "react-native"
import { ttsMaximumPlaybackSpeed } from "@/src/constants/tts"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import type {
  MobileTtsConfig,
  MobileTtsProviderProfile,
  TtsPlayback,
} from "@/src/services/core/tts"
import type { useReaderTtsPreview } from "@/src/features/reader/tts/use-reader-tts-preview"
import { Text } from "@/tw"
import { ReaderTtsMenuRow } from "./ReaderTtsSettingsFields"
import { SegmentPicker, SliderControl } from "./SettingControls"

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
  previewState: ReturnType<typeof useReaderTtsPreview>["state"]
  canPreview: boolean
  startPreview: () => Promise<void>
  stopPreview: () => void
  openProviders: () => void
}) {
  const { t } = useTranslation()
  if (hidden) return null
  return (
    <>
      <ReaderTtsPreviewCard
        palette={palette}
        previewState={previewState}
        canPreview={canPreview}
        startPreview={startPreview}
        stopPreview={stopPreview}
      />
      <SegmentPicker
        label={t("settings.tts.engine")}
        options={engineOptions}
        value={selectedEngineKey}
        onChange={(key) => void applyEngine(key)}
        palette={palette}
        disableLabelScaling
        tallOptions
      />
      <ReaderTtsMenuRow
        title={t("settings.tts.voice")}
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
      <SliderControl
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
        palette={palette}
      />
      <SliderControl
        label={t("settings.tts.pitch")}
        value={config.playback.pitch}
        onChange={(pitch) => void updatePlayback({ pitch })}
        min={0.5}
        max={2}
        step={0.1}
        formatValue={(value) => value.toFixed(1)}
        palette={palette}
      />
      <Pressable
        accessibilityLabel={t("ttsSettings.manageProviders")}
        accessibilityRole="button"
        onPress={openProviders}
        style={({ pressed }) => [
          styles.manageButton,
          {
            backgroundColor: palette.segmentIdle,
            borderColor: palette.border,
            opacity: pressed ? 0.72 : 1,
          },
        ]}
      >
        <Text
          className="text-base font-semibold"
          style={{ color: palette.accentText }}
        >
          {t("ttsSettings.manageProviders")}
        </Text>
      </Pressable>
    </>
  )
}

function ReaderTtsPreviewCard({
  palette,
  previewState,
  canPreview,
  startPreview,
  stopPreview,
}: {
  palette: ReaderChromePalette
  previewState: ReturnType<typeof useReaderTtsPreview>["state"]
  canPreview: boolean
  startPreview: () => Promise<void>
  stopPreview: () => void
}) {
  const { t } = useTranslation()
  const previewActionLabel =
    previewState === "generating" || previewState === "loading"
      ? t("settings.tts.previewGenerating")
      : previewState === "playing"
        ? t("settings.tts.previewPlaying")
        : t("settings.tts.previewAction")
  return (
    <RNView
      style={[
        styles.previewCard,
        {
          backgroundColor: palette.segmentIdle,
          borderColor: palette.border,
        },
      ]}
    >
      <Text className="text-base" style={{ color: palette.text }}>
        {t("settings.tts.previewText")}
      </Text>
      <Pressable
        accessibilityLabel={previewActionLabel}
        accessibilityRole="button"
        accessibilityState={{
          disabled: previewState === "idle" && !canPreview,
        }}
        disabled={previewState === "idle" && !canPreview}
        onPress={
          previewState === "idle" ? () => void startPreview() : stopPreview
        }
        style={({ pressed }) => [
          styles.previewButton,
          {
            backgroundColor: palette.accent,
            opacity:
              previewState === "idle" && !canPreview
                ? 0.42
                : pressed
                  ? 0.72
                  : 1,
          },
        ]}
      >
        {previewState === "generating" || previewState === "loading" ? (
          <ActivityIndicator color={palette.bg} size="small" />
        ) : (
          <MaterialIcons
            name={previewState === "playing" ? "stop" : "play-arrow"}
            size={20}
            color={palette.bg}
          />
        )}
        <Text className="text-base font-semibold" style={{ color: palette.bg }}>
          {previewActionLabel}
        </Text>
      </Pressable>
    </RNView>
  )
}

export function ReaderTtsSettingsHeader({
  palette,
  canGoBack,
  goBack,
  headerTitle,
}: {
  palette: ReaderChromePalette
  canGoBack: boolean
  goBack: () => void
  headerTitle: string
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
    </RNView>
  )
}

const styles = StyleSheet.create({
  providerList: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  providerRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  providerCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  addProviderButton: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  providerTypeButton: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  manageButton: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  previewCard: {
    gap: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 18,
    padding: 16,
  },
  previewButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
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
