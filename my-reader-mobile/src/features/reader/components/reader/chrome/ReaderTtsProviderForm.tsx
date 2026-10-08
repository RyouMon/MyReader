import { qwenTtsSourceKeys } from "@my-reader/i18n/mobile"
import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { Pressable, StyleSheet, Switch, View as RNView } from "react-native"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import {
  qwenModelFields,
  type useQwenTtsForm,
} from "@/src/domain/tts/use-qwen-tts-form"
import type { getQwenTtsPresets } from "@/src/services/core/tts"
import { Text } from "@/tw"
import { ReaderTtsMenuRow, ProviderTextField } from "./ReaderTtsSettingsFields"
import { parseVoiceIds, type ProviderDraft } from "./reader-tts-provider-draft"

export function ReaderTtsProviderForm({
  providerDraft,
  qwen,
  qwenPreset,
  palette,
  saving,
  showManualVoices,
  setShowManualVoices,
  patchProviderDraft,
  removeProvider,
}: {
  providerDraft: ProviderDraft
  qwen: ReturnType<typeof useQwenTtsForm>
  qwenPreset: ReturnType<typeof getQwenTtsPresets>[number] | undefined
  palette: ReaderChromePalette
  saving: boolean
  showManualVoices: boolean
  setShowManualVoices: Dispatch<SetStateAction<boolean>>
  patchProviderDraft: (patch: Partial<ProviderDraft>) => void
  removeProvider: () => void
}) {
  const { t } = useTranslation()
  return (
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
        onChangeText={(endpoint) => patchProviderDraft({ endpoint })}
        palette={palette}
        placeholder="https://api.openai.com/v1"
        required
        testID="reader-tts-provider-endpoint"
        value={providerDraft.endpoint}
      />
      {providerDraft.kind === "qwen" ? (
        <ReaderTtsMenuRow
          title={t("settings.tts.model")}
          value={qwen.selectedModel?.name ?? providerDraft.model}
          palette={palette}
          actions={qwen.models.map((model) => ({
            id: model.id,
            title: model.name,
            state: providerDraft.model === model.id ? "on" : "off",
          }))}
          onSelect={(id) => {
            const model = qwen.models.find((model) => model.id === id)
            if (model) {
              setShowManualVoices(false)
              patchProviderDraft(qwenModelFields(model))
            }
          }}
        />
      ) : (
        <ProviderTextField
          label={t("settings.tts.model")}
          onChangeText={(model) => patchProviderDraft({ model })}
          palette={palette}
          placeholder="gpt-4o-mini-tts"
          required
          testID="reader-tts-provider-model"
          value={providerDraft.model}
        />
      )}
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
            : providerDraft.kind === "qwen"
              ? t(qwenTtsSourceKeys(qwenPreset?.id ?? "").credential)
              : t("settings.tts.openAiCredentialPlaceholder")
        }
        secureTextEntry
        testID="reader-tts-provider-credential"
        value={providerDraft.credential}
      />
      <ReaderTtsProviderVoices
        providerDraft={providerDraft}
        qwen={qwen}
        palette={palette}
        showManualVoices={showManualVoices}
        setShowManualVoices={setShowManualVoices}
        patchProviderDraft={patchProviderDraft}
      />
      {(!qwen.selectedModel || qwen.selectedModel.supportsInstructions) && (
        <ProviderTextField
          label={t("settings.tts.instructions")}
          multiline
          onChangeText={(instructions) => patchProviderDraft({ instructions })}
          palette={palette}
          placeholder={t("settings.tts.instructionsPlaceholder")}
          testID="reader-tts-provider-instructions"
          value={providerDraft.instructions}
        />
      )}
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
            onValueChange={(enabled) => patchProviderDraft({ enabled })}
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
  )
}

function ReaderTtsProviderVoices({
  providerDraft,
  qwen,
  palette,
  showManualVoices,
  setShowManualVoices,
  patchProviderDraft,
}: {
  providerDraft: ProviderDraft
  qwen: ReturnType<typeof useQwenTtsForm>
  palette: ReaderChromePalette
  showManualVoices: boolean
  setShowManualVoices: Dispatch<SetStateAction<boolean>>
  patchProviderDraft: (patch: Partial<ProviderDraft>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      {providerDraft.kind === "qwen" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showManualVoices }}
          onPress={() => setShowManualVoices((current) => !current)}
          style={({ pressed }) => ({
            minHeight: 44,
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text className="text-base" style={{ color: palette.accentText }}>
            {t("qwenTts.manualVoicesAction")}
          </Text>
        </Pressable>
      ) : null}
      {providerDraft.kind !== "qwen" || showManualVoices ? (
        <>
          <ProviderTextField
            label={
              providerDraft.kind === "qwen"
                ? t("qwenTts.manualVoices")
                : t("settings.tts.voices")
            }
            multiline
            onChangeText={(voices) => {
              const nextVoiceIds = parseVoiceIds(voices)
              patchProviderDraft({
                voices,
                defaultVoice:
                  providerDraft.kind === "qwen" ||
                  nextVoiceIds.includes(providerDraft.defaultVoice)
                    ? providerDraft.defaultVoice
                    : (nextVoiceIds[0] ?? ""),
              })
            }}
            palette={palette}
            placeholder={t("settings.tts.voicesPlaceholder")}
            required={providerDraft.kind !== "qwen"}
            testID="reader-tts-provider-voices"
            value={
              providerDraft.kind === "qwen"
                ? qwen.manualVoices
                : providerDraft.voices
            }
          />
          <Text
            className="-mt-2 mb-4 px-1 text-base"
            style={{ color: palette.textMuted }}
          >
            {providerDraft.kind === "qwen"
              ? t("qwenTts.manualVoicesHint")
              : t("settings.tts.voicesDetail")}
          </Text>
        </>
      ) : null}
      {qwen.loading ? (
        <Text style={{ color: palette.textMuted }}>
          {t("qwenTts.loadingVoices")}
        </Text>
      ) : null}
      {qwen.error ? (
        <Text style={{ color: palette.text }}>
          {t("qwenTts.voicesFailed")} {qwen.error}
        </Text>
      ) : null}
      {providerDraft.kind === "qwen" ? (
        <ReaderTtsMenuRow
          title={t("settings.tts.defaultVoice")}
          value={
            qwen.voices.find((voice) => voice.id === providerDraft.defaultVoice)
              ?.name || t("settings.tts.defaultVoicePlaceholder")
          }
          palette={palette}
          actions={qwen.voices.map((voice) => ({
            id: voice.id,
            title: voice.name,
            state: providerDraft.defaultVoice === voice.id ? "on" : "off",
          }))}
          onSelect={(defaultVoice) => patchProviderDraft({ defaultVoice })}
        />
      ) : (
        <ProviderTextField
          label={t("settings.tts.defaultVoice")}
          onChangeText={(defaultVoice) => patchProviderDraft({ defaultVoice })}
          palette={palette}
          placeholder={t("settings.tts.defaultVoicePlaceholder")}
          required
          testID="reader-tts-provider-default-voice"
          value={providerDraft.defaultVoice}
        />
      )}
    </>
  )
}

const styles = StyleSheet.create({
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
})
