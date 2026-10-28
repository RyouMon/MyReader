import { FormSelect, FormSelectItem } from "@/components/common/FormSelect"
import { FormTextField } from "@/components/common/FormTextField"
import { FormScrollArea } from "@/components/common/FormScrollArea"
import { FormSlider } from "@/components/common/FormSlider"
import {
  TtsProviderModels,
  TtsTestModelSelect,
} from "@/components/settings/TtsProviderModels"
import {
  newTtsModel,
  modelVoices as usesModelVoices,
  type TtsProviderDraft,
} from "@/lib/tts-provider-draft"
import { FieldGroup } from "@/components/ui/field"
import { formatTtsLanguageName } from "@my-reader/tools/reader-tts-language"
import { qwenTtsSourceKeys } from "@my-reader/i18n/desktop"
import { convertFileSrc, isTauri } from "@tauri-apps/api/core"
import { Loader2, Play, Server, Volume2 } from "lucide-react"
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { AddPanelButton } from "@/components/common/AddPanelButton"
import { AppRow } from "@/components/common/AppRow"
import { RowActions } from "@/components/common/RowActions"
import { SaveButton } from "@/components/common/SaveButton"
import { GroupList, GroupListItem } from "@/components/common/GroupList"
import {
  FlowDialogChoice,
  FlowDialogContent,
  FlowDialogHeader,
} from "@/components/common/FlowDialog"
import { SectionHeader } from "@/components/common/SectionHeader"
import { StatusNotice } from "@/components/common/StatusNotice"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { FormSwitch } from "@/components/common/FormSwitch"
import { useProviderTtsVoices, useQwenTtsPresets } from "@/hooks/useQwenTts"
import { useFormValidation } from "@/hooks/useFormValidation"
import { TTS_PITCH_RANGE, TTS_SPEED_RANGE } from "@/constants/tts"
import { api } from "@/lib/tauri-api"
import { errorMessage } from "@/lib/error-presentation"
import type {
  QwenTtsPresetDto,
  TtsConfigDto,
  TtsPlaybackPreferencesDto,
  TtsProviderProfileDto,
  TtsProviderDto,
} from "@/lib/tauri-specta"
import { notifyTtsConfigChanged } from "@/lib/tts/events"

type ProfileDraft = TtsProviderDraft

const SETTINGS_EVENT_SOURCE = "settings-speech"
const DEFAULT_VOICE_LANGUAGE = "und"
const AUTOMATIC_VOICE_VALUE = "__automatic__"
const PREVIEW_LANGUAGE = "en"
const PREVIEW_MIME_TYPES = [
  "audio/mpeg",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/wav",
]

function systemVoiceId(voice: SpeechSynthesisVoice): string {
  return voice.voiceURI || voice.name
}

function newProfileDraft(): ProfileDraft {
  return {
    id: "",
    name: "OpenAI",
    kind: "openAiCompatible",
    endpoint: "https://api.openai.com/v1",
    modelScopedVoices: false,
    models: [newTtsModel("gpt-4o-mini-tts")],
    voices: [""],

    credential: "",
    hasCredential: false,
    clearCredential: false,
  }
}

function profileDraft(provider: TtsProviderDto): ProfileDraft {
  return { ...provider, credential: "", clearCredential: false }
}

type TtsProviderManagerProps = {
  config: TtsConfigDto
  onConfigChange: (config: TtsConfigDto) => void | Promise<void>
  themeStyle?: CSSProperties
}

function finitePreference(value: number | null, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function useSystemSpeechVoices(enabled = true): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !window.speechSynthesis) {
      setVoices([])
      return
    }
    const updateVoices = () => setVoices(window.speechSynthesis.getVoices())
    updateVoices()
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices)
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", updateVoices)
    }
  }, [enabled])

  return voices
}

