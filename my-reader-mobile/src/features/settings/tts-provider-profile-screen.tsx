import { qwenTtsSourceKeys } from "@my-reader/i18n/mobile"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ActivityIndicator } from "react-native"
import {
  Button,
  FormFieldSwitch,
  FormLabeledFieldRow,
  ListRow,
  Screen,
  SectionCard,
  SectionLabel,
} from "@/src/components"
import {
  showAlertWithStatusBarRestore,
  showErrorAlert,
} from "@/src/constants/alert-with-status-bar"
import { useThemePalette } from "@/src/design/tokens"
import {
  newTtsDraft,
  validTtsDraft,
  type TtsProviderDraft,
} from "@/src/domain/tts/tts-provider-draft"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { createSaveAction } from "@/src/navigation/toolbar-action-helpers"
import {
  getTtsConfig,
  getQwenTtsPresets,
  removeTtsProfile,
  saveTtsProvider,
} from "@/src/services/core/tts"
import { errorMessage } from "@/src/i18n/error-message"
import { View } from "@/tw"
import { ProviderTextField } from "./provider-text-field"
import { TtsProviderModels } from "./tts-provider-models"

function ProviderForm({
  draft,
  onChange,
  editing,
  saving,
  remove,
}: {
  draft: TtsProviderDraft
  onChange: (value: TtsProviderDraft) => void
  editing: boolean
  saving: boolean
  remove: () => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const preset = getQwenTtsPresets().find(
    (item) => item.endpoint === draft.endpoint.trim().replace(/\/+$/, ""),
  )
  return (
    <Screen>
      <View className="gap-3">
        {editing ? (
          <View className="gap-3">
            <ProviderTextField
              label={t("settings.tts.profileName")}
              testID="tts-provider-name"
              required
              value={draft.name}
              onChangeText={(name) => onChange({ ...draft, name })}
            />
            <ProviderTextField
              label={t("settings.tts.endpoint")}
              testID="tts-provider-endpoint"
              required
              value={draft.endpoint}
              onChangeText={(endpoint) => onChange({ ...draft, endpoint })}
            />
            <ProviderTextField
              label={t("settings.tts.credential")}
              testID="tts-provider-credential"
              value={draft.credential}
              secureTextEntry
              textContentType="none"
              placeholder={
                draft.hasCredential
                  ? t("settings.tts.credentialSaved")
                  : preset
                    ? t(qwenTtsSourceKeys(preset.id).credential)
                    : t("settings.tts.openAiCredentialPlaceholder")
              }
              onChangeText={(credential) =>
                onChange({ ...draft, credential, clearCredential: false })
              }
            />
            {draft.hasCredential ? (
              <FormLabeledFieldRow label={t("settings.tts.clearCredential")}>
                <FormFieldSwitch
                  accessibilityLabel={t("settings.tts.clearCredential")}
                  activeTrackColor={palette.danger}
                  value={draft.clearCredential}
                  onValueChange={(clearCredential) =>
                    onChange({ ...draft, clearCredential, credential: "" })
                  }
                />
              </FormLabeledFieldRow>
            ) : null}
          </View>
        ) : (
          <SectionCard>
            <ListRow
              title={t("settings.tts.endpoint")}
              detail={draft.endpoint}
            />
            <ListRow
              title={t("settings.tts.credential")}
              value={
                draft.hasCredential ? t("settings.tts.credentialSaved") : "—"
              }
              isLast
            />
          </SectionCard>
        )}
        <TtsProviderModels
          draft={draft}
          onChange={onChange}
          readOnly={!editing}
        />
        {editing && draft.id ? (
          <Button
            variant="danger"
            disabled={saving}
            title={t("settings.tts.removeProvider")}
            onPress={remove}
          />
        ) : null}
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
          models: [],
        }
      : newTtsDraft()
  })
  const [loading, setLoading] = useState(Boolean(providerId))
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(!providerId)
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
  const canSave = validTtsDraft(draft)
  const save = useCallback(async () => {
    if (!draft || !canSave || saving) return
    setSaving(true)
    try {
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
  }, [canSave, draft, saving, t])
  const remove = useCallback(() => {
    if (!draft?.id) return
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
            void removeTtsProfile(draft.id)
              .then(() => router.dismissTo("/tts-providers"))
              .catch((error) =>
                showErrorAlert(
                  t("settings.tts.removeFailed"),
                  errorMessage(error),
                ),
              )
              .finally(() => setSaving(false))
          },
        },
      ],
    )
  }, [draft, t])
  const choosingType = !providerId && !kind
  const title = providerTitle(choosingType, providerId, editing, draft, t)
  const { options, toolbar } = useScreenHeader({
    backTitle: t("back"),
    title,
    right: draft
      ? editing
        ? [
            createSaveAction({
              label: t("settings.tts.save"),
              color: palette.primary,
              onPress: () => void save(),
              loading: saving,
              disabled: !canSave,
            }),
          ]
        : [
            {
              label: t("settings.tts.editProvider"),
              onPress: () => setEditing(true),
              iosSfSymbol: "pencil",
            },
          ]
      : undefined,
  })
  return (
    <>
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
          editing={editing}
          saving={saving}
          remove={remove}
        />
      ) : null}
    </>
  )
}

function providerTitle(
  choosingType: boolean,
  providerId: string | undefined,
  editing: boolean,
  draft: TtsProviderDraft | null,
  t: import("i18next").TFunction,
) {
  if (choosingType) return t("settings.tts.addProvider")
  if (providerId) return editing ? t("settings.tts.editProvider") : draft?.name
  if (draft?.kind === "qwen") return t("qwenTts.add", { name: draft.name })
  return t("settings.tts.addOpenAi")
}
