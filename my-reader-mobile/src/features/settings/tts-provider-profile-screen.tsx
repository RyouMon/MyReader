import { router, Stack, useLocalSearchParams } from "expo-router"
import { qwenTtsSourceKeys } from "@my-reader/i18n/mobile"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ActionSheetIOS,
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
} from "react-native"
import {
  MenuView,
  type MenuAction,
  type MenuComponentRef,
} from "@react-native-menu/menu"

import {
  Button,
  FormFieldSwitch,
  FormLabeledFieldRow,
  ListRow,
  Screen,
  SectionCard,
  SectionLabel,
} from "@/src/components"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import {
  normalizeTtsAudioFormat,
  TTS_AUDIO_FORMATS,
  type TtsAudioFormat,
} from "@/src/constants/tts"
import { useThemePalette } from "@/src/design/tokens"
import {
  newQwenProviderFields,
  qwenModelFields,
  useQwenTtsForm,
} from "@/src/domain/tts/use-qwen-tts-form"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { createSaveAction } from "@/src/navigation/toolbar-action-helpers"
import {
  getTtsConfig,
  getQwenTtsPresets,
  removeTtsProfile,
  upsertTtsProfile,
  type MobileTtsProviderProfile,
} from "@/src/services/core/tts"
import { describeError } from "@/src/utils/common"
import { Text, TextInput, View } from "@/tw"

