import { tts as readiumTts } from "@my-reader/readium"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Linking } from "react-native"
import { Button } from "@/src/components"
import { TtsPreviewButton } from "@/src/components/tts-preview-controls"
import {
  type ReaderChromePalette,
  readerFormColors,
} from "@/src/design/reader-chrome-palette"
import { useThemePalette } from "@/src/design/tokens"
import { useTtsPreview } from "@/src/domain/tts/use-tts-preview"
import { errorMessage } from "@/src/i18n/error-message"
import type {
  BookCharacter,
  NarrationVoice,
} from "@/src/services/core/narration"
import { listTtsVoices, type MobileTtsConfig } from "@/src/services/core/tts"
import { Text, View } from "@/tw"
import { ReaderSheetFooter, ReaderSheetPage } from "./ReaderSheetPage"
import { ProviderTextField, ReaderTtsMenuRow } from "./ReaderTtsSettingsFields"

export function NarrationCharacterEditor({
  character,
  config,
  palette,
  saving,
  onSave,
  onCancel,
  readingVoice,
  language,
  error,
}: {
  character: BookCharacter
  config: MobileTtsConfig
  palette: ReaderChromePalette
  saving: boolean
  onSave: (value: BookCharacter) => void
  onCancel: () => void
  readingVoice: NarrationVoice
  language: string
  error?: string
}) {
  const { t } = useTranslation()
  const theme = useThemePalette()
  const [draft, setDraft] = useState(character)
  const [nicknames, setNicknames] = useState(character.nicknames.join(", "))
  const [previewError, setPreviewError] = useState<unknown>(null)
  const effectiveVoice = draft.voice ?? readingVoice
  const previewConfig = useMemo(
    () => ({
      ...config,
      defaultEngine:
        effectiveVoice.engine === "provider"
          ? ({ kind: "provider", profileId: effectiveVoice.profileId } as const)
          : ({ kind: "system" } as const),
    }),
    [config, effectiveVoice.engine, effectiveVoice.profileId],
  )
  const preview = useTtsPreview({
    config: previewConfig,
    language,
    text: t("settings.tts.previewText"),
    voiceId: effectiveVoice.voiceId || undefined,
    instructions: draft.instructions,
    onError: setPreviewError,
  })
  const stopPreview = preview.stop
  useEffect(() => {
    setPreviewError(null)
    return stopPreview
  }, [
    effectiveVoice.engine,
    effectiveVoice.profileId,
    effectiveVoice.voiceId,
    draft.instructions,
    stopPreview,
  ])
  const colors = readerFormColors(palette)
  const valid = Boolean(
    draft.name.trim() && (!draft.voice || draft.voice.voiceId.trim()),
  )
  return (
    <ReaderSheetPage
      footer={
        <ReaderSheetFooter palette={palette}>
          <TtsPreviewButton
            iconOnly
            state={preview.state}
            canPreview={
              !saving &&
              preview.canPreview &&
              (!draft.voice || Boolean(draft.voice.voiceId.trim()))
            }
            onStart={() => void preview.start()}
            onStop={stopPreview}
            colors={colors}
            variant="ghost"
          />
          <View className="ml-auto flex-row items-center gap-2">
            <Button
              title={t("llm.cancel")}
              variant="ghost"
              colors={{
                textColor: palette.accentText,
                underlayColor: palette.segmentActive,
              }}
              onPress={() => {
                stopPreview()
                onCancel()
              }}
            />
            <Button
              title={t("llm.save")}
              icon={{ ios: "checkmark", android: "check" }}
              disabled={!valid || saving}
              loading={saving}
              colors={{
                backgroundColor: palette.accent,
                borderColor: palette.accent,
                textColor: palette.bg,
                underlayColor: palette.segmentActive,
              }}
              onPress={() => {
                stopPreview()
                onSave({
                  ...draft,
                  nicknames: nicknames
                    .split(/[,，\n]/u)
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }}
            />
          </View>
        </ReaderSheetFooter>
      }
    >
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.danger }}>
          {error}
        </Text>
      ) : null}
      {draft.id !== "narrator" ? (
        <>
          <ProviderTextField
            required
            testID="narration-name"
            label={t("narration.name")}
            palette={palette}
            value={draft.name}
            onChangeText={(name) => setDraft({ ...draft, name })}
          />
          <ProviderTextField
            testID="narration-nicknames"
            label={t("narration.nicknames")}
            palette={palette}
            value={nicknames}
            onChangeText={setNicknames}
          />
          <ProviderTextField
            testID="narration-description"
            multiline
            label={t("narration.description")}
            palette={palette}
            value={draft.description}
            onChangeText={(description) => setDraft({ ...draft, description })}
          />
        </>
      ) : null}
      <CharacterVoiceFields
        preview={preview}
        draft={draft}
        setDraft={setDraft}
        config={config}
        palette={palette}
      />
      {draft.voice?.engine !== "system" ? (
        <ProviderTextField
          testID="narration-instructions"
          multiline
          label={t("narration.instructions")}
          palette={palette}
          value={draft.instructions}
          onChangeText={(instructions) => setDraft({ ...draft, instructions })}
        />
      ) : null}
      {draft.source ? (
        <Text
          accessibilityRole="link"
          style={{ color: palette.accentText }}
          onPress={() => void Linking.openURL(draft.source!.url)}
        >
          {draft.source.title}
        </Text>
      ) : null}

      {previewError ? (
        <Text accessibilityRole="alert" style={{ color: theme.danger }}>
          {errorMessage(previewError)}
        </Text>
      ) : null}
    </ReaderSheetPage>
  )
}

