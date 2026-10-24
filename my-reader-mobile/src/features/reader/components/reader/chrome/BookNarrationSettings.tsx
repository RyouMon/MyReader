import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Linking, Switch } from "react-native"
import { tts as readiumTts } from "@my-reader/readium"
import type { Library } from "@my-reader/tools/types/library"
import { Button } from "@/src/components"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { useBookNarration } from "@/src/domain/llm/use-book-narration"
import { getLlmConfig } from "@/src/services/core/llm"
import type {
  BookCharacter,
  CharacterImportCandidate,
} from "@/src/services/core/narration"
import { listTtsVoices, type MobileTtsConfig } from "@/src/services/core/tts"
import { errorMessage } from "@/src/i18n/error-message"
import { Text, View } from "@/tw"
import { ProviderTextField, ReaderTtsMenuRow } from "./ReaderTtsSettingsFields"

export type NarrationBook = {
  library: Library
  bookId: number
  title: string
  authors: string[]
  language: string
}

export function BookNarrationSettings({
  book,
  ...props
}: {
  book?: NarrationBook
  config: MobileTtsConfig
  palette: ReaderChromePalette
  onChange?: () => void
}) {
  return book ? <BookNarrationContent book={book} {...props} /> : null
}

function BookNarrationContent({
  book,
  config,
  palette,
  onChange,
}: {
  book: NarrationBook
  config: MobileTtsConfig
  palette: ReaderChromePalette
  onChange?: () => void
}) {
  const { t } = useTranslation()
  const { query, save, importCharacters } = useBookNarration(
    book.library,
    book.bookId,
  )
  const [enableError, setEnableError] = useState<string | null>(null)
  const settings = query.data
  const error = save.error ?? importCharacters.error ?? query.error
  if (!settings)
    return error ? (
      <Text accessibilityRole="alert">{errorMessage(error)}</Text>
    ) : null
  return (
    <View className="gap-3">
      <View className="min-h-12 flex-row items-center justify-between">
        <Text style={{ color: palette.text }}>{t("narration.enabled")}</Text>
        <Switch
          accessibilityLabel={t("narration.enabled")}
          value={settings.enabled}
          disabled={save.isPending}
          onValueChange={(enabled) => {
            setEnableError(null)
            if (!enabled) {
              save.mutate({ ...settings, enabled }, { onSuccess: onChange })
              return
            }
            void getLlmConfig()
              .then((config) => {
                if (!config.defaultProfileId) {
                  setEnableError(t("narration.llmRequired"))
                  return
                }
                showAlertWithStatusBarRestore(
                  t("narration.enabled"),
                  t("narration.enableNotice"),
                  [
                    { text: t("llm.cancel"), style: "cancel" },
                    {
                      text: t("narration.enableConfirm"),
                      onPress: () =>
                        save.mutate(
                          { ...settings, enabled: true },
                          { onSuccess: onChange },
                        ),
                    },
                  ],
                )
              })
              .catch((value) => setEnableError(errorMessage(value)))
          }}
        />
      </View>
      {enableError || error ? (
        <Text accessibilityRole="alert" style={{ color: palette.text }}>
          {enableError ?? errorMessage(error)}
        </Text>
      ) : null}
      {settings.enabled ? (
        <BookCharacters
          book={book}
          config={config}
          settings={settings}
          save={save}
          importCharacters={importCharacters}
          palette={palette}
          onChange={onChange}
        />
      ) : null}
    </View>
  )
}

