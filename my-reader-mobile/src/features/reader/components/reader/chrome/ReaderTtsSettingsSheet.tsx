import { BottomSheetScrollView } from "@expo/ui/community/bottom-sheet"
import { tts as readiumTts } from "@my-reader/readium"
import { qwenTtsSourceKeys } from "@my-reader/i18n/mobile"
import {
  filterTtsVoicesForLanguage,
  formatTtsLanguageName,
  normalizeTtsLanguage,
} from "@my-reader/tools/reader-tts-language"
import type { MenuAction } from "@react-native-menu/menu"
import { useFocusEffect } from "expo-router"
import type { TFunction } from "i18next"
import {
  forwardRef,
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
  StyleSheet,
  View as RNView,
} from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import {
  showAlertWithStatusBarRestore,
  showErrorAlert,
} from "@/src/constants/alert-with-status-bar"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { useQwenTtsForm } from "@/src/domain/tts/use-qwen-tts-form"
import {
  getTtsConfig,
  getQwenTtsPresets,
  listTtsVoices,
  type MobileTtsConfig,
  type MobileTtsProviderProfile,
  removeTtsProfile,
  setTtsDefaultEngine,
  setTtsPlayback,
  setTtsVoice,
  type TtsLanguageVoice,
  type TtsPlayback,
  type TtsVoice,
  upsertTtsProfile,
} from "@/src/services/core/tts"
import { errorMessage } from "@/src/i18n/error-message"
import { Text, View } from "@/tw"
import { useReaderTtsPreview } from "@/src/features/reader/tts/use-reader-tts-preview"
import ReaderSettingsSheetContainer from "./ReaderSettingsSheetContainer"
import type { ReaderSettingsSheetRef } from "./ReaderSettingsSheetContainer.types"
import { useReaderTtsSettingsNavigation } from "./use-reader-tts-settings-navigation"
import {
  canSaveProviderDraft,
  existingProviderDraft,
  parseVoiceIds,
  type ProviderDraft,
} from "./reader-tts-provider-draft"
import { ReaderTtsProviderForm } from "./ReaderTtsProviderForm"
import {
  ReaderTtsProviderList,
  ReaderTtsProviderTypes,
  ReaderTtsPlaybackSettings,
  ReaderTtsSettingsHeader,
} from "./ReaderTtsSettingsViews"