function CharacterVoiceFields({
  preview,
  draft,
  setDraft,
  config,
  palette,
}: {
  preview: ReturnType<typeof useTtsPreview>
  draft: BookCharacter
  setDraft: (value: BookCharacter) => void
  config: MobileTtsConfig
  palette: ReaderChromePalette
}) {
  const { t } = useTranslation()
  const provider =
    draft.voice?.engine === "provider" ? draft.voice.profileId : undefined
  const selectedModel = config.profiles.find(
    (profile) => profile.id === provider,
  )
  const voices = useQuery({
    queryKey: ["narration-voices", provider ?? "system"],
    queryFn: async () =>
      provider
        ? (await listTtsVoices(provider)).map((voice) => ({
            ...voice,
            name: voice.id,
          }))
        : readiumTts.getSystemVoices(),
    enabled: Boolean(draft.voice),
  })
  return (
    <>
      <ReaderTtsMenuRow
        title={t("narration.provider")}
        palette={palette}
        value={
          provider
            ? selectedModel
              ? `${selectedModel.name}/${selectedModel.model}`
              : provider
            : t(draft.voice ? "narration.system" : "narration.defaultModel")
        }
        actions={[
          {
            id: "default",
            title: t("narration.defaultModel"),
            state: !draft.voice ? "on" : "off",
          },
          {
            id: "system",
            title: t("narration.system"),
            state: draft.voice?.engine === "system" ? "on" : "off",
          },
          ...config.profiles.map((profile) => ({
            id: profile.id,
            title: `${profile.name}/${profile.model}`,
            state: profile.id === provider ? ("on" as const) : ("off" as const),
          })),
        ]}
        onSelect={(value) =>
          setDraft({
            ...draft,
            voice:
              value === "default"
                ? undefined
                : {
                    engine: value === "system" ? "system" : "provider",
                    profileId: value === "system" ? undefined : value,
                    voiceId: "",
                  },
          })
        }
      />
      {draft.voice ? (
        <ReaderTtsMenuRow
          title={t("narration.voice")}
          preview={{
            previewVoiceId: preview.previewVoiceId,
            onPreview: (id) =>
              void preview.start(
                id,
                voices.data?.find((voice) => voice.id === id)?.language,
              ),
            onStopPreview: preview.stop,
          }}
          palette={palette}
          value={
            voices.data?.find((voice) => voice.id === draft.voice?.voiceId)
              ?.name ?? draft.voice.voiceId
          }
          actions={
            voices.data?.map((voice) => ({
              id: voice.id,
              title: voice.name,
              state: voice.id === draft.voice?.voiceId ? "on" : "off",
            })) ?? []
          }
          onSelect={(voiceId) =>
            setDraft({
              ...draft,
              voice: {
                ...draft.voice!,
                voiceId,
              },
            })
          }
        />
      ) : null}
      {voices.error ? (
        <Text accessibilityRole="alert">{errorMessage(voices.error)}</Text>
      ) : null}
    </>
  )
}