type ProviderDraft = {
  id?: string
  kind: "openAiCompatible" | "qwen"
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

function newDraft(): ProviderDraft {
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

function existingDraft(profile: MobileTtsProviderProfile): ProviderDraft {
  return {
    id: profile.id,
    kind: profile.kind as ProviderDraft["kind"],
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

export function parseVoiceIds(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((voice) => voice.trim())
        .filter(Boolean),
    ),
  ]
}

function ProviderMenuField({
  onChange,
  value,
  options,
  label,
  testID,
}: {
  onChange: (value: string) => void
  value: string
  options: { id: string; name: string }[]
  label: string
  testID: string
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const menuRef = useRef<MenuComponentRef>(null)
  const actions: MenuAction[] = options.map((option) => ({
    id: option.id,
    title: option.name,
    state: option.id === value ? "on" : "off",
  }))
  const select = onChange
  const open = () => {
    if (Platform.OS !== "ios") {
      menuRef.current?.show()
      return
    }
    const cancelButtonIndex = actions.length
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...actions.map((action) => action.title), t("common.cancel")],
        cancelButtonIndex,
      },
      (buttonIndex) => {
        if (buttonIndex === undefined || buttonIndex === cancelButtonIndex)
          return
        const action = actions[buttonIndex]
        if (action?.id) select(action.id)
      },
    )
  }

  return (
    <FormLabeledFieldRow label={label}>
      <View className="relative">
        {Platform.OS === "android" ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <MenuView
              ref={menuRef}
              actions={actions}
              isAnchoredToRight
              onPressAction={({ nativeEvent }) => select(nativeEvent.event)}
              style={StyleSheet.absoluteFill}
            >
              <View style={StyleSheet.absoluteFill} />
            </MenuView>
          </View>
        ) : null}
        <Pressable
          accessibilityLabel={label}
          accessibilityRole="button"
          onPress={open}
          testID={testID}
          disabled={options.length === 0}
          style={({ pressed }) => ({
            minHeight: 40,
            alignItems: "flex-end",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text className="text-base" style={{ color: palette.text }}>
            {options.find((option) => option.id === value)?.name ||
              value ||
              t("settings.tts.defaultVoicePlaceholder")}
          </Text>
        </Pressable>
      </View>
    </FormLabeledFieldRow>
  )
}

export default function TtsProviderProfileScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { providerId } = useLocalSearchParams<{
    providerId?: string
  }>()
  const [draft, setDraft] = useState<ProviderDraft | null>(null)
  const [loading, setLoading] = useState(Boolean(providerId))
  const [saving, setSaving] = useState(false)
  const qwen = useQwenTtsForm(draft)
  const qwenPresets = useMemo(getQwenTtsPresets, [])
  const qwenPreset =
    draft?.kind === "qwen"
      ? qwenPresets.find(
          (item) => item.endpoint === draft.endpoint.trim().replace(/\/+$/, ""),
        )
      : undefined

  useEffect(() => {
    if (!providerId) return
    let active = true
    void getTtsConfig()
      .then((config) => {
        if (!active) return
        const profile = config.profiles.find(
          (candidate) => candidate.id === providerId,
        )
        if (!profile) throw new Error("TTS_PROFILE_NOT_FOUND")
        setDraft(existingDraft(profile))
      })
      .catch((error) => {
        if (!active) return
        showAlertWithStatusBarRestore(
          t("settings.tts.loadFailed"),
          describeError(error),
          [{ text: t("common.confirm"), onPress: () => router.back() }],
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [providerId, t])

  const voiceIds = parseVoiceIds(
    (draft?.voices ?? "") +
      (draft?.kind === "qwen" ? `\n${draft.defaultVoice}` : ""),
  )
  const choosingType = !providerId && !draft && !loading
  const defaultVoice = draft?.defaultVoice.trim() ?? ""
  const canSave = Boolean(
    draft?.name.trim() &&
      draft.endpoint.trim() &&
      draft.model.trim() &&
      voiceIds.length > 0 &&
      defaultVoice &&
      voiceIds.includes(defaultVoice),
  )

  const save = useCallback(async () => {
    if (!draft || !canSave) return
    setSaving(true)
    try {
      await upsertTtsProfile({
        profile: {
          id: draft.id,
          name: draft.name.trim(),
          kind: draft.kind,
          enabled: draft.enabled,
          endpoint: draft.endpoint.trim(),
          model: draft.model.trim(),
          responseFormat: draft.responseFormat,
          instructions: draft.instructions.trim() || undefined,
          voices: parseVoiceIds(
            draft.voices +
              (draft.kind === "qwen" ? `\n${draft.defaultVoice}` : ""),
          ),
          defaultVoice: draft.defaultVoice.trim(),
        },
        credential: draft.credential.trim() || undefined,
        clearCredential: draft.clearCredential,
      })
      router.back()
    } catch (error) {
      showAlertWithStatusBarRestore(
        t("settings.tts.saveFailed"),
        describeError(error),
      )
    } finally {
      setSaving(false)
    }
  }, [canSave, draft, t])

  const remove = useCallback(() => {
    const profileId = draft?.id
    if (!profileId) return
    showAlertWithStatusBarRestore(
      t("settings.tts.removeProviderTitle"),
      t("settings.tts.removeProviderDetail", { name: draft.name }),
      [
        { text: t("settings.tts.cancel"), style: "cancel" },
        {
          text: t("settings.tts.removeProvider"),
          style: "destructive",
          onPress: () => {
            setSaving(true)
            void removeTtsProfile(profileId)
              .then(() => router.back())
              .catch((error) =>
                showAlertWithStatusBarRestore(
                  t("settings.tts.removeFailed"),
                  describeError(error),
                ),
              )
              .finally(() => setSaving(false))
          },
        },
      ],
    )
  }, [draft, t])

  const { options, toolbar } = useScreenHeader({
    title: choosingType
      ? t("settings.tts.addProvider")
      : providerId
        ? t("settings.tts.editProvider")
        : draft?.kind === "qwen"
          ? t("qwenTts.add", {
              name: qwenPreset
                ? t(qwenTtsSourceKeys(qwenPreset.id).title)
                : "Qwen",
            })
          : t("settings.tts.addOpenAi"),
    back: !providerId ? "hidden" : "auto",
    left: !providerId
      ? [
          {
            label: choosingType ? t("settings.tts.cancel") : t("back"),
            onPress: choosingType ? () => router.back() : () => setDraft(null),
            iosSfSymbol: choosingType ? "xmark" : "chevron.left",
            iconOnly: true,
          },
        ]
      : undefined,
    right: draft
      ? [
          createSaveAction({
            label: t("settings.tts.save"),
            onPress: () => void save(),
            loading: saving,
            disabled: !canSave,
          }),
        ]
      : undefined,
  })

  const fields = useMemo(
    () =>
      draft
        ? ([
            {
              key: "name",
              label: t("settings.tts.profileName"),
              value: draft.name,
              placeholder: "OpenAI",
              secure: false,
              required: true,
            },
            {
              key: "endpoint",
              label: t("settings.tts.endpoint"),
              value: draft.endpoint,
              placeholder: "https://api.openai.com/v1",
              secure: false,
              required: true,
            },
            {
              key: "model",
              label: t("settings.tts.model"),
              value: draft.model,
              placeholder: "gpt-4o-mini-tts",
              secure: false,
              required: true,
            },
            {
              key: "credential",
              label: t("settings.tts.credential"),
              value: draft.credential,
              placeholder: draft.hasCredential
                ? t("settings.tts.credentialSaved")
                : draft.kind === "qwen"
                  ? t(qwenTtsSourceKeys(qwenPreset?.id ?? "").credential)
                  : t("settings.tts.openAiCredentialPlaceholder"),
              secure: true,
              required: false,
            },
          ] as const)
        : [],
    [draft, t],
  )

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      {loading ? (
        <Screen scrollEnabled={false}>
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator color={palette.primary} />
          </View>
        </Screen>
      ) : choosingType ? (
        <Screen>
          <View className="gap-3">
            <SectionLabel>{t("settings.tts.providerTypeSection")}</SectionLabel>
            <SectionCard>
              <ListRow
                title={t("settings.tts.providerKinds.openAiCompatible")}
                detail={t("settings.tts.openAiProviderTypeDetail")}
                onPress={() => setDraft(newDraft())}
              />
              {qwenPresets.map((preset, index) => (
                <ListRow
                  key={preset.id}
                  title={t(qwenTtsSourceKeys(preset.id).title)}
                  detail={t(qwenTtsSourceKeys(preset.id).description)}
                  isLast={index === qwenPresets.length - 1}
                  onPress={() =>
                    setDraft({
                      ...newDraft(),
                      ...newQwenProviderFields(
                        preset,
                        t(qwenTtsSourceKeys(preset.id).title),
                      ),
                    })
                  }
                />
              ))}
            </SectionCard>
          </View>
        </Screen>
      ) : !draft ? null : (
        <Screen>
          <View className="gap-3">
            <SectionLabel>{t("settings.tts.providerSection")}</SectionLabel>
            <SectionCard>
              <View className="gap-2 p-3">
                {fields
                  .filter(
                    (field) => draft.kind !== "qwen" || field.key !== "model",
                  )
                  .map((field) => (
                    <FormLabeledFieldRow
                      key={field.key}
                      label={field.label}
                      required={field.required}
                    >
                      <TextInput
                        testID={`tts-provider-${field.key}`}
                        value={field.value}
                        placeholder={field.placeholder}
                        placeholderTextColor={palette.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry={field.secure}
                        className="min-h-10 border-0 bg-transparent py-1 text-base"
                        style={{ color: palette.text }}
                        onChangeText={(value) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  [field.key]: value,
                                  ...(field.key === "credential" && value
                                    ? { clearCredential: false }
                                    : {}),
                                }
                              : current,
                          )
                        }
                      />
                    </FormLabeledFieldRow>
                  ))}
                {draft.kind === "qwen" ? (
                  <ProviderMenuField
                    label={t("settings.tts.model")}
                    testID="tts-provider-model"
                    value={draft.model}
                    options={qwen.models}
                    onChange={(id) => {
                      const model = qwen.models.find((model) => model.id === id)
                      if (model)
                        setDraft({ ...draft, ...qwenModelFields(model) })
                    }}
                  />
                ) : null}
                <ProviderMenuField
                  label={t("settings.tts.audioFormat")}
                  testID="tts-provider-audio-format"
                  options={(
                    qwen.selectedModel?.audioFormats ?? TTS_AUDIO_FORMATS
                  ).map((id) => ({ id, name: id.toUpperCase() }))}
                  value={draft.responseFormat}
                  onChange={(responseFormat) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            responseFormat:
                              normalizeTtsAudioFormat(responseFormat),
                          }
                        : current,
                    )
                  }
                />
                <FormLabeledFieldRow
                  label={
                    draft.kind === "qwen"
                      ? t("qwenTts.manualVoices")
                      : t("settings.tts.voices")
                  }
                  required={draft.kind !== "qwen"}
                >
                  <TextInput
                    testID="tts-provider-voices"
                    value={
                      draft.kind === "qwen" ? qwen.manualVoices : draft.voices
                    }
                    placeholder={t("settings.tts.voicesPlaceholder")}
                    placeholderTextColor={palette.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    multiline
                    className="min-h-24 border-0 bg-transparent py-2 text-base"
                    style={{ color: palette.text }}
                    onChangeText={(voices) => {
                      const nextVoiceIds = parseVoiceIds(voices)
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              voices,
                              defaultVoice:
                                current.kind === "qwen" ||
                                nextVoiceIds.includes(current.defaultVoice)
                                  ? current.defaultVoice
                                  : (nextVoiceIds[0] ?? ""),
                            }
                          : current,
                      )
                    }}
                  />
                </FormLabeledFieldRow>
                <Text
                  className="px-1 text-xs"
                  style={{ color: palette.textMuted }}
                >
                  {draft.kind === "qwen"
                    ? t(
                        qwen.selectedModel?.voiceDiscovery
                          ? "qwenTts.voiceHint"
                          : "qwenTts.builtinHint",
                      )
                    : t("settings.tts.voicesDetail")}
                </Text>
                {qwen.loading ? (
                  <Text
                    accessibilityRole="progressbar"
                    style={{ color: palette.textMuted }}
                  >
                    {t("qwenTts.loadingVoices")}
                  </Text>
                ) : null}
                {qwen.error ? (
                  <Text style={{ color: palette.danger }}>
                    {t("qwenTts.voicesFailed")} {qwen.error}
                  </Text>
                ) : null}
                {draft.kind === "qwen" ? (
                  <ProviderMenuField
                    label={t("settings.tts.defaultVoice")}
                    testID="tts-provider-default-voice"
                    value={draft.defaultVoice}
                    options={qwen.voices}
                    onChange={(defaultVoice) =>
                      setDraft({ ...draft, defaultVoice })
                    }
                  />
                ) : (
                  <FormLabeledFieldRow
                    label={t("settings.tts.defaultVoice")}
                    required
                  >
                    <TextInput
                      testID="tts-provider-default-voice"
                      value={draft.defaultVoice}
                      placeholder={t("settings.tts.defaultVoicePlaceholder")}
                      placeholderTextColor={palette.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="min-h-10 border-0 bg-transparent py-1 text-base"
                      style={{ color: palette.text }}
                      onChangeText={(defaultVoice) =>
                        setDraft((current) =>
                          current ? { ...current, defaultVoice } : current,
                        )
                      }
                    />
                  </FormLabeledFieldRow>
                )}
                {(!qwen.selectedModel ||
                  qwen.selectedModel.supportsInstructions) && (
                  <FormLabeledFieldRow label={t("settings.tts.instructions")}>
                    <TextInput
                      testID="tts-provider-instructions"
                      value={draft.instructions}
                      placeholder={t("settings.tts.instructionsPlaceholder")}
                      placeholderTextColor={palette.textMuted}
                      multiline
                      className="min-h-20 border-0 bg-transparent py-2 text-base"
                      style={{ color: palette.text }}
                      onChangeText={(instructions) =>
                        setDraft((current) =>
                          current ? { ...current, instructions } : current,
                        )
                      }
                    />
                  </FormLabeledFieldRow>
                )}
                <FormLabeledFieldRow label={t("settings.tts.enabled")}>
                  <FormFieldSwitch
                    accessibilityLabel={t("settings.tts.enabled")}
                    value={draft.enabled}
                    onValueChange={(enabled) =>
                      setDraft((current) =>
                        current ? { ...current, enabled } : current,
                      )
                    }
                  />
                </FormLabeledFieldRow>
                {draft.hasCredential ? (
                  <FormLabeledFieldRow
                    label={t("settings.tts.clearCredential")}
                  >
                    <FormFieldSwitch
                      accessibilityLabel={t("settings.tts.clearCredential")}
                      activeTrackColor={palette.danger}
                      value={draft.clearCredential}
                      onValueChange={(clearCredential) =>
                        setDraft((current) =>
                          current ? { ...current, clearCredential } : current,
                        )
                      }
                    />
                  </FormLabeledFieldRow>
                ) : null}
              </View>
            </SectionCard>
            <Text className="px-1 text-xs" style={{ color: palette.textMuted }}>
              {draft.kind === "qwen"
                ? t("qwenTts.modelHint")
                : t("settings.tts.openAiDetail")}
            </Text>
          </View>

          {draft.id ? (
            <Button
              variant="danger"
              disabled={saving}
              title={t("settings.tts.removeProvider")}
              onPress={remove}
            />
          ) : null}
        </Screen>
      )}
    </>
  )
}
