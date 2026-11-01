import { ttsUsageMessage } from "@my-reader/tools/tts-selection-usage"
import {
  TtsRemovalContext,
  useTtsRemovalConfirmation,
} from "@/src/domain/tts/use-tts-removal-confirmation"
import { qwenTtsSourceKeys } from "@my-reader/i18n/mobile"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ActivityIndicator } from "react-native"
import { ListRow, Screen, SectionCard, SectionLabel } from "@/src/components"
import { showErrorAlert } from "@/src/constants/alert-with-status-bar"
import { useThemePalette } from "@/src/design/tokens"
import {
  newTtsDraft,
  newTtsModel,
  type TtsProviderDraft,
} from "@/src/domain/tts/tts-provider-draft"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { createSaveAction } from "@/src/navigation/toolbar-action-helpers"
import {
  getTtsConfig,
  getTtsChangeUsage,
  getQwenTtsPresets,
  saveTtsProvider,
  removeTtsProfile,
} from "@/src/services/core/tts"
import { errorMessage } from "@/src/i18n/error-message"
import { View } from "@/tw"
import { ProviderConnectionFields } from "./provider-connection-fields"
import { TtsProviderModels } from "./tts-provider-models"
import { useFormValidation } from "@/src/components/ui/use-form-validation"
import { ttsFormErrors } from "./provider-validation"
import { useDeleteAction } from "@/src/navigation/hooks/use-delete-action"

function ProviderForm({
  draft,
  onChange,
  validation,
}: {
  draft: TtsProviderDraft
  onChange: (value: TtsProviderDraft) => void
  validation: ReturnType<typeof useFormValidation>
}) {
  const { t } = useTranslation()
  const preset = getQwenTtsPresets().find(
    (item) => item.endpoint === draft.endpoint.trim().replace(/\/+$/, ""),
  )
  return (
    <Screen>
      <View className="gap-3">
        <ProviderConnectionFields
          kind="tts"
          value={draft}
          validation={validation}
          credentialPlaceholder={
            preset
              ? t(qwenTtsSourceKeys(preset.id).credential)
              : t("settings.tts.openAiCredentialPlaceholder")
          }
          onChange={(connection) => onChange({ ...draft, ...connection })}
        />
        <TtsProviderModels
          draft={draft}
          onChange={onChange}
          validation={validation}
        />
      </View>
    </Screen>
  )
}

function ProviderTypeList() {
  const { t } = useTranslation()
  const presets = useMemo(getQwenTtsPresets, [])
  return (
    <Screen>
      <View className="gap-3">
        <SectionLabel>{t("settings.tts.providerTypeSection")}</SectionLabel>
        <SectionCard>
          <ListRow
            title={t("settings.tts.providerKinds.openAiCompatible")}
            onPress={() =>
              router.push({
                pathname: "/tts-providers/form",
                params: { kind: "openAiCompatible" },
              })
            }
          />
          {presets.map((preset, index) => (
            <ListRow
              key={preset.id}
              title={t(qwenTtsSourceKeys(preset.id).title)}
              detail={t(qwenTtsSourceKeys(preset.id).description)}
              isLast={index === presets.length - 1}
              onPress={() =>
                router.push({
                  pathname: "/tts-providers/form",
                  params: { kind: "qwen", sourceId: preset.id },
                })
              }
            />
          ))}
        </SectionCard>
      </View>
    </Screen>
  )
}

export default function TtsProviderProfileScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { providerId, kind, sourceId } = useLocalSearchParams<{
    providerId?: string
    kind?: string
    sourceId?: string
  }>()
  const [draft, setDraft] = useState<TtsProviderDraft | null>(() => {
    if (providerId || !kind) return null
    const preset = getQwenTtsPresets().find((item) => item.id === sourceId)
    return kind === "qwen" && preset
      ? {
          ...newTtsDraft(),
          kind: "qwen",
          name: t(qwenTtsSourceKeys(preset.id).title),
          endpoint: preset.endpoint,
          modelScopedVoices: true,
          models: [{ ...newTtsModel(), responseFormat: "wav" }],
          voices: [],
        }
      : newTtsDraft()
  })
  const [loading, setLoading] = useState(Boolean(providerId))
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const confirmRemoval = useTtsRemovalConfirmation()
  const validation = useFormValidation(draft ? ttsFormErrors(draft, t) : {})
  useEffect(() => {
    if (!providerId) return
    let active = true
    void getTtsConfig()
      .then((config) => {
        if (!active) return
        const provider = config.providers.find(
          (candidate) => candidate.id === providerId,
        )
        if (!provider) throw new Error("TTS_PROFILE_NOT_FOUND")
        setDraft({ ...provider, credential: "", clearCredential: false })
      })
      .catch((error) => {
        if (active)
          showErrorAlert(t("settings.tts.loadFailed"), errorMessage(error), [
            { text: t("common.confirm"), onPress: () => router.back() },
          ])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [providerId, t])
  const save = useCallback(async () => {
    if (!draft || saving || removing || !validation.validate()) return
    setSaving(true)
    try {
      if (!(await confirmRemoval(draft))) return
      const { credential, clearCredential, ...provider } = draft
      await saveTtsProvider({
        provider,
        credential: credential.trim() || undefined,
        clearCredential,
      })
      router.dismissTo("/tts-providers")
    } catch (error) {
      showErrorAlert(t("settings.tts.saveFailed"), errorMessage(error))
    } finally {
      setSaving(false)
    }
  }, [draft, saving, removing, t, validation, confirmRemoval])
  const deleteAction = useDeleteAction({
    name: draft?.name ?? "",
    disabled: saving || removing,
    getDeleteDescription: async () =>
      ttsUsageMessage(await getTtsChangeUsage(draft?.id ?? "", []), t),
    onDelete: () => {
      if (!draft?.id || saving || removing) return
      setRemoving(true)
      void removeTtsProfile(draft.id)
        .then(() => router.dismissTo("/tts-providers"))
        .catch((error) =>
          showErrorAlert(t("settings.tts.removeFailed"), errorMessage(error)),
        )
        .finally(() => setRemoving(false))
    },
  })
  const choosingType = !providerId && !kind
  const title = providerTitle(choosingType, providerId, draft, t)
  const { options, toolbar } = useScreenHeader({
    backTitle: t("back"),
    title,
    right: draft
      ? [
          ...(draft.id ? [deleteAction] : []),
          createSaveAction({
            label: t("settings.tts.save"),
            color: palette.primary,
            onPress: () => void save(),
            loading: saving,
            disabled: saving || removing,
          }),
        ]
      : undefined,
  })
  return (
    <TtsRemovalContext.Provider value={confirmRemoval}>
      <Stack.Screen options={options} />
      {toolbar}
      {loading ? (
        <Screen>
          <ActivityIndicator color={palette.primary} />
        </Screen>
      ) : choosingType ? (
        <ProviderTypeList />
      ) : draft ? (
        <ProviderForm
          draft={draft}
          onChange={setDraft}
          validation={validation}
        />
      ) : null}
    </TtsRemovalContext.Provider>
  )
}

function providerTitle(
  choosingType: boolean,
  providerId: string | undefined,
  draft: TtsProviderDraft | null,
  t: import("i18next").TFunction,
) {
  if (choosingType) return t("settings.tts.addProvider")
  if (providerId) return t("settings.tts.editProvider")
  if (draft?.kind === "qwen") return t("qwenTts.add", { name: draft.name })
  return t("settings.tts.addOpenAi")
}