function BookCharacters({
  book,
  config,
  settings,
  save,
  importCharacters,
  palette,
  onChange,
}: {
  book: NarrationBook
  config: MobileTtsConfig
  settings: NonNullable<ReturnType<typeof useBookNarration>["query"]["data"]>
  save: ReturnType<typeof useBookNarration>["save"]
  importCharacters: ReturnType<typeof useBookNarration>["importCharacters"]
  palette: ReaderChromePalette
  onChange?: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<BookCharacter | null>(null)
  const [candidates, setCandidates] = useState<
    CharacterImportCandidate[] | null
  >(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const commit = (characters: BookCharacter[]) =>
    save.mutate(
      { ...settings, characters },
      {
        onSuccess: () => {
          setDraft(null)
          setCandidates(null)
          onChange?.()
        },
      },
    )
  return draft ? (
    <CharacterEditor
      character={draft}
      config={config}
      palette={palette}
      saving={save.isPending}
      onCancel={() => setDraft(null)}
      onSave={(character) =>
        commit(
          draft.id
            ? settings.characters.map((value) =>
                value.id === draft.id ? character : value,
              )
            : [...settings.characters, character],
        )
      }
      onDelete={
        draft.id && draft.id !== "narrator"
          ? () =>
              commit(
                settings.characters.filter((value) => value.id !== draft.id),
              )
          : undefined
      }
    />
  ) : candidates ? (
    <View className="gap-3">
      {candidates.map((candidate, index) => (
        <View
          key={`${candidate.source.url}:${candidate.name}`}
          className="gap-1"
        >
          <View className="flex-row items-center justify-between">
            <Text style={{ color: palette.text }}>{candidate.name}</Text>
            <Switch
              accessibilityLabel={candidate.name}
              value={selected.has(index)}
              onValueChange={(checked) =>
                setSelected((current) => {
                  const next = new Set(current)
                  if (checked) next.add(index)
                  else next.delete(index)
                  return next
                })
              }
            />
          </View>
          <Text style={{ color: palette.textMuted }}>{candidate.identity}</Text>
          <Text
            accessibilityRole="link"
            style={{ color: palette.accentText }}
            onPress={() => void Linking.openURL(candidate.source.url)}
          >
            {candidate.source.title}
          </Text>
        </View>
      ))}
      <Button
        title={t("narration.importSelected")}
        disabled={selected.size === 0 || save.isPending}
        onPress={() =>
          commit([
            ...settings.characters,
            ...candidates
              .filter((_, index) => selected.has(index))
              .filter(
                (candidate) =>
                  !settings.characters.some(
                    (character) =>
                      character.name === candidate.name ||
                      character.aliases.includes(candidate.name),
                  ),
              )
              .map((candidate) => ({
                ...candidate,
                id: "",
                voice: undefined,
                instructions: "",
              })),
          ])
        }
      />
      <Button
        title={t("llm.cancel")}
        variant="ghost"
        onPress={() => setCandidates(null)}
      />
    </View>
  ) : (
    <>
      {settings.characters.map((character) => (
        <Button
          key={character.id}
          title={
            character.id === "narrator"
              ? t("narration.narrator")
              : character.name
          }
          variant="secondary"
          onPress={() => setDraft(character)}
        />
      ))}
      <Button
        title={t("narration.add")}
        variant="outline"
        onPress={() =>
          setDraft({
            id: "",
            name: "",
            aliases: [],
            identity: "",
            voice: undefined,
            instructions: "",
            source: undefined,
          })
        }
      />
      <Button
        title={t(
          importCharacters.isPending
            ? "narration.importing"
            : "narration.import",
        )}
        variant="outline"
        disabled={importCharacters.isPending}
        onPress={() =>
          importCharacters.mutate(
            {
              bookId: book.bookId,
              title: book.title,
              authors: book.authors,
              language: book.language,
            },
            {
              onSuccess: (values) => {
                setCandidates(values)
                setSelected(new Set(values.map((_, index) => index)))
              },
            },
          )
        }
      />
    </>
  )
}

function CharacterEditor({
  character,
  config,
  palette,
  saving,
  onSave,
  onCancel,
  onDelete,
}: {
  character: BookCharacter
  config: MobileTtsConfig
  palette: ReaderChromePalette
  saving: boolean
  onSave: (value: BookCharacter) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(character)
  const [aliases, setAliases] = useState(character.aliases.join(", "))
  const valid = Boolean(
    draft.name.trim() &&
      (draft.voice?.engine !== "provider" || draft.voice.voiceId),
  )
  return (
    <View className="gap-3">
      {draft.id !== "narrator" ? (
        <>
          <ProviderTextField
            testID="narration-name"
            label={t("narration.name")}
            palette={palette}
            value={draft.name}
            onChangeText={(name) => setDraft({ ...draft, name })}
          />
          <ProviderTextField
            testID="narration-aliases"
            label={t("narration.aliases")}
            palette={palette}
            value={aliases}
            onChangeText={setAliases}
          />
          <ProviderTextField
            testID="narration-identity"
            multiline
            label={t("narration.identity")}
            palette={palette}
            value={draft.identity}
            onChangeText={(identity) => setDraft({ ...draft, identity })}
          />
        </>
      ) : null}
      <CharacterVoiceFields
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
      <Button
        title={t("llm.save")}
        disabled={!valid || saving}
        onPress={() =>
          onSave({
            ...draft,
            aliases: aliases
              .split(/[,，\n]/u)
              .map((value) => value.trim())
              .filter(Boolean),
          })
        }
      />
      <Button title={t("llm.cancel")} variant="ghost" onPress={onCancel} />
      {onDelete ? (
        <Button
          title={t("narration.delete")}
          variant="danger"
          disabled={saving}
          onPress={onDelete}
        />
      ) : null}
    </View>
  )
}

function CharacterVoiceFields({
  draft,
  setDraft,
  config,
  palette,
}: {
  draft: BookCharacter
  setDraft: (value: BookCharacter) => void
  config: MobileTtsConfig
  palette: ReaderChromePalette
}) {
  const { t } = useTranslation()
  const provider =
    draft.voice?.engine === "provider" ? draft.voice.profileId : undefined
  const voices = useQuery({
    queryKey: ["narration-voices", provider ?? "system"],
    queryFn: () =>
      provider ? listTtsVoices(provider) : readiumTts.getSystemVoices(),
    enabled: Boolean(draft.voice),
  })
  return (
    <>
      <ReaderTtsMenuRow
        title={t("narration.provider")}
        palette={palette}
        value={
          provider
            ? (config.profiles.find((profile) => profile.id === provider)
                ?.name ?? provider)
            : t(
                draft.voice?.engine === "system"
                  ? "narration.system"
                  : "narration.defaultVoice",
              )
        }
        actions={[
          { id: "default", title: t("narration.defaultVoice") },
          { id: "system", title: t("narration.system") },
          ...config.profiles
            .filter((profile) => profile.enabled)
            .map((profile) => ({ id: profile.id, title: profile.name })),
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
          palette={palette}
          value={
            (voices.data?.find((voice) => voice.id === draft.voice?.voiceId)
              ?.name ??
              draft.voice.voiceId) ||
            t("narration.defaultVoice")
          }
          actions={[
            ...(!provider
              ? [{ id: "default", title: t("narration.defaultVoice") }]
              : []),
            ...(voices.data?.map((voice) => ({
              id: voice.id,
              title: voice.name,
            })) ?? []),
          ]}
          onSelect={(voiceId) =>
            setDraft({
              ...draft,
              voice: {
                ...draft.voice!,
                voiceId: voiceId === "default" ? "" : voiceId,
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
