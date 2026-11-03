import { ttsVoiceLabel } from "@my-reader/tools/tts-voice-names"
import { tts as readiumTts, type TtsVoice } from "@my-reader/readium"
import {
  filterTtsVoicesForLanguage,
  normalizeTtsLanguage,
} from "@my-reader/tools/reader-tts-language"
import type { MenuAction } from "@react-native-menu/menu"
import { router, useFocusEffect } from "expo-router"
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  View as RNView,
  StyleSheet,
} from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import { showErrorAlert } from "@/src/constants/alert-with-status-bar"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { useTtsPreview } from "@/src/domain/tts/use-tts-preview"
import { errorMessage } from "@/src/i18n/error-message"
import {
  getTtsConfig,
  listTtsVoices,
  type MobileTtsConfig,
  setTtsDefaultEngine,
  setTtsPlayback,
  setTtsVoice,
  type TtsLanguageVoice,
  type TtsPlayback,
} from "@/src/services/core/tts"
import { Text, View } from "@/tw"
import {
  BookNarrationSettings,
  type NarrationBook,
  type NarrationSubview,
} from "./BookNarrationSettings"
import ReaderSettingsSheetContainer from "./ReaderSettingsSheetContainer"
import type { ReaderSettingsSheetRef } from "./ReaderSettingsSheetContainer.types"
import {
  ReaderTtsPlaybackSettings,
  ReaderTtsSettingsHeader,
} from "./ReaderTtsSettingsViews"

type ReaderTtsSettingsSheetProps = {
  readingPlan?: import("@/src/features/reader/tts/use-reading-plan").ReadingPlanController
  book?: NarrationBook
  onNarrationChange?: () => void
  language: string
  palette: ReaderChromePalette
  onDismiss?: () => void
  onConfigChange?: (config: MobileTtsConfig) => void
}

const NOOP = () => {}
const BACK_GESTURE_EDGE_WIDTH = 28
const BACK_GESTURE_MIN_DISTANCE = 72
const BACK_GESTURE_MIN_FLING_DISTANCE = 24
const BACK_GESTURE_MIN_VELOCITY = 700

function engineKey(config: MobileTtsConfig): string {
  return config.defaultEngine.kind === "provider"
    ? `provider:${config.defaultEngine.profileId}`
    : "system"
}

function normalizedLanguage(language: string): string {
  return normalizeTtsLanguage(language) || "und"
}

function selectedVoiceMapping(
  config: MobileTtsConfig,
  language: string,
): TtsLanguageVoice | undefined {
  const candidates = config.voices.filter((voice) => {
    if (config.defaultEngine.kind === "system") return voice.engine === "system"
    return (
      voice.engine === "provider" &&
      voice.profileId === config.defaultEngine.profileId
    )
  })

  return filterTtsVoicesForLanguage(candidates, language)[0]
}

function selectedVoiceForConfig(
  config: MobileTtsConfig | null,
  language: string,
  visibleVoices: TtsVoice[],
) {
  const selectedEngineKey = config ? engineKey(config) : "system"
  const selectedProfile =
    config?.defaultEngine.kind === "provider"
      ? config.profiles.find(
          (profile) => profile.id === config.defaultEngine.profileId,
        )
      : undefined
  const selectedMapping = config
    ? selectedVoiceMapping(config, language)
    : undefined

  const selectedVoice = visibleVoices.find(
    (voice) =>
      voice.id === (selectedMapping?.voiceId ?? selectedProfile?.defaultVoice),
  )
  const selectedVoiceId =
    selectedMapping?.voiceId ?? selectedProfile?.defaultVoice
  return { selectedEngineKey, selectedProfile, selectedVoice, selectedVoiceId }
}

const ReaderTtsSettingsSheet = forwardRef<
  ReaderSettingsSheetRef,
  ReaderTtsSettingsSheetProps