function useTtsPreviewPlayer({
  config,
  engineId,
  voiceId,
  systemVoices,
  language,
  onError,
}: {
  config: TtsConfigDto | null
  engineId: string
  voiceId: string
  systemVoices: SpeechSynthesisVoice[]
  language: string
  onError: (error: string | null) => void
}) {
  const { t } = useTranslation()
  const [previewing, setPreviewing] = useState(false)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const previewRequestIdRef = useRef<string | null>(null)
  const previewGenerationRef = useRef(0)
  const systemPreviewActiveRef = useRef(false)

  const stopPreview = useCallback(() => {
    previewGenerationRef.current += 1
    const requestId = previewRequestIdRef.current
    previewRequestIdRef.current = null
    if (requestId) void api.cancelTtsSynthesis(requestId)
    if (systemPreviewActiveRef.current && typeof window !== "undefined") {
      window.speechSynthesis?.cancel()
      systemPreviewActiveRef.current = false
    }
    previewAudioRef.current?.pause()
    previewAudioRef.current = null
    setPreviewing(false)
  }, [])

  useEffect(
    () => () => {
      previewGenerationRef.current += 1
      const requestId = previewRequestIdRef.current
      previewRequestIdRef.current = null
      if (requestId) void api.cancelTtsSynthesis(requestId)
      if (systemPreviewActiveRef.current && typeof window !== "undefined") {
        window.speechSynthesis?.cancel()
        systemPreviewActiveRef.current = false
      }
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
    },
    [],
  )

  const preview = useCallback(async () => {
    if (!config) return
    stopPreview()
    const generation = previewGenerationRef.current
    let requestId: string | null = null
    let requestPending = false
    setPreviewing(true)
    onError(null)
    try {
      if (engineId === "system") {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          throw new Error("TTS_SYSTEM_UNAVAILABLE")
        }
        const voice = systemVoices.find(
          (candidate) => systemVoiceId(candidate) === voiceId,
        )
        const utterance = new SpeechSynthesisUtterance(
          t("settings.speech.previewText"),
        )
        utterance.voice = voice ?? null
        utterance.lang = voice?.lang || language
        utterance.rate = finitePreference(config.playback.speed, 1)
        utterance.pitch = finitePreference(config.playback.pitch, 1)
        utterance.onend = () => {
          if (previewGenerationRef.current !== generation) return
          systemPreviewActiveRef.current = false
          setPreviewing(false)
        }
        utterance.onerror = (event) => {
          if (previewGenerationRef.current !== generation) return
          systemPreviewActiveRef.current = false
          setPreviewing(false)
          console.warn("Speech preview failed", event.error)
          onError(errorMessage({ kind: "Tts" }))
        }
        systemPreviewActiveRef.current = true
        window.speechSynthesis.speak(utterance)
        return
      }

      const profile = config.profiles.find(
        (candidate) => candidate.id === engineId,
      )
      if (!profile) throw new Error("TTS_DEFAULT_PROFILE_NOT_FOUND")
      if (!voiceId) throw new Error("TTS_VOICE_REQUIRED")
      requestId = `settings-preview-${Date.now()}-${Math.random()}`
      requestPending = true
      previewRequestIdRef.current = requestId
      const artifact = await api.synthesizeTtsRequest(requestId, {
        profileId: profile.id,
        text: t("settings.speech.previewText"),
        language,
        voiceId,
        speed: finitePreference(config.playback.speed, 1),
        acceptedMimeTypes: PREVIEW_MIME_TYPES,
        cachePolicy: "bypass",
      })
      if (previewRequestIdRef.current !== requestId) return
      previewRequestIdRef.current = null
      requestPending = false
      previewAudioRef.current?.pause()
      const audio = new Audio(
        isTauri() ? convertFileSrc(artifact.path) : artifact.path,
      )
      audio.playbackRate = artifact.playbackRate ?? 1
      audio.onended = () => {
        if (previewGenerationRef.current !== generation) return
        previewAudioRef.current = null
        setPreviewing(false)
      }
      audio.onerror = () => {
        if (previewGenerationRef.current !== generation) return
        previewAudioRef.current = null
        setPreviewing(false)
        onError("TTS_PLAYBACK_FAILED")
      }
      previewAudioRef.current = audio
      await audio.play()
    } catch (previewError: unknown) {
      if (
        previewGenerationRef.current !== generation ||
        (requestPending && previewRequestIdRef.current !== requestId)
      ) {
        return
      }
      if (previewRequestIdRef.current === requestId) {
        previewRequestIdRef.current = null
      }
      setPreviewing(false)
      onError(errorMessage(previewError))
    }
  }, [
    config,
    engineId,
    language,
    onError,
    stopPreview,
    systemVoices,
    t,
    voiceId,
  ])

  return { preview, previewing, stopPreview }
}

