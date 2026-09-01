import {
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@expo/ui/community/bottom-sheet"
import { tts as readiumTts } from "@my-reader/readium"
import {
  filterTtsVoicesForLanguage,
  formatTtsLanguageName,
  normalizeTtsLanguage,
} from "@my-reader/tools/reader-tts-language"
import {
  type MenuAction,
  type MenuComponentRef,
  MenuView,
} from "@react-native-menu/menu"
import { useFocusEffect } from "expo-router"
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
  ActionSheetIOS,
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View as RNView,
} from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { SymbolView } from "expo-symbols"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import {
  normalizeTtsAudioFormat,
  TTS_AUDIO_FORMATS,
  type TtsAudioFormat,
} from "@/src/constants/tts"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import {
  getTtsConfig,
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
import { describeError } from "@/src/utils/common"
import { Text, View } from "@/tw"
import { useReaderTtsPreview } from "@/src/features/reader/tts/use-reader-tts-preview"
import ReaderSettingsSheetContainer from "./ReaderSettingsSheetContainer"
import type { ReaderSettingsSheetRef } from "./ReaderSettingsSheetContainer.types"
import { SegmentPicker, SliderControl } from "./SettingControls"
import { useReaderTtsSettingsNavigation } from "./use-reader-tts-settings-navigation"

type ReaderTtsSettingsSheetProps = {
  language: string
  palette: ReaderChromePalette
  onDismiss?: () => void
  onConfigChange?: (config: MobileTtsConfig) => void
}

type ProviderDraft = {
  id?: string
  kind: "openAiCompatible"
  name: string
  endpoint: string
  model: string
  responseFormat: TtsAudioFormat
  credential: string
  instructions: string
  voices: string
  defaultVoice: string
  enabled: boolean
  hasCredential: boolean
  clearCredential: boolean
}

const NOOP = () => {}
const BACK_GESTURE_EDGE_WIDTH = 28
const BACK_GESTURE_MIN_DISTANCE = 72
const BACK_GESTURE_MIN_FLING_DISTANCE = 24
const BACK_GESTURE_MIN_VELOCITY = 700
const NAVIGATION_ANIMATION_DURATION_MS = 200

function newProviderDraft(): ProviderDraft {
  return {
    kind: "openAiCompatible",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4o-mini-tts",
    responseFormat: "mp3",
    credential: "",
    instructions: "",
    voices: "",
    defaultVoice: "",
    enabled: true,
    hasCredential: false,
    clearCredential: false,
  }
}

function existingProviderDraft(
  profile: MobileTtsProviderProfile,
): ProviderDraft {
  return {
    id: profile.id,
    kind: "openAiCompatible",
    name: profile.name,
    endpoint: profile.endpoint,
    model: profile.model ?? "",
    responseFormat: normalizeTtsAudioFormat(profile.responseFormat),
    credential: "",
    instructions: profile.instructions ?? "",
    voices: profile.voices.join("\n"),
    defaultVoice: profile.defaultVoice ?? "",
    enabled: profile.enabled,
    hasCredential: profile.hasCredential,
    clearCredential: false,
  }
}

function parseVoiceIds(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((voice) => voice.trim())
        .filter(Boolean),
    ),
  ]
}

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

function ReaderTtsMenuRow({
  title,
  value,
  actions,
  palette,
  onSelect,
}: {
  title: string
  value: string
  actions: MenuAction[]
  palette: ReaderChromePalette
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const menuRef = useRef<MenuComponentRef>(null)
  const handlePress = useCallback(() => {
    if (Platform.OS === "ios") {
      const cancelIndex = actions.length
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            ...actions.map((action) => action.title),
            t("common.cancel"),
          ],
          cancelButtonIndex: cancelIndex,
        },
        (index) => {
          if (index === undefined || index === cancelIndex) return
          const action = actions[index]
          if (action?.id) onSelect(action.id)
        },
      )
      return
    }
    menuRef.current?.show()
  }, [actions, onSelect, t])

  return (
    <View style={styles.menuAnchor}>
      {Platform.OS === "android" ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <MenuView
            ref={menuRef}
            actions={actions}
            isAnchoredToRight
            onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
            style={StyleSheet.absoluteFill}
          >
            <View style={StyleSheet.absoluteFill} />
          </MenuView>
        </View>
      ) : null}
      <Pressable
        accessibilityLabel={title}
        accessibilityRole="button"
        disabled={actions.length === 0}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.menuRow,
          {
            backgroundColor: palette.segmentIdle,
            opacity: actions.length === 0 ? 0.55 : pressed ? 0.72 : 1,
          },
        ]}
      >
        <Text
          className="text-base font-semibold"
          style={{ color: palette.text }}
        >
          {title}
        </Text>
        <Text
          className="min-w-0 flex-1 text-right text-base"
          numberOfLines={1}
          style={{ color: palette.textMuted }}
        >
          {value}
        </Text>
      </Pressable>
    </View>
  )
}