>(function ReaderTtsSettingsSheet(
  {
    language,
    palette,
    onDismiss = NOOP,
    onConfigChange,
    book,
    onNarrationChange,
    readingPlan,
  },
  ref,
) {
  const { t, i18n } = useTranslation()
  const interfaceLanguage = i18n?.resolvedLanguage || i18n?.language || "en"
  const [config, setConfig] = useState<MobileTtsConfig | null>(null)
  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [loading, setLoading] = useState(true)
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [presented, setPresented] = useState(false)
  const [narrationView, setNarrationView] = useState<NarrationSubview | null>(
    null,
  )
  const [headerAction, setHeaderAction] = useState<ReactNode>(null)
  const containerRef = useRef<ReaderSettingsSheetRef>(null)
  const openProvidersOnDismiss = useRef(false)
  const canGoBack = Boolean(narrationView)

  const loadVoiceOptions = useCallback(async (nextConfig: MobileTtsConfig) => {
    setVoices([])
    setVoicesLoading(true)
    setError(null)
    try {
      if (nextConfig.defaultEngine.kind === "provider") {
        const profile = nextConfig.profiles.find(
          (candidate) => candidate.id === nextConfig.defaultEngine.profileId,
        )
        if (!profile) throw new Error("TTS_DEFAULT_PROFILE_NOT_FOUND")
        const orderedVoiceIds = profile.defaultVoice
          ? [
              profile.defaultVoice,
              ...profile.voices.filter(
                (voice) => voice !== profile.defaultVoice,
              ),
            ]
          : profile.voices
        setVoices(
          orderedVoiceIds.map((id) => ({
            id,
            name: ttsVoiceLabel(id, profile.voiceNames),
            language: "mul",
          })),
        )
        if (profile.kind === "qwen")
          setVoices(
            (await listTtsVoices(profile.id)).map((voice) => ({
              ...voice,
              name: ttsVoiceLabel(voice.id, profile.voiceNames),
            })),
          )
      } else {
        setVoices(await readiumTts.getSystemVoices())
      }
    } catch (voiceError) {
      setVoices([])
      setError(errorMessage(voiceError))
    } finally {
      setVoicesLoading(false)
    }
  }, [])

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nextConfig = await getTtsConfig()
      setConfig(nextConfig)
      void loadVoiceOptions(nextConfig)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [loadVoiceOptions])

  useFocusEffect(
    useCallback(() => {
      void loadConfig()
    }, [loadConfig]),
  )

  useImperativeHandle(
    ref,
    () => ({
      present: () => {
        setPresented(true)
        void loadConfig()
        containerRef.current?.present()
      },
      dismiss: () => containerRef.current?.dismiss(),
    }),
    [loadConfig],
  )

  const visibleVoices = useMemo(
    () => filterTtsVoicesForLanguage(voices, language),
    [language, voices],
  )
  const { selectedEngineKey, selectedProfile, selectedVoice, selectedVoiceId } =
    selectedVoiceForConfig(config, language, visibleVoices)

  const handlePreviewError = useCallback(
    (previewError: unknown) => {
      showErrorAlert(
        t("settings.tts.previewFailed"),
        errorMessage(previewError),
      )
    },
    [t],
  )
  const {
    canPreview,
    start: startPreview,
    state: previewState,
    previewVoiceId,
    stop: stopPreview,
  } = useTtsPreview({
    config,
    language,
    onError: handlePreviewError,
    text: t("settings.tts.previewText"),
    voiceId: selectedVoiceId,
    voiceLanguage: selectedVoice?.language,
  })

  useEffect(() => {
    if (narrationView) stopPreview()
  }, [narrationView, stopPreview])

  const engineOptions = useMemo(
    () => [
      { key: "system", label: t("settings.tts.systemEngine") },
      ...(config?.profiles.map((profile) => ({
        key: `provider:${profile.id}`,
        label: `${profile.name}/${profile.model}`,
      })) ?? []),
    ],
    [config?.profiles, t],
  )

  const applyEngine = useCallback(
    async (key: string) => {
      if (!config || key === selectedEngineKey || saving) return
      stopPreview()
      setSaving(true)
      setError(null)
      try {
        const nextConfig = await setTtsDefaultEngine(
          key.startsWith("provider:")
            ? {
                kind: "provider",
                profileId: key.slice("provider:".length),
              }
            : { kind: "system" },
        )
        setConfig(nextConfig)
        onConfigChange?.(nextConfig)
        void loadVoiceOptions(nextConfig)
      } catch (saveError) {
        setError(errorMessage(saveError))
      } finally {
        setSaving(false)
      }
    },
    [
      config,
      loadVoiceOptions,
      onConfigChange,
      saving,
      selectedEngineKey,
      stopPreview,
    ],
  )

  const voiceActions = useMemo<MenuAction[]>(
    () =>
      visibleVoices.map((voice) => ({
        id: voice.id,
        title: ttsVoiceLabel(
          voice.name,
          undefined,
          voice.language,
          interfaceLanguage,
        ),
        state: voice.id === selectedVoiceId ? "on" : "off",
      })),
    [interfaceLanguage, selectedVoiceId, visibleVoices],
  )

  const selectVoice = useCallback(
    async (voiceId: string) => {
      if (!config || saving) return
      stopPreview()
      setSaving(true)
      setError(null)
      try {
        const languageKey = normalizedLanguage(language)
        const nextConfig = await setTtsVoice(languageKey, {
          language: languageKey,
          engine: config.defaultEngine.kind,
          profileId: config.defaultEngine.profileId,
          voiceId,
        })
        setConfig(nextConfig)
        onConfigChange?.(nextConfig)
      } catch (saveError) {
        setError(errorMessage(saveError))
      } finally {
        setSaving(false)
      }
    },
    [config, language, onConfigChange, saving, stopPreview],
  )

  const updatePlayback = useCallback(
    async (patch: Partial<TtsPlayback>) => {
      if (!config || saving) return
      stopPreview()
      const playback = { ...config.playback, ...patch }
      setConfig({ ...config, playback })
      setSaving(true)
      setError(null)
      try {
        const nextConfig = await setTtsPlayback(playback)
        setConfig(nextConfig)
        onConfigChange?.(nextConfig)
      } catch (saveError) {
        setError(errorMessage(saveError))
        void loadConfig()
      } finally {
        setSaving(false)
      }
    },
    [config, loadConfig, onConfigChange, saving, stopPreview],
  )

  const goBack = useCallback(() => narrationView?.onBack(), [narrationView])

  useEffect(() => {
    if (Platform.OS !== "android" || !presented || !canGoBack) return
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        goBack()
        return true
      },
    )
    return () => subscription.remove()
  }, [canGoBack, goBack, presented])

  const backGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(Platform.OS === "ios" && canGoBack)
        .hitSlop({ left: 0, width: BACK_GESTURE_EDGE_WIDTH })
        .activeOffsetX(12)
        .failOffsetX(-8)
        .failOffsetY([-16, 16])
        .onEnd(({ translationX, velocityX }) => {
          if (
            translationX >= BACK_GESTURE_MIN_DISTANCE ||
            (translationX >= BACK_GESTURE_MIN_FLING_DISTANCE &&
              velocityX >= BACK_GESTURE_MIN_VELOCITY)
          ) {
            goBack()
          }
        })
        .runOnJS(true),
    [canGoBack, goBack],
  )

  const headerTitle = narrationView?.title ?? t("reader.tts.settings")

  const handleDismiss = useCallback(() => {
    stopPreview()
    setPresented(false)
    onDismiss()
    if (openProvidersOnDismiss.current) {
      openProvidersOnDismiss.current = false
      router.push("/tts-providers")
    }
  }, [onDismiss, stopPreview])

  return (
    <ReaderSettingsSheetContainer
      ref={containerRef}
      backgroundColor={palette.sheetSurface}
      expanded
      onDismiss={handleDismiss}
    >
      <ReaderTtsSettingsHeader
        palette={palette}
        canGoBack={canGoBack}
        goBack={goBack}
        headerTitle={headerTitle}
        action={headerAction}
      />
      <RNView style={styles.sceneContainer}>
        <GestureDetector gesture={backGesture}>
          <RNView style={styles.scene}>
            {loading || !config ? (
              <View className="items-center py-12">
                <ActivityIndicator color={palette.accent} />
              </View>
            ) : (
              <BookNarrationSettings
                readingPlan={readingPlan}
                book={book}
                config={config}
                palette={palette}
                onChange={onNarrationChange}
                onSubviewChange={setNarrationView}
                onHeaderActionChange={setHeaderAction}
                readingVoice={{
                  engine: config.defaultEngine.kind,
                  profileId: config.defaultEngine.profileId,
                  voiceId: selectedVoiceId ?? "",
                }}
              >
                {error ? (
                  <Text
                    selectable
                    className="mb-4 rounded-2xl px-4 py-3 text-base"
                    style={{
                      backgroundColor: palette.segmentIdle,
                      color: palette.accentText,
                    }}
                  >
                    {error}
                  </Text>
                ) : null}

                <ReaderTtsPlaybackSettings
                  config={config}
                  palette={palette}
                  selectedProfile={selectedProfile}
                  selectedEngineKey={selectedEngineKey}
                  engineOptions={engineOptions}
                  applyEngine={applyEngine}
                  voicesLoading={voicesLoading}
                  selectedVoice={selectedVoice}
                  selectedVoiceId={selectedVoiceId}
                  voiceActions={voiceActions}
                  selectVoice={selectVoice}
                  updatePlayback={updatePlayback}
                  previewState={previewState}
                  canPreview={canPreview}
                  previewVoiceId={previewVoiceId}
                  startPreview={(id) =>
                    startPreview(
                      id,
                      visibleVoices.find(
                        (voice) => voice.id === (id ?? selectedVoiceId),
                      )?.language,
                    )
                  }
                  stopPreview={stopPreview}
                  openProviders={() => {
                    stopPreview()
                    openProvidersOnDismiss.current = true
                    containerRef.current?.dismiss()
                  }}
                />
              </BookNarrationSettings>
            )}
          </RNView>
        </GestureDetector>
      </RNView>
    </ReaderSettingsSheetContainer>
  )
})

export default ReaderTtsSettingsSheet
export type { ReaderSettingsSheetRef as ReaderTtsSettingsSheetRef }

const styles = StyleSheet.create({
  sceneContainer: {
    flex: 1,
    overflow: "hidden",
  },
  scene: {
    flex: 1,
  },
})
