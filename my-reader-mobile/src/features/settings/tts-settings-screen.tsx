import { tts as readiumTts } from "@my-reader/readium"
import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { formatTtsLanguageName } from "@my-reader/tools/reader-tts-language"
import Slider from "@react-native-community/slider"
import type { MenuAction } from "@react-native-menu/menu"
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio"
import { router, useFocusEffect } from "expo-router"
import * as Speech from "expo-speech"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ActivityIndicator } from "react-native"

import {
  Button,
  ListMenuRow,
  ListRow,
  Screen,
  SectionCard,
  SectionLabel,
} from "@/src/components"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import { ttsMaximumPlaybackSpeed } from "@/src/constants/tts"
import { useThemePalette } from "@/src/design/tokens"
import {
  getTtsConfig,
  listTtsVoices,
  type MobileTtsConfig,
  setTtsDefaultEngine,
  setTtsPlayback,
  setTtsVoice,
  synthesizeTts,
  type TtsPlayback,
  type TtsVoice,
} from "@/src/services/core/tts"
import { toFileUri } from "@/src/services/fs/path"
import { describeError } from "@/src/utils/common"
import { Text, View } from "@/tw"

const DEFAULT_VOICE_LANGUAGE = "und"
const PREVIEW_LANGUAGE = "zh-CN"
const PREVIEW_MIME_TYPES = [
  "audio/mpeg",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/wav",
]

type PreviewState = "idle" | "generating" | "loading" | "playing"

function engineKey(config: MobileTtsConfig): string {
  return config.defaultEngine.kind === "provider"
    ? `provider:${config.defaultEngine.profileId}`
    : "system"
}

function playbackValue(value: number, suffix = "") {
  return `${Number(value.toFixed(1))}${suffix}`
}