function ProviderTextField({
  label,
  multiline = false,
  onChangeText,
  palette,
  placeholder,
  required = false,
  secureTextEntry = false,
  testID,
  value,
}: {
  label: string
  multiline?: boolean
  onChangeText: (value: string) => void
  palette: ReaderChromePalette
  placeholder?: string
  required?: boolean
  secureTextEntry?: boolean
  testID: string
  value: string
}) {
  return (
    <RNView style={styles.providerField}>
      <Text
        className="mb-2 text-base font-semibold"
        style={{ color: palette.textMuted }}
      >
        {label}
        {required ? " *" : ""}
      </Text>
      <BottomSheetTextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textFaint}
        secureTextEntry={secureTextEntry}
        selectionColor={palette.accentText}
        style={[
          styles.providerInput,
          multiline ? styles.providerMultilineInput : null,
          {
            backgroundColor: palette.segmentIdle,
            borderColor: palette.border,
            color: palette.text,
          },
        ]}
        testID={testID}
        value={value}
      />
    </RNView>
  )
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
      } else {
        setVoices(await readiumTts.getSystemVoices())
      }
    } catch (voiceError) {
      setVoices([])
      setError(describeError(voiceError))
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
      setError(describeError(loadError))
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
  const visibleVoices = useMemo(
    () => filterTtsVoicesForLanguage(voices, language),
    [language, voices],
  )
  const selectedVoice = visibleVoices.find(
    (voice) =>
      voice.id === (selectedMapping?.voiceId ?? selectedProfile?.defaultVoice),
  )
  const selectedVoiceId =
    selectedMapping?.voiceId ?? selectedProfile?.defaultVoice

  const handlePreviewError = useCallback(
    (previewError: unknown) => {
      showAlertWithStatusBarRestore(
        t("settings.tts.previewFailed"),
        describeError(previewError),
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
  const previewActionLabel =
    previewState === "generating" || previewState === "loading"
      ? t("settings.tts.previewGenerating")
      : previewState === "playing"
        ? t("settings.tts.previewPlaying")
        : t("settings.tts.previewAction")

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
        setError(describeError(saveError))
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
  const audioFormatActions = useMemo<MenuAction[]>(
    () =>
      TTS_AUDIO_FORMATS.map((format) => ({
        id: format,
        title: format.toUpperCase(),
        state: providerDraft?.responseFormat === format ? "on" : "off",
      })),
    [providerDraft?.responseFormat],
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
        setError(describeError(saveError))
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
        setError(describeError(saveError))
        void loadConfig()
      } finally {
        setSaving(false)
      }
    },
    [config, loadConfig, onConfigChange, saving, stopPreview],
  )

  const voiceIds = parseVoiceIds(providerDraft?.voices ?? "")
  const canSaveProvider = Boolean(
    providerDraft?.name.trim() &&
      providerDraft.endpoint.trim() &&
      providerDraft.model.trim() &&
      voiceIds.length > 0 &&
      providerDraft.defaultVoice.trim() &&
      voiceIds.includes(providerDraft.defaultVoice.trim()),
  )

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
      setProviderDraft(existingProviderDraft(profile))
      push("providerForm")
    },
    [push, stopPreview],
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
          voices: parseVoiceIds(providerDraft.voices),
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
      setError(`${t("settings.tts.saveFailed")}: ${describeError(saveError)}`)
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
                  `${t("settings.tts.removeFailed")}: ${describeError(removeError)}`,
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

  const headerTitle =
    view === "providers"
      ? t("reader.tts.manageProviders")
      : view === "providerType"
        ? t("settings.tts.addProvider")
        : view === "providerForm"
          ? providerDraft?.id
            ? t("settings.tts.editProvider")
            : t("settings.tts.addOpenAi")
          : t("reader.tts.settings")

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
        {view === "providerForm" ? (
          <Pressable
            accessibilityLabel={t("settings.tts.save")}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSaveProvider || saving }}
            disabled={!canSaveProvider || saving}
            onPress={() => void saveProvider()}
            style={({ pressed }) => [
              styles.saveButton,
              {
                opacity: !canSaveProvider || saving ? 0.38 : pressed ? 0.56 : 1,
              },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={palette.accentText} size="small" />
            ) : (
              <Text
                className="text-base font-semibold"
                style={{ color: palette.accentText }}
              >
                {t("settings.tts.save")}
              </Text>
            )}
          </Pressable>
        ) : null}
      </RNView>
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
                <>
                  {config.profiles.length > 0 ? (
                    <RNView
                      style={[
                        styles.providerList,
                        {
                          backgroundColor: palette.segmentIdle,
                          borderColor: palette.border,
                        },
                      ]}
                    >
                      {config.profiles.map((profile, index) => (
                        <Pressable
                          key={profile.id}
                          accessibilityLabel={profile.name}
                          accessibilityRole="button"
                          onPress={() => openProviderForm(profile)}
                          style={({ pressed }) => [
                            styles.providerRow,
                            index < config.profiles.length - 1
                              ? {
                                  borderBottomColor: palette.border,
                                  borderBottomWidth: StyleSheet.hairlineWidth,
                                }
                              : null,
                            { opacity: pressed ? 0.68 : 1 },
                          ]}
                        >
                          <RNView style={styles.providerCopy}>
                            <Text
                              className="text-base font-semibold"
                              style={{ color: palette.text }}
                              numberOfLines={1}
                            >
                              {profile.name}
                            </Text>
                            <Text
                              className="text-base"
                              style={{ color: palette.textMuted }}
                              numberOfLines={1}
                            >
                              {t("settings.tts.providerKinds.openAiCompatible")}{" "}
                              · {profile.endpoint}
                            </Text>
                          </RNView>
                          {!profile.enabled ? (
                            <Text
                              className="text-base"
                              style={{ color: palette.textMuted }}
                            >
                              {t("settings.tts.disabled")}
                            </Text>
                          ) : null}
                          {Platform.OS === "ios" ? (
                            <SymbolView
                              name="chevron.right"
                              size={16}
                              tintColor={palette.textMuted}
                            />
                          ) : (
                            <MaterialIcons
                              name="chevron-right"
                              size={22}
                              color={palette.textMuted}
                            />
                          )}
                        </Pressable>
                      ))}
                    </RNView>
                  ) : null}
                  <Pressable
                    accessibilityLabel={t("settings.tts.addProvider")}
                    accessibilityRole="button"
                    onPress={openProviderType}
                    style={({ pressed }) => [
                      styles.addProviderButton,
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
                      {t("settings.tts.addProvider")}
                    </Text>
                  </Pressable>
                </>
              ) : view === "providerType" ? (
                <Pressable
                  accessibilityLabel={t(
                    "settings.tts.providerKinds.openAiCompatible",
                  )}
                  accessibilityRole="button"
                  onPress={() => {
                    setError(null)
                    setProviderDraft(newProviderDraft())
                    push("providerForm")
                  }}
                  style={({ pressed }) => [
                    styles.providerTypeButton,
                    {
                      backgroundColor: palette.segmentIdle,
                      borderColor: palette.border,
                      opacity: pressed ? 0.68 : 1,
                    },
                  ]}
                >
                  <RNView style={styles.providerCopy}>
                    <Text
                      className="text-base font-semibold"
                      style={{ color: palette.text }}
                    >
                      {t("settings.tts.providerKinds.openAiCompatible")}
                    </Text>
                    <Text
                      className="mt-1 text-base"
                      style={{ color: palette.textMuted }}
                    >
                      {t("settings.tts.openAiProviderTypeDetail")}
                    </Text>
                  </RNView>
                  {Platform.OS === "ios" ? (
                    <SymbolView
                      name="chevron.right"
                      size={16}
                      tintColor={palette.textMuted}
                    />
                  ) : (
                    <MaterialIcons
                      name="chevron-right"
                      size={22}
                      color={palette.textMuted}
                    />
                  )}
                </Pressable>
              ) : view === "providerForm" && providerDraft ? (
                <>
                  <ProviderTextField
                    label={t("settings.tts.profileName")}
                    onChangeText={(name) => patchProviderDraft({ name })}
                    palette={palette}
                    placeholder="OpenAI"
                    required
                    testID="reader-tts-provider-name"
                    value={providerDraft.name}
                  />
                  <ProviderTextField
                    label={t("settings.tts.endpoint")}
                    onChangeText={(endpoint) =>
                      patchProviderDraft({ endpoint })
                    }
                    palette={palette}
                    placeholder="https://api.openai.com/v1"
                    required
                    testID="reader-tts-provider-endpoint"
                    value={providerDraft.endpoint}
                  />
                  <ProviderTextField
                    label={t("settings.tts.model")}
                    onChangeText={(model) => patchProviderDraft({ model })}
                    palette={palette}
                    placeholder="gpt-4o-mini-tts"
                    required
                    testID="reader-tts-provider-model"
                    value={providerDraft.model}
                  />
                  <ReaderTtsMenuRow
                    title={t("settings.tts.audioFormat")}
                    value={providerDraft.responseFormat.toUpperCase()}
                    actions={audioFormatActions}
                    palette={palette}
                    onSelect={(responseFormat) =>
                      patchProviderDraft({
                        responseFormat: normalizeTtsAudioFormat(responseFormat),
                      })
                    }
                  />
                  <ProviderTextField
                    label={t("settings.tts.credential")}
                    onChangeText={(credential) =>
                      patchProviderDraft({
                        credential,
                        ...(credential ? { clearCredential: false } : {}),
                      })
                    }
                    palette={palette}
                    placeholder={
                      providerDraft.hasCredential
                        ? t("settings.tts.credentialSaved")
                        : t("settings.tts.openAiCredentialPlaceholder")
                    }
                    secureTextEntry
                    testID="reader-tts-provider-credential"
                    value={providerDraft.credential}
                  />
                  <ProviderTextField
                    label={t("settings.tts.voices")}
                    multiline
                    onChangeText={(voices) => {
                      const nextVoiceIds = parseVoiceIds(voices)
                      patchProviderDraft({
                        voices,
                        defaultVoice: nextVoiceIds.includes(
                          providerDraft.defaultVoice,
                        )
                          ? providerDraft.defaultVoice
                          : (nextVoiceIds[0] ?? ""),
                      })
                    }}
                    palette={palette}
                    placeholder={t("settings.tts.voicesPlaceholder")}
                    required
                    testID="reader-tts-provider-voices"
                    value={providerDraft.voices}
                  />
                  <Text
                    className="-mt-2 mb-4 px-1 text-base"
                    style={{ color: palette.textMuted }}
                  >
                    {t("settings.tts.voicesDetail")}
                  </Text>
                  <ProviderTextField
                    label={t("settings.tts.defaultVoice")}
                    onChangeText={(defaultVoice) =>
                      patchProviderDraft({ defaultVoice })
                    }
                    palette={palette}
                    placeholder={t("settings.tts.defaultVoicePlaceholder")}
                    required
                    testID="reader-tts-provider-default-voice"
                    value={providerDraft.defaultVoice}
                  />
                  <ProviderTextField
                    label={t("settings.tts.instructions")}
                    multiline
                    onChangeText={(instructions) =>
                      patchProviderDraft({ instructions })
                    }
                    palette={palette}
                    placeholder={t("settings.tts.instructionsPlaceholder")}
                    testID="reader-tts-provider-instructions"
                    value={providerDraft.instructions}
                  />
                  <RNView
                    style={[
                      styles.providerSwitchRow,
                      { backgroundColor: palette.segmentIdle },
                    ]}
                  >
                    <Text
                      className="text-base font-semibold"
                      style={{ color: palette.text }}
                    >
                      {t("settings.tts.enabled")}
                    </Text>
                    <RNView style={styles.providerSwitchControl}>
                      <Switch
                        accessibilityLabel={t("settings.tts.enabled")}
                        ios_backgroundColor={palette.sliderTrack}
                        onValueChange={(enabled) =>
                          patchProviderDraft({ enabled })
                        }
                        thumbColor={palette.bg}
                        trackColor={{
                          false: palette.sliderTrack,
                          true: palette.accent,
                        }}
                        value={providerDraft.enabled}
                      />
                    </RNView>
                  </RNView>
                  {providerDraft.hasCredential ? (
                    <RNView
                      style={[
                        styles.providerSwitchRow,
                        { backgroundColor: palette.segmentIdle },
                      ]}
                    >
                      <Text
                        className="text-base font-semibold"
                        style={{ color: palette.text }}
                      >
                        {t("settings.tts.clearCredential")}
                      </Text>
                      <RNView style={styles.providerSwitchControl}>
                        <Switch
                          accessibilityLabel={t("settings.tts.clearCredential")}
                          ios_backgroundColor={palette.sliderTrack}
                          onValueChange={(clearCredential) =>
                            patchProviderDraft({ clearCredential })
                          }
                          thumbColor={palette.bg}
                          trackColor={{
                            false: palette.sliderTrack,
                            true: palette.accent,
                          }}
                          value={providerDraft.clearCredential}
                        />
                      </RNView>
                    </RNView>
                  ) : null}
                  {providerDraft.id ? (
                    <Pressable
                      accessibilityLabel={t("settings.tts.removeProvider")}
                      accessibilityRole="button"
                      disabled={saving}
                      onPress={removeProvider}
                      style={({ pressed }) => [
                        styles.removeProviderButton,
                        {
                          borderColor: palette.accentText,
                          opacity: saving ? 0.38 : pressed ? 0.62 : 1,
                        },
                      ]}
                    >
                      <Text
                        className="text-base font-semibold"
                        style={{ color: palette.accentText }}
                      >
                        {t("settings.tts.removeProvider")}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <>
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
                        previewState === "idle"
                          ? () => void startPreview()
                          : stopPreview
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
                      {previewState === "generating" ||
                      previewState === "loading" ? (
                        <ActivityIndicator color={palette.bg} size="small" />
                      ) : (
                        <MaterialIcons
                          name={
                            previewState === "playing" ? "stop" : "play-arrow"
                          }
                          size={20}
                          color={palette.bg}
                        />
                      )}
                      <Text
                        className="text-base font-semibold"
                        style={{ color: palette.bg }}
                      >
                        {previewActionLabel}
                      </Text>
                    </Pressable>
                  </RNView>
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
                    value={config.playback.speed}
                    onChange={(speed) => void updatePlayback({ speed })}
                    min={0.5}
                    max={3}
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
                    accessibilityLabel={t("reader.tts.manageProviders")}
                    accessibilityRole="button"
                    onPress={() => {
                      stopPreview()
                      push("providers")
                    }}
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
                      {t("reader.tts.manageProviders")}
                    </Text>
                  </Pressable>
                </>
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
  header: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 20,
    paddingBottom: 6,
    paddingTop: 8,
  },
  headerTitle: {
    minWidth: 0,
    flex: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    marginLeft: -8,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButton: {
    minWidth: 52,
    minHeight: 36,
    alignItems: "flex-end",
    justifyContent: "center",
  },
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
  menuAnchor: {
    position: "relative",
    marginBottom: 18,
  },
  menuRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 16,
    paddingHorizontal: 16,
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
  providerField: {
    marginBottom: 16,
  },
  providerInput: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
  },
  providerMultilineInput: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  providerSwitchRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderRadius: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  providerSwitchControl: {
    alignSelf: "stretch",
    justifyContent: "center",
  },
  removeProviderButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  addProviderButton: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
})
