import {
  TTS_PROVIDER_KINDS,
  ttsEndpointSuggestions,
  ttsProviderMeta,
} from "@my-reader/tools/tts-providers"
import { ttsUsageMessage } from "@my-reader/tools/tts-selection-usage"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ActivityIndicator } from "react-native"
import {
  ListRow,
  Screen,
  SectionCard,
  SectionLabel,
  SuggestionsOverlayHost,
} from "@/src/components"
import { useFormValidation } from "@/src/components/ui/use-form-validation"
import { showErrorAlert } from "@/src/constants/alert-with-status-bar"
import { useThemePalette } from "@/src/design/tokens"
import {
  detectMobileTtsRegionContext,
  newTtsDraft,
  type TtsProviderDraft,
} from "@/src/domain/tts/tts-provider-draft"
import {
  TtsRemovalContext,
  useTtsRemovalConfirmation,
} from "@/src/domain/tts/use-tts-removal-confirmation"
import { errorMessage } from "@/src/i18n/error-message"
import { useDeleteAction } from "@/src/navigation/hooks/use-delete-action"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { createSaveAction } from "@/src/navigation/toolbar-action-helpers"
import {
  getTtsChangeUsage,
  getTtsConfig,
  getTtsCredential,
  removeTtsProfile,
  saveTtsProvider,
} from "@/src/services/core/tts"
import { View } from "@/tw"
import { ProviderConnectionFields } from "./provider-connection-fields"
import { ttsFormErrors } from "./provider-validation"
import { TtsProviderModels } from "./tts-provider-models"
import type { TtsDraftUpdater } from "./tts-voices-editor"

const EMPTY_ERRORS: Record<string, string> = {}

function providerKindLabel(kind: string, t: import("i18next").TFunction) {
  if (kind === "openAiCompatible")
    return t("settings.tts.providerKinds.openAiCompatible")
  if (kind === "volcengine") return t("ttsProviders.volcengine")
  return ttsProviderMeta(kind).defaultName
}

function ProviderForm({
  draft,
  onUpdateDraft,
  validation,
}: {
  draft: TtsProviderDraft
  onUpdateDraft: TtsDraftUpdater
  validation: ReturnType<typeof useFormValidation>
}) {
  const { t } = useTranslation()
  const [credentialError, setCredentialError] = useState<string | null>(null)
  useEffect(() => {
    setCredentialError(null)
  }, [draft.id, draft.kind])
  const endpointSuggestions = useMemo(
    () =>
      ttsEndpointSuggestions(draft.kind, detectMobileTtsRegionContext()).map(
        (item) => ({
          value: item.url,
          label: item.labelKey
            ? t(item.labelKey)
            : (item.fallbackLabel ?? item.url),
        }),
      ),
    [draft.kind, t],
  )
  const credentialPlaceholder =
    draft.kind === "volcengine"
      ? t("ttsProviders.volcengineCredentialHint")
      : draft.kind === "openAiCompatible"
        ? t("settings.tts.credentialPlaceholder")
        : undefined
  const handleConnectionChange = useCallback(
    (connection: { name: string; endpoint: string; credential: string }) => {
      if (connection.credential !== draft.credential) {
        setCredentialError(null)
      }
      onUpdateDraft((prev) => ({
        ...prev,
        ...connection,
        clearCredential: !connection.credential.trim(),
      }))
    },
    [draft.credential, onUpdateDraft],
  )
  const handleCredentialRequired = useCallback(() => {
    setCredentialError(t("ttsProviders.credentialRequired"))
  }, [t])

  const connectionHeader = (
    <ProviderConnectionFields
      kind="tts"
      value={draft}
      credentialPlaceholder={credentialPlaceholder}
      credentialError={credentialError ?? undefined}
      endpointSuggestions={endpointSuggestions}
      endpointSuggestionsLabel={t("ttsProviders.endpointSuggestions")}
      validation={validation}
      onChange={handleConnectionChange}
    />
  )

  return (
    <SuggestionsOverlayHost testID="tts-suggestions-host">
      <TtsProviderModels
        header={connectionHeader}
        draft={draft}
        onUpdateDraft={onUpdateDraft}
        onCredentialRequired={handleCredentialRequired}
        validation={validation}
      />
    </SuggestionsOverlayHost>
  )
}

function ProviderTypeList() {
  const { t } = useTranslation()
  return (
    <Screen>
      <View className="gap-3">
        <SectionLabel>{t("settings.tts.providerTypeSection")}</SectionLabel>
        <SectionCard>
          {TTS_PROVIDER_KINDS.map((kind, index) => (
            <ListRow
              key={kind}
              title={providerKindLabel(kind, t)}
              isLast={index === TTS_PROVIDER_KINDS.length - 1}
              onPress={() =>
                router.push({
                  pathname: "/tts-providers/form",
                  params: { kind },
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
  const { providerId, kind } = useLocalSearchParams<{
    providerId?: string
    kind?: string
  }>()
  const [draft, setDraft] = useState<TtsProviderDraft | null>(() => {
    if (providerId || !kind) return null
    return newTtsDraft(
      kind,
      kind === "volcengine" ? t("ttsProviders.volcengine") : undefined,
    )
  })
  const [loading, setLoading] = useState(Boolean(providerId))
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const confirmRemoval = useTtsRemovalConfirmation()
  const formErrors = useMemo(
    () => (draft ? ttsFormErrors(draft, t) : EMPTY_ERRORS),
    [draft, t],
  )
  const validation = useFormValidation(formErrors)
  const updateDraft = useCallback<TtsDraftUpdater>((updater) => {
    setDraft((prev) => (prev ? updater(prev) : prev))
  }, [])
  useEffect(() => {
    if (!providerId) return
    let active = true
    void Promise.all([getTtsConfig(), getTtsCredential(providerId)])
      .then(([config, credential]) => {
        if (!active) return
        const provider = config.providers.find(
          (candidate) => candidate.id === providerId,
        )
        if (!provider) throw new Error("TTS_PROFILE_NOT_FOUND")
        setDraft({
          ...provider,
          credential: credential ?? "",
          clearCredential: !credential?.trim(),
        })
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
          onUpdateDraft={updateDraft}
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
  if (draft?.kind === "openAiCompatible") return t("settings.tts.addOpenAi")
  return t("qwenTts.add", {
    name: draft ? providerKindLabel(draft.kind, t) : "",
  })
}