function PlaybackSliderRow({
  title,
  value,
  minimumValue,
  maximumValue,
  step,
  suffix,
  isLast,
  onValueChange,
  onSlidingComplete,
}: {
  title: string
  value: number
  minimumValue: number
  maximumValue: number
  step: number
  suffix?: string
  isLast?: boolean
  onValueChange: (value: number) => void
  onSlidingComplete: (value: number) => void
}) {
  const palette = useThemePalette()

  return (
    <View
      className="gap-2 px-4 py-3"
      style={{
        borderBottomColor: palette.borderStrong,
        borderBottomWidth: isLast ? 0 : 1,
      }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-bold" style={{ color: palette.text }}>
          {title}
        </Text>
        <Text className="text-sm" style={{ color: palette.textMuted }}>
          {playbackValue(value, suffix)}
        </Text>
      </View>
      <Slider
        accessibilityLabel={title}
        value={value}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        minimumTrackTintColor={palette.primary}
        maximumTrackTintColor={palette.borderStrong}
        thumbTintColor={palette.primary}
        onValueChange={onValueChange}
        onSlidingComplete={onSlidingComplete}
      />
    </View>
  )
}

function TtsPreviewControls({
  previewState,
  preview,
  stopPreview,
}: {
  previewState: PreviewState
  preview: () => Promise<void>
  stopPreview: () => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const previewActionLabel =
    previewState === "generating" || previewState === "loading"
      ? t("settings.tts.previewGenerating")
      : previewState === "playing"
        ? t("settings.tts.previewPlaying")
        : t("settings.tts.previewAction")

  return (
    <View className="gap-3">
      <SectionLabel>{t("settings.tts.previewSection")}</SectionLabel>
      <Text className="px-1 text-base" style={{ color: palette.textMuted }}>
        {t("settings.tts.previewText")}
      </Text>
      <Button
        accessibilityLabel={previewActionLabel}
        size="md"
        variant="primary"
        onPress={
          previewState === "idle" ? () => void preview() : () => stopPreview()
        }
      >
        {previewState === "generating" || previewState === "loading" ? (
          <ActivityIndicator color={palette.primaryForeground} size="small" />
        ) : (
          <MaterialIcons
            name={previewState === "playing" ? "stop" : "play-arrow"}
            size={20}
            color={palette.primaryForeground}
          />
        )}
        <Text
          className="text-base font-bold"
          style={{ color: palette.primaryForeground }}
        >
          {previewActionLabel}
        </Text>
      </Button>
    </View>
  )
}

function TtsProviderList({
  profiles,
}: {
  profiles: MobileTtsConfig["profiles"]
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  return (
    <View className="gap-3">
      <SectionLabel>{t("settings.tts.providersSection")}</SectionLabel>
      {profiles.length > 0 ? (
        <SectionCard>
          {profiles.map((profile, index) => (
            <ListRow
              key={profile.id}
              title={profile.name}
              detail={`${profile.kind === "qwen" ? "Qwen" : t("settings.tts.providerKinds.openAiCompatible")} · ${profile.endpoint}`}
              value={profile.enabled ? undefined : t("settings.tts.disabled")}
              isLast={index === profiles.length - 1}
              onPress={() =>
                router.push({
                  pathname: "/settings/tts-provider",
                  params: { providerId: profile.id },
                })
              }
            />
          ))}
        </SectionCard>
      ) : null}
      <Button
        size="md"
        variant="primary"
        accessibilityLabel={t("settings.tts.addProvider")}
        onPress={() => router.push("/settings/tts-provider")}
      >
        <MaterialIcons name="add" size={20} color={palette.primaryForeground} />
        <Text
          className="text-base font-bold"
          style={{ color: palette.primaryForeground }}
        >
          {t("settings.tts.addProvider")}
        </Text>
      </Button>
      <Text className="px-1 text-xs" style={{ color: palette.textMuted }}>
        {t("settings.tts.providerPrivacy")}
      </Text>
    </View>
  )
}

function voiceLabel(
  availableVoices: TtsVoice[],
  selectedVoiceId: string | undefined,
  automaticLabel: string,
) {
  return (
    availableVoices.find((voice) => voice.id === selectedVoiceId)?.name ??
    selectedVoiceId ??
    automaticLabel
  )
}

export default function TtsSettingsScreen() {
  const { t, i18n } = useTranslation()
  const previewLanguage =
    i18n?.resolvedLanguage || i18n?.language || PREVIEW_LANGUAGE
  const palette = useThemePalette()
  const [config, setConfig] = useState<MobileTtsConfig | null>(null)
  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [previewState, setPreviewState] = useState<PreviewState>("idle")
  const [previewSource, setPreviewSource] = useState<string | null>(null)
  const previewPlayer = useAudioPlayer(previewSource)
  const previewStatus = useAudioPlayerStatus(previewPlayer)
  const previewAbortRef = useRef<AbortController | null>(null)
  const previewGenerationRef = useRef(0)
  const previewRateRef = useRef(1)
  const systemVoicesLoadedRef = useRef(false)

  const stopPreview = useCallback((updateState = true) => {
    previewGenerationRef.current += 1
    previewAbortRef.current?.abort()
    previewAbortRef.current = null
    void Speech.stop()
    setPreviewSource(null)
    if (updateState) setPreviewState("idle")
  }, [])

  const loadConfig = useCallback(async () => {
    try {
      setConfig(await getTtsConfig())
    } catch (error) {
      showAlertWithStatusBarRestore(
        t("settings.tts.loadFailed"),
        describeError(error),
      )
    }
  }, [t])

  useFocusEffect(
    useCallback(() => {
      void loadConfig()
      return () => stopPreview(false)
    }, [loadConfig, stopPreview]),
  )

  const selectedProfile =
    config?.defaultEngine.kind === "provider"
      ? config.profiles.find(
          (profile) => profile.id === config.defaultEngine.profileId,
        )
      : undefined
  const selectedEngineKey = config ? engineKey(config) : "system"
  const [qwenVoices, setQwenVoices] = useState<{
    profileId: string
    voices: TtsVoice[]
  } | null>(null)
  const qwenProfileId =
    selectedProfile?.kind === "qwen" ? selectedProfile.id : undefined
  const qwenRevision = selectedProfile?.revision
  useEffect(() => {
    if (!qwenProfileId) return
    setQwenVoices(null)
    let active = true
    void listTtsVoices(qwenProfileId)
      .then((voices) => {
        if (active) setQwenVoices({ profileId: qwenProfileId, voices })
      })
      .catch(() => {
        if (active) setQwenVoices(null)
      })
    return () => {
      active = false
    }
  }, [qwenProfileId, qwenRevision])
  const selectedEngineLabel =
    selectedProfile?.name ?? t("settings.tts.systemEngine")
  const selectedVoice = config?.voices.find((voice) => {
    if (voice.language.toLowerCase() !== DEFAULT_VOICE_LANGUAGE) return false
    if (config.defaultEngine.kind === "system") return voice.engine === "system"
    return (
      voice.engine === "provider" &&
      voice.profileId === config.defaultEngine.profileId
    )
  })
  const selectedVoiceId =
    selectedVoice?.voiceId ?? selectedProfile?.defaultVoice
  const availableVoices = useMemo(
    () =>
      selectedProfile
        ? qwenVoices?.profileId === selectedProfile.id
          ? qwenVoices.voices
          : selectedProfile.voices.map((id) => ({
              id,
              name: id,
              language: "mul",
            }))
        : voices,
    [selectedProfile, voices, qwenVoices],
  )
  const selectedVoiceLabel = voiceLabel(
    availableVoices,
    selectedVoiceId,
    t("settings.tts.automaticVoice"),
  )

  const engineActions = useMemo<MenuAction[]>(() => {
    if (!config) return []
    return [
      {
        id: "engine:system",
        title: `${selectedEngineKey === "system" ? "✓ " : ""}${t("settings.tts.systemEngine")}`,
      },
      ...config.profiles
        .filter((profile) => profile.enabled)
        .map((profile) => ({
          id: `engine:provider:${profile.id}`,
          title: `${selectedEngineKey === `provider:${profile.id}` ? "✓ " : ""}${profile.name}`,
        })),
    ]
  }, [config, selectedEngineKey, t])

  const voiceActions = useMemo<MenuAction[]>(() => {
    const actions = availableVoices.map((voice) => ({
      id: `voice:${encodeURIComponent(voice.id)}`,
      title: `${voice.id === selectedVoiceId ? "✓ " : ""}${voice.name}${
        voice.language
          ? ` · ${formatTtsLanguageName(voice.language, previewLanguage)}`
          : ""
      }`,
    }))
    if (selectedProfile) return actions
    return [
      {
        id: "voice:automatic",
        title: `${selectedVoiceId ? "" : "✓ "}${t("settings.tts.automaticVoice")}`,
      },
      ...actions,
    ]
  }, [availableVoices, previewLanguage, selectedProfile, selectedVoiceId, t])

  const refreshVoices = useCallback(async () => {
    if (!config) return
    setVoicesLoading(true)
    try {
      setVoices(await readiumTts.getSystemVoices())
    } catch (error) {
      setVoices([])
      showAlertWithStatusBarRestore(
        t("settings.tts.voiceLoadFailed"),
        describeError(error),
      )
    } finally {
      setVoicesLoading(false)
    }
  }, [config, t])

  useEffect(() => {
    if (
      config?.defaultEngine.kind !== "system" ||
      voices.length > 0 ||
      voicesLoading ||
      systemVoicesLoadedRef.current
    ) {
      return
    }
    systemVoicesLoadedRef.current = true
    void refreshVoices()
  }, [config?.defaultEngine.kind, refreshVoices, voices.length, voicesLoading])

  useEffect(() => {
    if (
      (previewState === "loading" || previewState === "playing") &&
      previewStatus.error
    ) {
      const error = previewStatus.error
      const timeout = setTimeout(() => {
        setPreviewSource(null)
        setPreviewState("idle")
        showAlertWithStatusBarRestore(t("settings.tts.previewFailed"), error)
      }, 0)
      return () => clearTimeout(timeout)
    }
    if (previewState === "loading" && previewSource && previewStatus.isLoaded) {
      const timeout = setTimeout(() => {
        try {
          previewPlayer.setPlaybackRate(previewRateRef.current)
          previewPlayer.play()
          setPreviewState("playing")
        } catch (error) {
          setPreviewSource(null)
          setPreviewState("idle")
          showAlertWithStatusBarRestore(
            t("settings.tts.previewFailed"),
            describeError(error),
          )
        }
      }, 0)
      return () => clearTimeout(timeout)
    }
    if (previewState === "playing" && previewStatus.didJustFinish) {
      const timeout = setTimeout(() => {
        setPreviewSource(null)
        setPreviewState("idle")
      }, 0)
      return () => clearTimeout(timeout)
    }
  }, [
    previewPlayer,
    previewSource,
    previewState,
    previewStatus.didJustFinish,
    previewStatus.error,
    previewStatus.isLoaded,
    t,
  ])

  const applyEngine = useCallback(
    async (key: string) => {
      if (!config || key === selectedEngineKey) return
      stopPreview()
      setVoices([])
      if (key === "system") systemVoicesLoadedRef.current = false
      try {
        const next = key.startsWith("provider:")
          ? await setTtsDefaultEngine({
              kind: "provider",
              profileId: key.slice("provider:".length),
            })
          : await setTtsDefaultEngine({ kind: "system" })
        setConfig(next)
      } catch (error) {
        showAlertWithStatusBarRestore(
          t("settings.tts.saveFailed"),
          describeError(error),
        )
      }
    },
    [config, selectedEngineKey, stopPreview, t],
  )

  const handleEngineAction = useCallback(
    (event: { nativeEvent: { event: string } }) => {
      const key = event.nativeEvent.event.replace("engine:", "")
      void applyEngine(key)
    },
    [applyEngine],
  )

  const handleVoiceAction = useCallback(
    async (event: { nativeEvent: { event: string } }) => {
      if (!config) return
      const voiceId = decodeURIComponent(
        event.nativeEvent.event.replace("voice:", ""),
      )
      stopPreview()
      try {
        setConfig(
          await setTtsVoice(
            DEFAULT_VOICE_LANGUAGE,
            voiceId === "automatic"
              ? undefined
              : {
                  language: DEFAULT_VOICE_LANGUAGE,
                  engine: config.defaultEngine.kind,
                  profileId: config.defaultEngine.profileId,
                  voiceId,
                },
          ),
        )
      } catch (error) {
        showAlertWithStatusBarRestore(
          t("settings.tts.saveFailed"),
          describeError(error),
        )
      }
    },
    [config, stopPreview, t],
  )

  const preview = useCallback(async () => {
    if (!config) return
    stopPreview()
    const generation = previewGenerationRef.current
    const previewText = t("settings.tts.previewText")

    if (config.defaultEngine.kind === "system") {
      const voice = availableVoices.find(
        (candidate) => candidate.id === selectedVoiceId,
      )
      setPreviewState("playing")
      Speech.speak(previewText, {
        language: voice?.language || previewLanguage,
        voice: selectedVoiceId,
        rate: config.playback.speed,
        pitch: config.playback.pitch,
        onDone: () => {
          if (previewGenerationRef.current === generation) {
            setPreviewState("idle")
          }
        },
        onStopped: () => {
          if (previewGenerationRef.current === generation) {
            setPreviewState("idle")
          }
        },
        onError: (error) => {
          if (previewGenerationRef.current !== generation) return
          setPreviewState("idle")
          showAlertWithStatusBarRestore(
            t("settings.tts.previewFailed"),
            describeError(error),
          )
        },
      })
      return
    }

    if (!selectedProfile || !selectedVoiceId) return
    const controller = new AbortController()
    previewAbortRef.current = controller
    setPreviewState("generating")
    try {
      const artifact = await synthesizeTts(
        {
          profileId: selectedProfile.id,
          text: previewText,
          language: previewLanguage,
          voiceId: selectedVoiceId,
          speed: Math.min(
            config.playback.speed,
            ttsMaximumPlaybackSpeed(selectedProfile),
          ),
          acceptedMimeTypes: PREVIEW_MIME_TYPES,
          cachePolicy: "bypass",
        },
        { signal: controller.signal },
      )
      if (
        controller.signal.aborted ||
        previewGenerationRef.current !== generation
      ) {
        return
      }
      previewAbortRef.current = null
      previewRateRef.current = artifact.playbackRate ?? 1
      setPreviewSource(toFileUri(artifact.path))
      setPreviewState("loading")
    } catch (error) {
      if (
        controller.signal.aborted ||
        previewGenerationRef.current !== generation
      ) {
        return
      }
      previewAbortRef.current = null
      setPreviewState("idle")
      showAlertWithStatusBarRestore(
        t("settings.tts.previewFailed"),
        describeError(error),
      )
    }
  }, [
    availableVoices,
    config,
    previewLanguage,
    selectedProfile,
    selectedVoiceId,
    stopPreview,
    t,
  ])

  const updatePlaybackLocally = useCallback((patch: Partial<TtsPlayback>) => {
    setConfig((current) =>
      current
        ? { ...current, playback: { ...current.playback, ...patch } }
        : current,
    )
  }, [])

  const persistPlayback = useCallback(
    async (patch: Partial<TtsPlayback>) => {
      if (!config) return
      try {
        setConfig(await setTtsPlayback({ ...config.playback, ...patch }))
      } catch (error) {
        showAlertWithStatusBarRestore(
          t("settings.tts.saveFailed"),
          describeError(error),
        )
        void loadConfig()
      }
    },
    [config, loadConfig, t],
  )

  if (!config) {
    return (
      <Screen scrollEnabled={false}>
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator color={palette.primary} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen>
      <TtsPreviewControls
        previewState={previewState}
        preview={preview}
        stopPreview={stopPreview}
      />

      <View className="gap-3">
        <SectionLabel>{t("settings.tts.engineSection")}</SectionLabel>
        <SectionCard>
          <ListMenuRow
            actions={engineActions}
            isAnchoredToRight
            title={t("settings.tts.engine")}
            value={selectedEngineLabel}
            onPressAction={handleEngineAction}
          />
          {voiceActions.length > 0 ? (
            <ListMenuRow
              actions={voiceActions}
              isAnchoredToRight
              title={t("settings.tts.voice")}
              value={selectedVoiceLabel}
              isLast
              onPressAction={(event) => void handleVoiceAction(event)}
            />
          ) : (
            <ListRow
              title={t("settings.tts.voice")}
              value={selectedVoiceLabel}
              isLast
            />
          )}
        </SectionCard>
      </View>

      <View className="gap-3">
        <SectionLabel>{t("settings.tts.playbackSection")}</SectionLabel>
        <SectionCard>
          <PlaybackSliderRow
            title={t("settings.tts.speed")}
            value={Math.min(
              config.playback.speed,
              ttsMaximumPlaybackSpeed(selectedProfile),
            )}
            minimumValue={0.5}
            maximumValue={ttsMaximumPlaybackSpeed(selectedProfile)}
            step={0.1}
            suffix="×"
            onValueChange={(speed) => updatePlaybackLocally({ speed })}
            onSlidingComplete={(speed) => void persistPlayback({ speed })}
          />
          <PlaybackSliderRow
            title={t("settings.tts.pitch")}
            value={config.playback.pitch}
            minimumValue={0.5}
            maximumValue={2}
            step={0.1}
            isLast
            onValueChange={(pitch) => updatePlaybackLocally({ pitch })}
            onSlidingComplete={(pitch) => void persistPlayback({ pitch })}
          />
        </SectionCard>
        <Text className="px-1 text-xs" style={{ color: palette.textMuted }}>
          {t("settings.tts.pitchProviderHint")}
        </Text>
      </View>

      <TtsProviderList profiles={config.profiles} />
    </Screen>
  )
}
