import { isTtsCredentialRequiredError } from "@my-reader/tools/tts-providers"
import {
  ttsVoiceNameKey,
  updateTtsVoiceNames,
} from "@my-reader/tools/tts-voice-names"
import { memo, useCallback, useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import {
  Button,
  FormInputRow,
  IconButton,
  SectionLabel,
} from "@/src/components"
import { useThemePalette } from "@/src/design/tokens"
import {
  previewInput,
  type TtsProviderDraft,
  updateVoices,
  usesModelVoices,
} from "@/src/domain/tts/tts-provider-draft"
import { useTtsRemoval } from "@/src/domain/tts/use-tts-removal-confirmation"
import { useTtsVoicePreview } from "@/src/domain/tts/use-tts-voice-preview"
import { appErrorKind } from "@/src/errors/kind"
import type { MobileTtsModel } from "@/src/services/core/tts"
import { Text, View } from "@/tw"
import { ProviderTextField } from "./provider-text-field"

const PLAY_ICON = { ios: "play", android: "play-arrow" } as const
const STOP_ICON = { ios: "stop", android: "stop" } as const
const TRASH_ICON = { ios: "trash", android: "delete-outline" } as const
const FETCH_ICON = { ios: "arrow.clockwise", android: "refresh" } as const
const ADD_ICON = { ios: "plus", android: "add" } as const

export type TtsDraftUpdater = (
  updater: (current: TtsProviderDraft) => TtsProviderDraft,
) => void

export function useTtsVoicesController({
  draft,
  activeModel,
  onUpdateDraft,
  onCredentialRequired,
  onAfterAddVoice,
}: {
  draft: TtsProviderDraft
  activeModel?: MobileTtsModel
  onUpdateDraft: TtsDraftUpdater
  onCredentialRequired?: () => void
  onAfterAddVoice?: (nextIndex: number) => void
}) {
  const { t } = useTranslation()
  const confirmRemoval = useTtsRemoval()

  // Track only connection and active model fields so preview identity stays O(1)
  // regardless of how many voices are loaded in the draft.
  const previewIdentity = useMemo(
    () =>
      JSON.stringify([
        draft.id,
        draft.kind,
        draft.endpoint,
        draft.credential,
        draft.clearCredential,
        activeModel?.id ?? "",
        activeModel?.model ?? "",
        activeModel?.responseFormat ?? "",
        activeModel?.instructions ?? "",
      ]),
    [
      activeModel?.id,
      activeModel?.instructions,
      activeModel?.model,
      activeModel?.responseFormat,
      draft.clearCredential,
      draft.credential,
      draft.endpoint,
      draft.id,
      draft.kind,
    ],
  )

  const latestRef = useRef({
    draft,
    activeModel,
    onCredentialRequired,
    onAfterAddVoice,
    previewActive: null as number | null,
    stopPreview: () => {},
    playPreview: async (
      _index: number,
      _input: ReturnType<typeof previewInput>,
      _text: string,
      _voiceId: string,
    ) => {},
  })

  const handlePreviewError = useCallback((cause: unknown) => {
    const current = latestRef.current
    if (
      !isTtsCredentialRequiredError(cause, current.draft, appErrorKind(cause))
    )
      return false
    current.onCredentialRequired?.()
    return true
  }, [])

  const preview = useTtsVoicePreview(previewIdentity, handlePreviewError)

  useEffect(() => {
    latestRef.current = {
      draft,
      activeModel,
      onCredentialRequired,
      onAfterAddVoice,
      previewActive: preview.active,
      stopPreview: preview.stop,
      playPreview: preview.play,
    }
  }, [
    activeModel,
    draft,
    onAfterAddVoice,
    onCredentialRequired,
    preview.active,
    preview.play,
    preview.stop,
  ])

  const onVoiceIdChange = useCallback(
    (index: number, id: string) => {
      if (latestRef.current.previewActive === index) {
        latestRef.current.stopPreview()
      }
      const targetModelId = latestRef.current.activeModel?.id
      onUpdateDraft((prev) => {
        const scoped = usesModelVoices(prev)
        const target = scoped
          ? prev.models.find((item) => item.id === targetModelId)
          : undefined
        const voices = scoped ? (target?.voices ?? []) : prev.voices
        const names = (scoped ? target?.voiceNames : prev.voiceNames) ?? {}
        const next = [...voices]
        next[index] = id
        return updateVoices(
          prev,
          target?.id,
          next,
          updateTtsVoiceNames(voices, next, names),
        )
      })
    },
    [onUpdateDraft],
  )

  const onVoiceNameChange = useCallback(
    (index: number, voice: string, name: string) => {
      const targetModelId = latestRef.current.activeModel?.id
      onUpdateDraft((prev) => {
        const scoped = usesModelVoices(prev)
        const target = scoped
          ? prev.models.find((item) => item.id === targetModelId)
          : undefined
        const voices = scoped ? (target?.voices ?? []) : prev.voices
        const names = (scoped ? target?.voiceNames : prev.voiceNames) ?? {}
        return updateVoices(prev, target?.id, voices, {
          ...names,
          [ttsVoiceNameKey(voice, index)]: name,
        })
      })
    },
    [onUpdateDraft],
  )

  const onAddVoice = useCallback(() => {
    const current = latestRef.current
    const scoped = usesModelVoices(current.draft)
    const targetModelId = current.activeModel?.id
    const currentVoices = scoped
      ? (current.activeModel?.voices ?? [])
      : current.draft.voices
    const nextIndex = currentVoices.length

    onUpdateDraft((prev) => {
      const prevScoped = usesModelVoices(prev)
      const target = prevScoped
        ? prev.models.find((item) => item.id === targetModelId)
        : undefined
      const voices = prevScoped ? (target?.voices ?? []) : prev.voices
      const names = (prevScoped ? target?.voiceNames : prev.voiceNames) ?? {}
      return updateVoices(prev, target?.id, [...voices, ""], names)
    })
    current.onAfterAddVoice?.(nextIndex)
  }, [onUpdateDraft])

  const onRemoveVoice = useCallback(
    async (index: number) => {
      const current = latestRef.current
      const scoped = usesModelVoices(current.draft)
      const targetModelId = current.activeModel?.id
      const voices = scoped
        ? (current.activeModel?.voices ?? [])
        : current.draft.voices
      const next = voices.filter((_, i) => i !== index)
      const provider = scoped
        ? {
            ...current.draft,
            models: current.draft.models.map((item) =>
              item.id === targetModelId ? { ...item, voices: next } : item,
            ),
          }
        : { ...current.draft, voices: next }
      if (!(await confirmRemoval(provider, voices[index]))) return
      if (
        latestRef.current.previewActive !== null &&
        latestRef.current.previewActive >= index
      ) {
        latestRef.current.stopPreview()
      }
      onUpdateDraft((prev) => {
        const prevScoped = usesModelVoices(prev)
        const target = prevScoped
          ? prev.models.find((item) => item.id === targetModelId)
          : undefined
        const prevVoices = prevScoped ? (target?.voices ?? []) : prev.voices
        const prevNames =
          (prevScoped ? target?.voiceNames : prev.voiceNames) ?? {}
        const updated = prevVoices.filter((_, i) => i !== index)
        return updateVoices(
          prev,
          target?.id,
          updated,
          updateTtsVoiceNames(prevVoices, updated, prevNames, index),
        )
      })
    },
    [confirmRemoval, onUpdateDraft],
  )

  const onPreviewToggle = useCallback(
    (index: number, voice: string, active: boolean) => {
      const current = latestRef.current
      if (active) {
        current.stopPreview()
        return
      }
      void current.playPreview(
        index,
        previewInput(current.draft, current.activeModel),
        t("settings.tts.previewText"),
        voice.trim(),
      )
    },
    [t],
  )

  return {
    previewActive: preview.active,
    previewState: preview.state,
    previewError: preview.error,
    onVoiceIdChange,
    onVoiceNameChange,
    onAddVoice,
    onRemoveVoice,
    onPreviewToggle,
  }
}

export const TtsVoicesHeader = memo(function TtsVoicesHeader({
  error,
  canFetch,
  fetchingVoices,
  busy,
  indented = false,
  onFetchVoices,
  onAddVoice,
}: {
  error?: string
  canFetch: boolean
  fetchingVoices: boolean
  busy: boolean
  indented?: boolean
  onFetchVoices: () => void
  onAddVoice: () => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const content = (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-2">
        <SectionLabel>{t("providerEditor.voices")}</SectionLabel>
        <View className="flex-row items-center gap-1">
          {canFetch ? (
            <Button
              variant="ghost"
              size="sm"
              title={t("providerEditor.fetchVoices")}
              icon={FETCH_ICON}
              loading={fetchingVoices}
              disabled={busy}
              onPress={onFetchVoices}
            />
          ) : null}
          <Button
            title={t("providerEditor.addVoice")}
            size="sm"
            variant="ghost"
            icon={ADD_ICON}
            onPress={onAddVoice}
          />
        </View>
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          className="px-4 text-sm"
          style={{ color: palette.danger }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  )

  if (indented) {
    return (
      <View
        className="ml-4 border-l pb-3 pl-3"
        style={{ borderColor: palette.border }}
      >
        {content}
      </View>
    )
  }

  return (
    <View
      className="border-t pt-3 pb-3"
      style={{ borderColor: palette.border }}
    >
      {content}
    </View>
  )
})

export const TtsVoiceRow = memo(function TtsVoiceRow({
  index,
  voice,
  name,
  fieldKey,
  error,
  canPreview,
  previewActive,
  previewLoading,
  indented = false,
  isLastIndented = false,
  onVoiceIdChange,
  onVoiceNameChange,
  onVoiceBlur,
  onPreviewToggle,
  onRemove,
}: {
  index: number
  voice: string
  name: string
  fieldKey: string
  error?: string
  canPreview: boolean
  previewActive: boolean
  previewLoading: boolean
  indented?: boolean
  isLastIndented?: boolean
  onVoiceIdChange: (index: number, id: string) => void
  onVoiceNameChange: (index: number, voice: string, name: string) => void
  onVoiceBlur: (fieldKey: string) => void
  onPreviewToggle: (index: number, voice: string, active: boolean) => void
  onRemove: (index: number) => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const label = voice || String(index + 1)

  const handleIdChange = useCallback(
    (id: string) => onVoiceIdChange(index, id),
    [index, onVoiceIdChange],
  )
  const handleNameChange = useCallback(
    (nextName: string) => onVoiceNameChange(index, voice, nextName),
    [index, onVoiceNameChange, voice],
  )
  const handleBlur = useCallback(
    () => onVoiceBlur(fieldKey),
    [fieldKey, onVoiceBlur],
  )
  const handlePreviewPress = useCallback(
    () => onPreviewToggle(index, voice, previewActive),
    [index, onPreviewToggle, previewActive, voice],
  )
  const handleRemovePress = useCallback(
    () => void onRemove(index),
    [index, onRemove],
  )

  const row = (
    <FormInputRow
      actions={
        <>
          <IconButton
            label={`${t(previewActive ? "settings.tts.previewPlaying" : "settings.tts.previewAction")} ${label}`}
            disabled={!voice.trim() || !canPreview}
            onPress={handlePreviewPress}
            icon={previewActive ? STOP_ICON : PLAY_ICON}
            tone="primary"
            size="sm"
            loading={previewActive && previewLoading}
          />
          <IconButton
            label={`${t("providerEditor.removeVoice")} ${label}`}
            icon={TRASH_ICON}
            tone="danger"
            size="sm"
            onPress={handleRemovePress}
          />
        </>
      }
    >
      <View className="flex-row gap-2">
        <View className="min-w-0 flex-1">
          <ProviderTextField
            label={t("providerEditor.voiceId")}
            testID={`tts-voice-id-${index}`}
            required
            value={voice}
            error={error}
            onBlur={handleBlur}
            onChangeText={handleIdChange}
          />
        </View>
        <View className="min-w-0 flex-1">
          <ProviderTextField
            label={t("providerEditor.voiceName")}
            testID={`tts-voice-name-${index}`}
            value={name}
            placeholder={voice}
            floatLabel={Boolean(voice)}
            onChangeText={handleNameChange}
          />
        </View>
      </View>
    </FormInputRow>
  )

  if (indented) {
    return (
      <View className={isLastIndented ? "ml-4 pb-3" : "ml-4"}>
        <View
          className={isLastIndented ? "border-l pl-3" : "border-l pb-3 pl-3"}
          style={{ borderColor: palette.border }}
        >
          {row}
        </View>
      </View>
    )
  }

  return <View className="pb-3">{row}</View>
})

export const TtsVoicesError = memo(function TtsVoicesError({
  message,
  indented = false,
}: {
  message: string
  indented?: boolean
}) {
  const palette = useThemePalette()
  const alert = (
    <Text
      selectable
      accessibilityRole="alert"
      className="px-4 text-sm"
      style={{ color: palette.danger }}
    >
      {message}
    </Text>
  )
  if (indented) {
    return (
      <View className="ml-4 pb-3">
        <View className="border-l pl-3" style={{ borderColor: palette.border }}>
          {alert}
        </View>
      </View>
    )
  }
  return <View className="pb-3">{alert}</View>
})
