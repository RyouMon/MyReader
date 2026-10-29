import {
  tts as readiumTts,
  type TtsVoice as SystemTtsVoice,
} from "@my-reader/readium"
import { formatTtsLanguageName } from "@my-reader/tools/reader-tts-language"
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio"
import { useFocusEffect } from "expo-router"
import * as Speech from "expo-speech"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ActivityIndicator } from "react-native"

import {
  FormSelect,
  FormSlider,
  type ListMenuAction,
  Screen,
} from "@/src/components"
import { TtsPreviewControls } from "@/src/components/tts-preview-controls"
import { showErrorAlert } from "@/src/constants/alert-with-status-bar"
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
import { errorMessage } from "@/src/i18n/error-message"
import { View } from "@/tw"

const DEFAULT_VOICE_LANGUAGE = "und"
const PREVIEW_LANGUAGE = "en"
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

function voiceLabel(
  availableVoices: SystemTtsVoice[],
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
  const [voices, setVoices] = useState<SystemTtsVoice[]>([])
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
      showErrorAlert(t("settings.tts.loadFailed"), errorMessage(error))
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
  const selectedEngineLabel = selectedProfile
    ? `${selectedProfile.name}/${selectedProfile.model}`
    : t("settings.tts.systemEngine")
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
          ? qwenVoices.voices.map((voice) => ({ ...voice, name: voice.id }))
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

  const engineActions = useMemo<ListMenuAction[]>(() => {
    if (!config) return []
    return [
      {
        id: "engine:system",
        title: t("settings.tts.systemEngine"),
        state: selectedEngineKey === "system" ? "on" : "off",
      },
      ...config.profiles.map(
        (profile): ListMenuAction => ({
          id: `engine:provider:${profile.id}`,
          title: `${profile.name}/${profile.model}`,
          state: selectedEngineKey === `provider:${profile.id}` ? "on" : "off",
        }),
      ),
    ]
  }, [config, selectedEngineKey, t])

  const voiceActions = useMemo<ListMenuAction[]>(() => {
    const actions = availableVoices.map(
      (voice): ListMenuAction => ({
        id: `voice:${encodeURIComponent(voice.id)}`,
        state: voice.id === selectedVoiceId ? "on" : "off",
        title: `${voice.name}${
          voice.language
            ? ` · ${formatTtsLanguageName(voice.language, previewLanguage)}`
            : ""
        }`,
      }),
    )
    if (selectedProfile) return actions
    return [
      {
        id: "voice:automatic",
        title: t("settings.tts.automaticVoice"),
        state: selectedVoiceId ? "off" : "on",
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
      showErrorAlert(t("settings.tts.voiceLoadFailed"), errorMessage(error))
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
        showErrorAlert(t("settings.tts.previewFailed"), error)
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
          showErrorAlert(t("settings.tts.previewFailed"), errorMessage(error))
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
        showErrorAlert(t("settings.tts.saveFailed"), errorMessage(error))
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
        showErrorAlert(t("settings.tts.saveFailed"), errorMessage(error))
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
          showErrorAlert(t("settings.tts.previewFailed"), errorMessage(error))
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
      showErrorAlert(t("settings.tts.previewFailed"), errorMessage(error))
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

  const persistPlayback = useCallback(
    async (patch: Partial<TtsPlayback>) => {
      if (!config) return
      try {
        setConfig(await setTtsPlayback({ ...config.playback, ...patch }))
      } catch (error) {
        showErrorAlert(t("settings.tts.saveFailed"), errorMessage(error))
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
        state={previewState}
        onStart={() => void preview()}
        onStop={stopPreview}
      />
      <FormSelect
        label={t("settings.tts.engine")}
        labelMode="external"
        value={selectedEngineLabel}
        actions={engineActions}
        onSelect={(id) => handleEngineAction({ nativeEvent: { event: id } })}
      />
      <FormSelect
        label={t("settings.tts.voice")}
        labelMode="external"
        value={selectedVoiceLabel}
        actions={voiceActions}
        onSelect={(id) =>
          void handleVoiceAction({ nativeEvent: { event: id } })
        }
      />
      <FormSlider
        label={t("settings.tts.defaultSpeed")}
        value={Math.min(
          config.playback.speed,
          ttsMaximumPlaybackSpeed(selectedProfile),
        )}
        min={0.5}
        max={ttsMaximumPlaybackSpeed(selectedProfile)}
        step={0.1}
        formatValue={(value) => `${Number(value.toFixed(1))}×`}
        onChange={(speed) => void persistPlayback({ speed })}
      />
      <FormSlider
        label={t("settings.tts.defaultPitch")}
        value={config.playback.pitch}
        min={0.5}
        max={2}
        step={0.1}
        formatValue={(value) => `${Number(value.toFixed(1))}`}
        onChange={(pitch) => void persistPlayback({ pitch })}
      />
    </Screen>
  )
}