type ReaderTtsSettingsSheetProps = {
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
const NAVIGATION_ANIMATION_DURATION_MS = 200

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

function settingsHeaderTitle(
  view: ReturnType<
    typeof useReaderTtsSettingsNavigation
  >["currentRoute"]["name"],
  draft: ProviderDraft | null,
  preset: ReturnType<typeof getQwenTtsPresets>[number] | undefined,
  t: TFunction,
): string {
  if (view === "providers") return t("reader.tts.manageProviders")
  if (view === "providerType") return t("settings.tts.addProvider")
  if (view !== "providerForm") return t("reader.tts.settings")
  if (draft?.id) return t("settings.tts.editProvider")
  if (draft?.kind !== "qwen") return t("settings.tts.addOpenAi")
  return t("qwenTts.add", {
    name: preset ? t(qwenTtsSourceKeys(preset.id).title) : "Qwen",
  })
}

const ReaderTtsSettingsSheet = forwardRef<
  ReaderSettingsSheetRef,
  ReaderTtsSettingsSheetProps
>(function ReaderTtsSettingsSheet(
  { language, palette, onDismiss = NOOP, onConfigChange },
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
  const [providerDraft, setProviderDraft] = useState<ProviderDraft | null>(null)
  const [showManualVoices, setShowManualVoices] = useState(false)
  const qwen = useQwenTtsForm(providerDraft)
  const qwenPresets = useMemo(getQwenTtsPresets, [])
  const qwenPreset =
    providerDraft?.kind === "qwen"
      ? qwenPresets.find(
          (item) =>
            item.endpoint === providerDraft.endpoint.trim().replace(/\/+$/, ""),
        )
      : undefined
  const containerRef = useRef<ReaderSettingsSheetRef>(null)
  const {
    canGoBack,
    currentRoute,
    pop,
    popTo,
    push,
    reset,
    transitionDirection,
  } = useReaderTtsSettingsNavigation()
  const view = currentRoute.name
  const sceneOpacity = useSharedValue(1)
  const sceneTranslateX = useSharedValue(0)
  const mountedRoute = useRef(currentRoute.id)

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
          orderedVoiceIds.map((id) => ({ id, name: id, language: "mul" })),
        )
        if (profile.kind === "qwen") setVoices(await listTtsVoices(profile.id))
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
        reset()
        setShowManualVoices(false)
        setProviderDraft(null)
        setPresented(true)
        void loadConfig()
        containerRef.current?.present()
      },
      dismiss: () => containerRef.current?.dismiss(),
    }),
    [loadConfig, reset],
  )

  useEffect(() => {
    if (mountedRoute.current === currentRoute.id) return
    mountedRoute.current = currentRoute.id
    const easing = Easing.bezier(0.25, 0.1, 0.25, 1)
    sceneTranslateX.value = transitionDirection === "forward" ? 28 : -28
    sceneOpacity.value = 0.72
    sceneTranslateX.value = withTiming(0, {
      duration: NAVIGATION_ANIMATION_DURATION_MS,
      easing,
    })
    sceneOpacity.value = withTiming(1, {
      duration: NAVIGATION_ANIMATION_DURATION_MS,
      easing,
    })
  }, [currentRoute.id, sceneOpacity, sceneTranslateX, transitionDirection])

  const sceneAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sceneOpacity.value,
    transform: [{ translateX: sceneTranslateX.value }],
  }))

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
    stop: stopPreview,
  } = useReaderTtsPreview({
    config,
    language,
    onError: handlePreviewError,
    text: t("settings.tts.previewText"),
    voiceId: selectedVoiceId,
    voiceLanguage: selectedVoice?.language,
  })

  const engineOptions = useMemo(
    () => [
      { key: "system", label: t("settings.tts.systemEngine") },
      ...(config?.profiles
        .filter((profile) => profile.enabled)
        .map((profile) => ({
          key: `provider:${profile.id}`,
          label: profile.name,
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
        title: `${voice.name}${
          voice.language
            ? ` · ${formatTtsLanguageName(voice.language, interfaceLanguage)}`
            : ""
        }`,
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

  const canSaveProvider = canSaveProviderDraft(providerDraft)

  const openProviderType = useCallback(() => {
    stopPreview()
    setError(null)
    setProviderDraft(null)
    push("providerType")
  }, [push, stopPreview])

  const openProviderForm = useCallback(
    (profile: MobileTtsProviderProfile) => {
      stopPreview()
      setError(null)
      setShowManualVoices(false)
      setProviderDraft(existingProviderDraft(profile))
      push("providerForm")
    },
    [push, stopPreview],
  )

  const openNewProvider = useCallback(
    (draft: ProviderDraft) => {
      setError(null)
      setShowManualVoices(false)
      setProviderDraft(draft)
      push("providerForm")
    },
    [push],
  )

  const saveProvider = useCallback(async () => {
    if (!config || !providerDraft || !canSaveProvider || saving) return
    setSaving(true)
    setError(null)
    try {
      const nextConfig = await upsertTtsProfile({
        profile: {
          id: providerDraft.id,
          name: providerDraft.name.trim(),
          kind: providerDraft.kind,
          enabled: providerDraft.enabled,
          endpoint: providerDraft.endpoint.trim(),
          model: providerDraft.model.trim(),
          responseFormat: providerDraft.responseFormat,
          instructions: providerDraft.instructions.trim() || undefined,
          voices: parseVoiceIds(
            providerDraft.voices +
              (providerDraft.kind === "qwen"
                ? `\n${providerDraft.defaultVoice}`
                : ""),
          ),
          defaultVoice: providerDraft.defaultVoice.trim(),
        },
        credential: providerDraft.credential.trim() || undefined,
        clearCredential: providerDraft.clearCredential,
      })
      const activeProfileId =
        config.defaultEngine.kind === "provider"
          ? config.defaultEngine.profileId
          : undefined
      setConfig(nextConfig)
      setProviderDraft(null)
      popTo("providers")
      void loadVoiceOptions(nextConfig)
      if (providerDraft.id === activeProfileId) onConfigChange?.(nextConfig)
    } catch (saveError) {
      setError(`${t("settings.tts.saveFailed")}: ${errorMessage(saveError)}`)
    } finally {
      setSaving(false)
    }
  }, [
    canSaveProvider,
    config,
    loadVoiceOptions,
    onConfigChange,
    popTo,
    providerDraft,
    saving,
    t,
  ])

  const removeProvider = useCallback(() => {
    if (!config || !providerDraft?.id || saving) return
    const profileId = providerDraft.id
    showAlertWithStatusBarRestore(
      t("settings.tts.removeProviderTitle"),
      t("settings.tts.removeProviderDetail", { name: providerDraft.name }),
      [
        { text: t("settings.tts.cancel"), style: "cancel" },
        {
          text: t("settings.tts.removeProvider"),
          style: "destructive",
          onPress: () => {
            setSaving(true)
            setError(null)
            void removeTtsProfile(profileId)
              .then((nextConfig) => {
                const removedActiveProfile =
                  config.defaultEngine.kind === "provider" &&
                  config.defaultEngine.profileId === profileId
                setConfig(nextConfig)
                setProviderDraft(null)
                popTo("providers")
                void loadVoiceOptions(nextConfig)
                if (removedActiveProfile) onConfigChange?.(nextConfig)
              })
              .catch((removeError) =>
                setError(
                  `${t("settings.tts.removeFailed")}: ${errorMessage(removeError)}`,
                ),
              )
              .finally(() => setSaving(false))
          },
        },
      ],
    )
  }, [
    config,
    loadVoiceOptions,
    onConfigChange,
    popTo,
    providerDraft,
    saving,
    t,
  ])

  const goBack = useCallback(() => {
    setError(null)
    setShowManualVoices(false)
    if (view === "providerForm" && providerDraft?.id) setProviderDraft(null)
    pop()
  }, [pop, providerDraft?.id, view])

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

  const patchProviderDraft = useCallback((patch: Partial<ProviderDraft>) => {
    setProviderDraft((current) =>
      current ? { ...current, ...patch } : current,
    )
  }, [])

  const headerTitle = settingsHeaderTitle(view, providerDraft, qwenPreset, t)

  const handleDismiss = useCallback(() => {
    stopPreview()
    setPresented(false)
    reset()
    setProviderDraft(null)
    onDismiss()
  }, [onDismiss, reset, stopPreview])

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
        showSave={view === "providerForm"}
        canSaveProvider={canSaveProvider}
        saving={saving}
        saveProvider={saveProvider}
      />
      <RNView style={styles.sceneContainer}>
        <GestureDetector gesture={backGesture}>
          <Animated.View style={[styles.scene, sceneAnimatedStyle]}>
            <BottomSheetScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
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
              {loading || !config ? (
                <View className="items-center py-12">
                  <ActivityIndicator color={palette.accent} />
                </View>
              ) : view === "providers" ? (
                <ReaderTtsProviderList
                  config={config}
                  palette={palette}
                  openProviderForm={openProviderForm}
                  openProviderType={openProviderType}
                />
              ) : view === "providerType" ? (
                <ReaderTtsProviderTypes
                  palette={palette}
                  qwenPresets={qwenPresets}
                  onCreate={openNewProvider}
                />
              ) : view === "providerForm" && providerDraft ? (
                <ReaderTtsProviderForm
                  providerDraft={providerDraft}
                  qwen={qwen}
                  qwenPreset={qwenPreset}
                  palette={palette}
                  saving={saving}
                  showManualVoices={showManualVoices}
                  setShowManualVoices={setShowManualVoices}
                  patchProviderDraft={patchProviderDraft}
                  removeProvider={removeProvider}
                />
              ) : (
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
                  startPreview={startPreview}
                  stopPreview={stopPreview}
                  openProviders={() => {
                    stopPreview()
                    push("providers")
                  }}
                />
              )}
            </BottomSheetScrollView>
          </Animated.View>
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
  scrollArea: {
    flexGrow: 1,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
})