export default function SpeechSection() {
  const { t, i18n } = useTranslation()
  const previewLanguage =
    i18n?.resolvedLanguage || i18n?.language || PREVIEW_LANGUAGE
  const [config, setConfig] = useState<TtsConfigDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const systemVoices = useSystemSpeechVoices()
  const selectedEngine = config?.defaultEngine
  const selectedProfile =
    selectedEngine?.kind === "provider"
      ? config?.profiles.find(
          (profile) => profile.id === selectedEngine.profileId,
        )
      : undefined
  const providerVoices = useProviderTtsVoices(selectedProfile)
  const selectedDefaultVoiceId = configuredVoiceId(
    config,
    selectedEngine,
    selectedProfile,
  )
  const { preview, previewing, stopPreview } = useTtsPreviewPlayer({
    config,
    engineId:
      selectedEngine?.kind === "provider" ? selectedEngine.profileId : "system",
    voiceId: selectedDefaultVoiceId,
    systemVoices,
    language: previewLanguage,
    onError: setError,
  })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void api
      .getTtsConfig()
      .then((next) => {
        if (!cancelled) setConfig(next)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const applyConfig = async (next: TtsConfigDto) => {
    setConfig(next)
    await notifyTtsConfigChanged(SETTINGS_EVENT_SOURCE)
  }

  const selectEngine = async (profileId?: string) => {
    stopPreview()
    setSaving(true)
    setError(null)
    try {
      await applyConfig(
        await api.setTtsDefaultEngine(
          profileId ? { kind: "provider", profileId } : { kind: "system" },
        ),
      )
    } catch (saveError: unknown) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const selectVoice = async (voiceId: string) => {
    if (!config) return
    stopPreview()
    setSaving(true)
    setError(null)
    const voice = voiceId
      ? config.defaultEngine.kind === "provider"
        ? {
            engine: "provider" as const,
            profileId: config.defaultEngine.profileId,
            voiceId,
          }
        : { engine: "system" as const, voiceId }
      : null
    try {
      await applyConfig(
        await api.setTtsVoiceForLanguage(DEFAULT_VOICE_LANGUAGE, voice),
      )
    } catch (saveError: unknown) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const updatePlayback = async (patch: Partial<TtsPlaybackPreferencesDto>) => {
    if (!config) return
    const playback = { ...config.playback, ...patch }
    setConfig({ ...config, playback })
    setError(null)
    try {
      await applyConfig(await api.setTtsPlaybackPreferences(playback))
    } catch (saveError: unknown) {
      setError(errorMessage(saveError))
    }
  }

  if (loading) {
    return (
      <div className="grid h-full place-items-center" role="status">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-7 py-5 pb-4">
        <h1 className="text-xl font-semibold">{t("ttsSettings.defaults")}</h1>
      </div>

      <FormScrollArea className="flex-1 px-7 py-5">
        {error ? (
          <p className="select-text whitespace-pre-wrap break-words mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {config ? (
          <FieldGroup className="gap-5">
            <div className="flex items-center justify-between gap-5 py-2">
              <p className="text-sm leading-6 text-foreground">
                {t("settings.speech.previewText")}
              </p>
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                disabled={saving}
                onClick={() => (previewing ? stopPreview() : void preview())}
              >
                {previewing ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Play data-icon="inline-start" />
                )}
                {previewing
                  ? t("settings.speech.stopPreview")
                  : t("settings.speech.previewAction")}
              </Button>
            </div>
            <DefaultEngineSettings
              config={config}
              saving={saving}
              selectedDefaultVoiceId={selectedDefaultVoiceId}
              systemVoices={systemVoices}
              providerVoices={providerVoices}
              previewLanguage={previewLanguage}
              selectEngine={selectEngine}
              selectVoice={selectVoice}
            />
            <FormSlider
              {...TTS_SPEED_RANGE}
              value={finitePreference(config.playback.speed, 1)}
              onCommit={(speed) => void updatePlayback({ speed })}
              disabled={saving}
              id="tts-default-speed"
              label={t("settings.speech.defaultSpeed")}
              formatValue={(value) => `${value.toFixed(1)}×`}
            />
            <FormSlider
              {...TTS_PITCH_RANGE}
              value={finitePreference(config.playback.pitch, 1)}
              onCommit={(pitch) => void updatePlayback({ pitch })}
              disabled={saving}
              id="tts-default-pitch"
              label={t("settings.speech.defaultPitch")}
              formatValue={(value) => value.toFixed(1)}
            />
            <Separator />
            <FormSwitch
              align="between"
              id="tts-skip-page-breaks"
              label={t("settings.speech.skipPageBreaks")}
              description={t("settings.speech.skipPageBreaksDescription")}
              checked={config.playback.skipPageBreaks}
              onCheckedChange={(checked) =>
                void updatePlayback({ skipPageBreaks: checked })
              }
            />
            <FormSwitch
              align="between"
              id="tts-skip-footnotes"
              label={t("settings.speech.skipFootnotes")}
              description={t("settings.speech.skipFootnotesDescription")}
              checked={config.playback.skipFootnotes}
              onCheckedChange={(checked) =>
                void updatePlayback({ skipFootnotes: checked })
              }
            />
          </FieldGroup>
        ) : null}
      </FormScrollArea>
    </div>
  )
}

export function TtsProvidersSection() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<TtsConfigDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void api
      .getTtsConfig()
      .then((next) => {
        if (active) setConfig(next)
      })
      .catch((error: unknown) => {
        if (active) setError(errorMessage(error))
      })
    return () => {
      active = false
    }
  }, [])
  return (
    <section aria-label={t("ttsSettings.providers")}>
      <SectionHeader
        title={t("ttsSettings.providers")}
        description={t("aiProviders.ttsDescription")}
      />
      <div>
        {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
        {config ? (
          <TtsProviderManager
            config={config}
            onConfigChange={async (next) => {
              setConfig(next)
              await notifyTtsConfigChanged(SETTINGS_EVENT_SOURCE)
            }}
          />
        ) : !error ? (
          <Loader2 className="size-5 animate-spin" role="status" />
        ) : null}
      </div>
    </section>
  )
}

export function TtsProviderManager({
  config,
  onConfigChange,
  themeStyle,
}: TtsProviderManagerProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const qwenPresets = useQwenTtsPresets(providerDialogOpen)

  const saveProfile = async () => {
    if (!draft) return
    const voices = draft.voices.map((voice) => voice.trim()).filter(Boolean)
    const models = draft.models.map((model) => ({
      ...model,
      model: model.model.trim(),
      defaultVoice: model.defaultVoice?.trim() || null,
      voices: model.voices.map((voice) => voice.trim()).filter(Boolean),
    }))
    if (
      !draft.name.trim() ||
      !draft.endpoint.trim() ||
      !models.length ||
      new Set(models.map((model) => model.model)).size !== models.length ||
      models.some(
        (model) =>
          !model.model ||
          !model.defaultVoice ||
          !(usesModelVoices(draft) ? model.voices : voices).includes(
            model.defaultVoice,
          ),
      )
    ) {
      setProviderError(t("settings.speech.validationRequired"))
      return
    }
    setSaving(true)
    setProviderError(null)
    setMessage(null)
    const input = {
      provider: {
        id: draft.id,
        name: draft.name,
        kind: draft.kind,
        endpoint: draft.endpoint,
        voices: usesModelVoices(draft) ? [] : voices,

        modelScopedVoices: usesModelVoices(draft),
        models,
        hasCredential: draft.hasCredential,
      },
      credential: draft.credential.trim() || null,
      clearCredential: draft.clearCredential,
    }
    try {
      await onConfigChange(await api.saveTtsProvider(input))
      setDraft(null)
      setProviderDialogOpen(false)
      setMessage(t("settings.speech.saved"))
    } catch (saveError: unknown) {
      setProviderError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const openAddProvider = () => {
    setDraft(null)
    setProviderError(null)
    setMessage(null)
    setProviderDialogOpen(true)
  }

  const openEditProvider = (profile: TtsProviderDto) => {
    setDraft(profileDraft(profile))
    setProviderError(null)
    setMessage(null)
    setProviderDialogOpen(true)
  }

  const handleProviderDialogOpenChange = (open: boolean) => {
    setProviderDialogOpen(open)
    if (!open) {
      setDraft(null)
      setProviderError(null)
    }
  }

  const removeProfile = async (profileId: string) => {
    setSaving(true)
    setMessage(null)
    try {
      await onConfigChange(await api.removeTtsProfile(profileId))
      setDraft((current) => (current?.id === profileId ? null : current))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-slot="tts-provider-manager" style={themeStyle}>
      {message ? (
        <div className="mb-3">
          <StatusNotice tone="success">{message}</StatusNotice>
        </div>
      ) : null}
      {config.providers.length ? (
        <GroupList>
          {config.providers.map((profile) => (
            <GroupListItem key={profile.id}>
              <AppRow
                head={
                  <div className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <Server className="size-4" />
                  </div>
                }
                body={profile.name}
                detail={`${profile.kind === "qwen" ? "Qwen" : t("settings.speech.openAiCompatible")} · ${profile.endpoint}`}
                actions={
                  <RowActions
                    name={profile.name}
                    disabled={saving}
                    onEdit={() => openEditProvider(profile)}
                    onDelete={() => removeProfile(profile.id)}
                  />
                }
              />
            </GroupListItem>
          ))}
        </GroupList>
      ) : null}
      <div className="mt-3 overflow-hidden rounded-lg border border-dashed border-border">
        <AddPanelButton
          label={t("settings.speech.addProvider")}
          disabled={saving}
          onClick={openAddProvider}
        />
      </div>

      <ProviderDialog
        open={providerDialogOpen}
        draft={draft}
        error={providerError || qwenPresets.error}
        qwenPresets={qwenPresets.presets}
        saving={saving}
        onOpenChange={handleProviderDialogOpenChange}
        onChooseOpenAi={() => setDraft(newProfileDraft())}
        onChooseQwen={(preset) => {
          setDraft({
            ...newProfileDraft(),
            kind: "qwen",
            name: t(qwenTtsSourceKeys(preset.id).title),
            endpoint: preset.endpoint,
            modelScopedVoices: true,
            models: [newTtsModel()],
            voices: [],
          })
        }}
        onBack={() => {
          setDraft(null)
          setProviderError(null)
        }}
        onChange={setDraft}
        onSave={() => void saveProfile()}
        themeStyle={themeStyle}
      />
    </div>
  )
}

function ProviderDialog({
  open,
  draft,
  error,
  saving,
  onOpenChange,
  onChooseOpenAi,
  onChooseQwen,
  qwenPresets,
  onBack,
  onChange,
  onSave,
  themeStyle,
}: {
  open: boolean
  draft: ProfileDraft | null
  error: string | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onChooseOpenAi: () => void
  onChooseQwen: (preset: QwenTtsPresetDto) => void
  qwenPresets: QwenTtsPresetDto[]
  onBack: () => void
  onChange: (draft: ProfileDraft) => void
  onSave: () => void
  themeStyle?: CSSProperties
}) {
  const { t } = useTranslation()
  const choosingType = draft === null
  const editing = Boolean(draft?.id)
  const preset =
    draft?.kind === "qwen"
      ? qwenPresets.find(
          (item) => item.endpoint === draft.endpoint.trim().replace(/\/+$/, ""),
        )
      : undefined
  const { title, description } = useProviderDialogCopy(draft, preset)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FlowDialogContent
        aria-describedby={undefined}
        style={themeStyle}
        className="sm:max-w-2xl"
      >
        <FlowDialogHeader
          title={title}
          description={description}
          onBack={!choosingType && !editing ? onBack : undefined}
          backLabel={t("common.back")}
          closeLabel={t("common.close")}
          showCloseButton
        />

        <div className="min-h-0">
          {choosingType ? (
            <div className="grid h-full content-start gap-3 overflow-y-auto px-6 py-5">
              <FlowDialogChoice
                icon={Server}
                title={t("settings.speech.addOpenAi")}
                onClick={onChooseOpenAi}
              />
              {qwenPresets.map((preset) => (
                <FlowDialogChoice
                  key={preset.id}
                  icon={Volume2}
                  title={t(qwenTtsSourceKeys(preset.id).title)}
                  description={t(qwenTtsSourceKeys(preset.id).description)}
                  onClick={() => onChooseQwen(preset)}
                />
              ))}
              {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
            </div>
          ) : (
            <ProfileEditor
              draft={draft}
              preset={preset}
              themeStyle={themeStyle}
              error={error}
              saving={saving}
              onChange={onChange}
              onSave={onSave}
            />
          )}
        </div>
      </FlowDialogContent>
    </Dialog>
  )
}

function ProfileEditor({
  draft,
  preset,
  error,
  saving,
  onChange,
  onSave,
}: {
  draft: ProfileDraft
  preset?: QwenTtsPresetDto
  themeStyle?: CSSProperties
  error: string | null
  saving: boolean
  onChange: (draft: ProfileDraft) => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const { fieldErrors, validationProps } = useFormValidation(draft)
  const [previewId, setPreviewId] = useState(draft.models[0]?.id ?? "")
  const previewModel =
    draft.models.find((model) => model.id === previewId) ?? draft.models[0]
  const update = (patch: Partial<ProfileDraft>) =>
    onChange({ ...draft, ...patch })

  return (
    <form
      className="flex h-full min-h-0 flex-col"
      {...validationProps}
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
      <FormScrollArea
        data-slot="tts-provider-form-content"
        className="flex-1 px-6 py-5"
      >
        {error ? (
          <div className="mb-4">
            <StatusNotice tone="error">{error}</StatusNotice>
          </div>
        ) : null}
        <FieldGroup className="gap-6">
          <FieldGroup className="gap-4">
            <FieldGroup className="grid grid-cols-2 gap-4">
              <FormTextField
                id="tts-profile-name"
                label={t("settings.speech.name")}
                value={draft.name}
                required
                fullWidth
                error={Boolean(fieldErrors["tts-profile-name"])}
                helperText={fieldErrors["tts-profile-name"]}
                onChange={(event) => update({ name: event.target.value })}
              />
              <FormTextField
                id="tts-profile-endpoint"
                label={t("settings.speech.endpoint")}
                type="url"
                value={draft.endpoint}
                required
                fullWidth
                error={Boolean(fieldErrors["tts-profile-endpoint"])}
                helperText={fieldErrors["tts-profile-endpoint"]}
                placeholder="https://api.openai.com/v1"
                onChange={(event) => update({ endpoint: event.target.value })}
              />
            </FieldGroup>

            <FormTextField
              id="tts-profile-credential"
              label={t("settings.speech.credential")}
              type="password"
              fullWidth
              autoComplete="new-password"
              value={draft.credential}
              placeholder={
                draft.hasCredential
                  ? t("settings.speech.credentialSaved")
                  : draft.kind === "qwen"
                    ? t(qwenTtsSourceKeys(preset?.id ?? "").credential)
                    : t("settings.speech.credentialOptional")
              }
              onChange={(event) =>
                update({
                  credential: event.target.value,
                  clearCredential: false,
                })
              }
            />
          </FieldGroup>
          <TtsProviderModels
            draft={draft}
            previewModel={previewModel}
            fieldErrors={fieldErrors}
            onChange={onChange}
          />
        </FieldGroup>
      </FormScrollArea>
      <DialogFooter className="shrink-0 flex-row items-center justify-between border-t border-border px-6 py-4 sm:justify-between">
        <div className="flex items-center gap-4">
          <TtsTestModelSelect
            draft={draft}
            model={previewModel}
            onChange={setPreviewId}
          />
          {draft.hasCredential ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id="tts-clear-credential"
                checked={draft.clearCredential}
                onCheckedChange={(checked) =>
                  update({
                    clearCredential: checked === true,
                    credential: "",
                  })
                }
              />
              <Label
                htmlFor="tts-clear-credential"
                className="text-sm font-normal text-muted-foreground"
              >
                {t("settings.speech.clearCredential")}
              </Label>
            </div>
          ) : null}
        </div>
        <SaveButton saving={saving} />
      </DialogFooter>
    </form>
  )
}

function configuredVoiceId(
  config: TtsConfigDto | null,
  engine: TtsConfigDto["defaultEngine"] | undefined,
  profile: TtsProviderProfileDto | undefined,
) {
  const voice = config?.voiceByLanguage[DEFAULT_VOICE_LANGUAGE]
  if (engine?.kind !== "provider")
    return voice?.engine === "system" ? voice.voiceId : ""
  if (voice?.engine === "provider" && voice.profileId === engine.profileId)
    return voice.voiceId
  return profile?.options.defaultVoice ?? ""
}

function DefaultEngineSettings({
  config,
  saving,
  selectedDefaultVoiceId,
  systemVoices,
  providerVoices,
  previewLanguage,
  selectEngine,
  selectVoice,
}: {
  config: TtsConfigDto
  saving: boolean
  selectedDefaultVoiceId: string
  systemVoices: ReturnType<typeof useSystemSpeechVoices>
  providerVoices: ReturnType<typeof useProviderTtsVoices>
  previewLanguage: string
  selectEngine: (id?: string) => Promise<void>
  selectVoice: (id: string) => Promise<void>
}) {
  const { t } = useTranslation()
  return (
    <>
      <FormSelect
        value={
          config.defaultEngine.kind === "provider"
            ? config.defaultEngine.profileId
            : "system"
        }
        disabled={saving}
        onValueChange={(value) =>
          void selectEngine(value === "system" ? undefined : value)
        }
        id="tts-default-engine"
        label={t("settings.speech.defaultEngine")}
        labelMode="external"
      >
        <FormSelectItem value="system">
          {t("settings.speech.systemTitle")}
        </FormSelectItem>
        {config.profiles.map((profile) => (
          <FormSelectItem key={profile.id} value={profile.id}>
            {`${profile.name}/${profile.model}`}
          </FormSelectItem>
        ))}
      </FormSelect>
      <FormSelect
        value={selectedDefaultVoiceId || AUTOMATIC_VOICE_VALUE}
        disabled={saving}
        onValueChange={(value) =>
          void selectVoice(value === AUTOMATIC_VOICE_VALUE ? "" : value)
        }
        id="tts-default-voice"
        label={t("reader.tts.voice")}
        labelMode="external"
      >
        {config.defaultEngine.kind === "system" ? (
          <>
            <FormSelectItem value={AUTOMATIC_VOICE_VALUE}>
              {t("settings.speech.automaticVoice")}
            </FormSelectItem>
            {systemVoices.map((voice) => (
              <FormSelectItem
                key={systemVoiceId(voice)}
                value={systemVoiceId(voice)}
              >
                {voice.name} ·{" "}
                {formatTtsLanguageName(voice.lang, previewLanguage)}
              </FormSelectItem>
            ))}
          </>
        ) : (
          providerVoices.map((voice) => (
            <FormSelectItem key={voice.id} value={voice.id}>
              {voice.id}
            </FormSelectItem>
          ))
        )}
      </FormSelect>
    </>
  )
}

function useProviderDialogCopy(
  draft: ProfileDraft | null,
  preset: QwenTtsPresetDto | undefined,
) {
  const { t } = useTranslation()
  if (!draft)
    return { title: t("settings.speech.addProvider"), description: undefined }
  const description =
    draft.kind === "qwen"
      ? t(qwenTtsSourceKeys(preset?.id ?? "").description)
      : undefined
  if (draft.id) return { title: t("settings.speech.editProvider"), description }
  const title =
    draft.kind === "qwen"
      ? t("qwenTts.add", {
          name: preset ? t(qwenTtsSourceKeys(preset.id).title) : "Qwen",
        })
      : t("settings.speech.addOpenAi")
  return { title, description }
}
