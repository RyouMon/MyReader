import { formatTtsLanguageName } from "@my-reader/tools/reader-tts-language"
import { qwenTtsSourceKeys } from "@my-reader/i18n/desktop"
import { convertFileSrc, isTauri } from "@tauri-apps/api/core"
import {
  Check,
  ChevronDown,
  KeyRound,
  Loader2,
  Pencil,
  Play,
  PlusCircle,
  Server,
  Trash2,
  Volume2,
} from "lucide-react"
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { AddPanelButton } from "@/components/common/AddPanelButton"
import {
  FlowDialogChoice,
  FlowDialogContent,
  FlowDialogHeader,
} from "@/components/common/FlowDialog"
import { SectionHeader } from "@/components/common/SectionHeader"
import { StatusNotice } from "@/components/common/StatusNotice"
import { Button } from "@/components/ui/button"
import { Dialog, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  useProviderTtsVoices,
  useQwenTtsModels,
  useQwenTtsPresets,
  useQwenTtsVoices,
} from "@/hooks/useQwenTts"
import { TTS_PITCH_OPTIONS, TTS_SPEED_OPTIONS } from "@/constants/tts"
import { api, formatApiError } from "@/lib/tauri-api"
import type {
  TtsAudioFormatDto,
  QwenTtsModelDto,
  QwenTtsPresetDto,
  TtsConfigDto,
  TtsPlaybackPreferencesDto,
  TtsProviderProfileDto,
  UpsertTtsProviderInput,
} from "@/lib/tauri-specta"
import { notifyTtsConfigChanged } from "@/lib/tts/events"
import { cn } from "@/lib/utils"

type ProfileDraft = {
  id: string
  name: string
  kind: "openAiCompatible" | "qwen"
  enabled: boolean
  endpoint: string
  model: string
  responseFormat: TtsAudioFormatDto
  instructions: string
  voices: string
  defaultVoice: string
  credential: string
  hasCredential: boolean
  clearCredential: boolean
}

const SETTINGS_EVENT_SOURCE = "settings-speech"
const DEFAULT_VOICE_LANGUAGE = "und"
const AUTOMATIC_VOICE_VALUE = "__automatic__"
const PREVIEW_LANGUAGE = "zh-CN"
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
    enabled: true,
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4o-mini-tts",
    responseFormat: "mp3",
    instructions: "",
    voices: "",
    defaultVoice: "",
    credential: "",
    hasCredential: false,
    clearCredential: false,
  }
}

function profileDraft(profile: TtsProviderProfileDto): ProfileDraft {
  return {
    id: profile.id,
    name: profile.name,
    kind: profile.kind,
    enabled: profile.enabled,
    endpoint: profile.endpoint,
    model: profile.model ?? "",
    responseFormat: profile.options.responseFormat ?? "mp3",
    instructions: profile.options.instructions ?? "",
    voices: (profile.options.voices ?? []).join("\n"),
    defaultVoice: profile.options.defaultVoice ?? "",
    credential: "",
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

type TtsProviderManagerProps = {
  config: TtsConfigDto
  onConfigChange: (config: TtsConfigDto) => void | Promise<void>
  showPreview?: boolean
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
          onError(event.error || "TTS_PLAYBACK_FAILED")
        }
        systemPreviewActiveRef.current = true
        window.speechSynthesis.speak(utterance)
        return
      }

      const profile = config.profiles.find(
        (candidate) => candidate.id === engineId,
      )
      if (!profile?.enabled) throw new Error("TTS_DEFAULT_PROFILE_NOT_FOUND")
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
      onError(formatApiError(previewError))
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
  const configuredDefaultVoice = config?.voiceByLanguage[DEFAULT_VOICE_LANGUAGE]
  const providerVoices = useProviderTtsVoices(selectedProfile)
  const selectedDefaultVoiceId =
    selectedEngine?.kind === "provider"
      ? configuredDefaultVoice?.engine === "provider" &&
        configuredDefaultVoice.profileId === selectedEngine.profileId
        ? configuredDefaultVoice.voiceId
        : (selectedProfile?.options.defaultVoice ?? "")
      : configuredDefaultVoice?.engine === "system"
        ? configuredDefaultVoice.voiceId
        : ""
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
        if (!cancelled) setError(formatApiError(loadError))
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
      setError(formatApiError(saveError))
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
      setError(formatApiError(saveError))
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
      setError(formatApiError(saveError))
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
        <h1 className="text-xl font-semibold">{t("settings.speech.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.speech.description")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-6">
        {error ? (
          <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {config ? (
          <section className="max-w-3xl">
            <SectionHeader
              title={t("settings.speech.previewTitle")}
              description={t("settings.speech.previewDescription")}
            />
            <div className="flex items-center justify-between gap-5 rounded-md border border-border bg-card px-4 py-4">
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
          </section>
        ) : null}

        {config ? (
          <section className="mt-8 max-w-3xl border-t border-border pt-6">
            <SectionHeader
              title={t("settings.speech.engineTitle")}
              description={t("settings.speech.engineDescription")}
            />
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
              <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <Label htmlFor="tts-default-engine" className="font-medium">
                  {t("settings.speech.defaultEngine")}
                </Label>
                <Select
                  value={
                    config.defaultEngine.kind === "provider"
                      ? config.defaultEngine.profileId
                      : "system"
                  }
                  disabled={saving}
                  onValueChange={(value) =>
                    void selectEngine(value === "system" ? undefined : value)
                  }
                >
                  <SelectTrigger
                    id="tts-default-engine"
                    aria-label={t("settings.speech.defaultEngine")}
                    className="min-w-52"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="system">
                        {t("settings.speech.systemTitle")}
                      </SelectItem>
                      {config.profiles
                        .filter((profile) => profile.enabled)
                        .map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.name}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <Label htmlFor="tts-default-voice" className="font-medium">
                  {t("settings.speech.defaultVoice")}
                </Label>
                <Select
                  value={selectedDefaultVoiceId || AUTOMATIC_VOICE_VALUE}
                  disabled={saving}
                  onValueChange={(value) =>
                    void selectVoice(
                      value === AUTOMATIC_VOICE_VALUE ? "" : value,
                    )
                  }
                >
                  <SelectTrigger
                    id="tts-default-voice"
                    aria-label={t("settings.speech.defaultVoice")}
                    className="min-w-52"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {config.defaultEngine.kind === "system" ? (
                        <>
                          <SelectItem value={AUTOMATIC_VOICE_VALUE}>
                            {t("settings.speech.automaticVoice")}
                          </SelectItem>
                          {systemVoices.map((voice) => (
                            <SelectItem
                              key={systemVoiceId(voice)}
                              value={systemVoiceId(voice)}
                            >
                              {voice.name} ·{" "}
                              {formatTtsLanguageName(
                                voice.lang,
                                previewLanguage,
                              )}
                            </SelectItem>
                          ))}
                        </>
                      ) : (
                        providerVoices.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-8 max-w-3xl border-t border-border pt-6">
          <SectionHeader
            title={t("settings.speech.managedEnginesTitle")}
            description={t("settings.speech.managedEnginesDescription")}
          />
          {config ? (
            <TtsProviderManager config={config} onConfigChange={applyConfig} />
          ) : null}
        </section>

        {config ? (
          <section className="mt-8 max-w-3xl border-t border-border pt-6">
            <SectionHeader
              title={t("settings.speech.playbackTitle")}
              description={t("settings.speech.playbackDescription")}
            />
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
              <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <Label htmlFor="tts-default-speed">
                  {t("settings.speech.defaultSpeed")}
                </Label>
                <Select
                  value={String(finitePreference(config.playback.speed, 1))}
                  onValueChange={(value) =>
                    void updatePlayback({ speed: Number(value) })
                  }
                  disabled={saving}
                >
                  <SelectTrigger
                    id="tts-default-speed"
                    aria-label={t("settings.speech.defaultSpeed")}
                    className="min-w-32"
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {TTS_SPEED_OPTIONS.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value.toFixed(1)}×
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <Label htmlFor="tts-default-pitch">
                  {t("settings.speech.defaultPitch")}
                </Label>
                <Select
                  value={String(finitePreference(config.playback.pitch, 1))}
                  onValueChange={(value) =>
                    void updatePlayback({ pitch: Number(value) })
                  }
                  disabled={saving}
                >
                  <SelectTrigger
                    id="tts-default-pitch"
                    aria-label={t("settings.speech.defaultPitch")}
                    className="min-w-32"
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {TTS_PITCH_OPTIONS.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value.toFixed(1)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <PlaybackSwitch
                id="tts-skip-page-breaks"
                label={t("settings.speech.skipPageBreaks")}
                description={t("settings.speech.skipPageBreaksDescription")}
                checked={config.playback.skipPageBreaks}
                onCheckedChange={(checked) =>
                  void updatePlayback({ skipPageBreaks: checked })
                }
              />
              <PlaybackSwitch
                id="tts-skip-footnotes"
                label={t("settings.speech.skipFootnotes")}
                description={t("settings.speech.skipFootnotesDescription")}
                checked={config.playback.skipFootnotes}
                onCheckedChange={(checked) =>
                  void updatePlayback({ skipFootnotes: checked })
                }
              />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

function TtsProviderPreview({
  config,
  themeStyle,
}: {
  config: TtsConfigDto
  themeStyle?: CSSProperties
}) {
  const { t, i18n } = useTranslation()
  const previewLanguage =
    i18n?.resolvedLanguage || i18n?.language || PREVIEW_LANGUAGE
  const systemVoices = useSystemSpeechVoices()
  const enabledProfiles = config.profiles.filter((profile) => profile.enabled)
  const defaultProviderId =
    config.defaultEngine.kind === "provider"
      ? config.defaultEngine.profileId
      : null
  const configuredEngineId =
    defaultProviderId &&
    enabledProfiles.some((profile) => profile.id === defaultProviderId)
      ? defaultProviderId
      : "system"
  const [requestedEngineId, setRequestedEngineId] = useState(configuredEngineId)
  const [requestedVoiceId, setRequestedVoiceId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const engineId =
    requestedEngineId === "system" ||
    enabledProfiles.some((profile) => profile.id === requestedEngineId)
      ? requestedEngineId
      : configuredEngineId
  const selectedProfile = enabledProfiles.find(
    (profile) => profile.id === engineId,
  )
  const providerVoices = useProviderTtsVoices(selectedProfile)
  const voiceOptions =
    engineId === "system"
      ? systemVoices.map((voice) => ({
          id: systemVoiceId(voice),
          label: `${voice.name} · ${formatTtsLanguageName(
            voice.lang,
            previewLanguage,
          )}`,
        }))
      : providerVoices.map((voice) => ({
          id: voice.id,
          label: voice.name,
        }))
  const configuredVoice = config.voiceByLanguage[DEFAULT_VOICE_LANGUAGE]
  const preferredVoiceId =
    engineId === "system"
      ? configuredVoice?.engine === "system"
        ? configuredVoice.voiceId
        : ""
      : configuredVoice?.engine === "provider" &&
          configuredVoice.profileId === engineId
        ? configuredVoice.voiceId
        : (selectedProfile?.options.defaultVoice ?? "")
  const voiceId = voiceOptions.some((voice) => voice.id === requestedVoiceId)
    ? requestedVoiceId
    : voiceOptions.some((voice) => voice.id === preferredVoiceId)
      ? preferredVoiceId
      : (voiceOptions[0]?.id ?? "")
  const { preview, previewing, stopPreview } = useTtsPreviewPlayer({
    config,
    engineId,
    voiceId,
    systemVoices,
    language: previewLanguage,
    onError: setError,
  })

  const selectEngine = (nextEngineId: string) => {
    stopPreview()
    setError(null)
    setRequestedEngineId(nextEngineId)
    setRequestedVoiceId("")
  }

  const selectVoice = (nextVoiceId: string) => {
    stopPreview()
    setError(null)
    setRequestedVoiceId(nextVoiceId)
  }

  return (
    <section className="mb-5 flex flex-col gap-3 rounded-md border border-border bg-card p-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">
          {t("settings.speech.previewTitle")}
        </h3>
        <p className="text-xs leading-5 text-muted-foreground">
          {t("settings.speech.previewText")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tts-provider-preview-engine" className="text-xs">
          {t("reader.tts.engine")}
        </Label>
        <Select value={engineId} onValueChange={selectEngine}>
          <SelectTrigger
            id="tts-provider-preview-engine"
            aria-label={t("reader.tts.engine")}
            className={cn("w-full", themeStyle && "reader-tts-themed-trigger")}
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start" style={themeStyle}>
            <SelectGroup>
              <SelectItem value="system">
                {t("settings.speech.systemTitle")}
              </SelectItem>
              {enabledProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tts-provider-preview-voice" className="text-xs">
          {t("reader.tts.voice")}
        </Label>
        <Select
          value={voiceId}
          disabled={voiceOptions.length === 0}
          onValueChange={selectVoice}
        >
          <SelectTrigger
            id="tts-provider-preview-voice"
            aria-label={t("reader.tts.voice")}
            className={cn("w-full", themeStyle && "reader-tts-themed-trigger")}
            size="sm"
          >
            <SelectValue placeholder={t("reader.tts.loadingVoices")} />
          </SelectTrigger>
          <SelectContent position="popper" align="start" style={themeStyle}>
            <SelectGroup>
              {voiceOptions.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}

      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={!voiceId}
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
    </section>
  )
}

export function TtsProviderManager({
  config,
  onConfigChange,
  showPreview = false,
  themeStyle,
}: TtsProviderManagerProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const qwen = useQwenTtsModels(
    providerDialogOpen && draft?.kind === "qwen",
    draft?.endpoint ?? "",
  )
  const qwenPresets = useQwenTtsPresets(providerDialogOpen)

  const saveProfile = async () => {
    if (!draft) return
    const voices = parseVoiceIds(
      draft.voices + (draft.kind === "qwen" ? `\n${draft.defaultVoice}` : ""),
    )
    const defaultVoice = draft.defaultVoice.trim()
    if (
      !draft.name.trim() ||
      !draft.endpoint.trim() ||
      !draft.model.trim() ||
      voices.length === 0 ||
      !defaultVoice ||
      !voices.includes(defaultVoice)
    ) {
      setProviderError(t("settings.speech.validationRequired"))
      return
    }
    setSaving(true)
    setProviderError(null)
    setMessage(null)
    const input: UpsertTtsProviderInput = {
      profile: {
        id: draft.id,
        name: draft.name.trim(),
        kind: draft.kind,
        enabled: draft.enabled,
        endpoint: draft.endpoint.trim(),
        model: draft.model.trim() || null,
        options: {
          kind: draft.kind,
          responseFormat: draft.responseFormat,
          instructions: draft.instructions.trim() || null,
          voices,
          defaultVoice,
        },
      },
      credential: draft.credential.trim() || null,
      clearCredential: draft.clearCredential,
    }
    try {
      await onConfigChange(await api.upsertTtsProfile(input))
      setDraft(null)
      setProviderDialogOpen(false)
      setMessage(t("settings.speech.saved"))
    } catch (saveError: unknown) {
      setProviderError(formatApiError(saveError))
    } finally {
      setSaving(false)
    }
  }

  const openAddProvider = () => {
    setDraft(null)
    setProviderError(null)
    setMessage(null)
    setError(null)
    setProviderDialogOpen(true)
  }

  const openEditProvider = (profile: TtsProviderProfileDto) => {
    setDraft(profileDraft(profile))
    setProviderError(null)
    setMessage(null)
    setError(null)
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
    if (pendingDeleteId !== profileId) {
      setPendingDeleteId(profileId)
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await onConfigChange(await api.removeTtsProfile(profileId))
      setPendingDeleteId(null)
      setDraft((current) => (current?.id === profileId ? null : current))
    } catch (removeError: unknown) {
      setError(formatApiError(removeError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-slot="tts-provider-manager" style={themeStyle}>
      {showPreview ? (
        <TtsProviderPreview config={config} themeStyle={themeStyle} />
      ) : null}
      {error || message ? (
        <div className="mb-3 flex flex-col gap-2">
          {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
          {message ? (
            <StatusNotice tone="success">{message}</StatusNotice>
          ) : null}
        </div>
      ) : null}
      <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
        <ManagedEngineRow
          title={t("settings.speech.systemTitle")}
          description={t("settings.speech.systemDescription")}
          icon={<Volume2 className="size-4" />}
        />
        {config.profiles.map((profile) => (
          <ManagedEngineRow
            key={profile.id}
            title={profile.name}
            description={`${profile.kind === "qwen" ? "Qwen" : t("settings.speech.openAiCompatible")} · ${profile.endpoint}`}
            status={profile.enabled ? undefined : t("settings.speech.disabled")}
            icon={<Server className="size-4" />}
            actions={
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("settings.speech.editProvider")}
                  disabled={saving}
                  onClick={() => openEditProvider(profile)}
                >
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    pendingDeleteId === profile.id &&
                      "bg-destructive/10 text-destructive",
                  )}
                  aria-label={
                    pendingDeleteId === profile.id
                      ? t("settings.speech.confirmRemoveProvider")
                      : t("settings.speech.removeProvider")
                  }
                  disabled={saving}
                  onClick={() => void removeProfile(profile.id)}
                >
                  <Trash2 />
                </Button>
              </>
            }
          />
        ))}
      </div>
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
        error={providerError || qwen.error || qwenPresets.error}
        qwenModels={qwen.models}
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
            ...qwenModelDraft(preset.defaultModel),
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

function ManagedEngineRow({
  title,
  description,
  status,
  icon,
  actions,
}: {
  title: string
  description: string
  status?: string
  icon: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-medium">
            {title}
            {status ? (
              <span className="text-xs font-normal text-muted-foreground">
                {status}
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {description}
          </span>
        </span>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      ) : null}
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
  qwenModels,
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
  qwenModels: QwenTtsModelDto[]
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
  const title = choosingType
    ? t("settings.speech.addProvider")
    : editing
      ? t("settings.speech.editProvider")
      : draft?.kind === "qwen"
        ? t("qwenTts.add", {
            name: preset ? t(qwenTtsSourceKeys(preset.id).title) : "Qwen",
          })
        : t("settings.speech.addOpenAi")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FlowDialogContent aria-describedby={undefined} style={themeStyle}>
        <FlowDialogHeader
          title={title}
          description={
            choosingType
              ? undefined
              : draft.kind === "qwen"
                ? t(qwenTtsSourceKeys(preset?.id ?? "").description)
                : t("settings.speech.openAiContract")
          }
          onBack={!choosingType && !editing ? onBack : undefined}
          backLabel={t("common.back")}
          closeLabel={t("common.close")}
          showCloseButton
        />

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          {choosingType ? (
            <div className="grid gap-3">
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
              qwenModels={
                qwenModels.length
                  ? qwenModels
                  : preset
                    ? [preset.defaultModel]
                    : []
              }
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
  qwenModels,
  preset,
  themeStyle,
  error,
  saving,
  onChange,
  onSave,
}: {
  draft: ProfileDraft
  qwenModels: QwenTtsModelDto[]
  preset?: QwenTtsPresetDto
  themeStyle?: CSSProperties
  error: string | null
  saving: boolean
  onChange: (draft: ProfileDraft) => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const [showManualVoices, setShowManualVoices] = useState(false)
  const update = (patch: Partial<ProfileDraft>) =>
    onChange({ ...draft, ...patch })
  const qwenModel =
    draft.kind === "qwen"
      ? qwenModels.find((model) => model.id === draft.model)
      : undefined
  const discovered = useQwenTtsVoices({
    enabled: Boolean(
      qwenModel?.voiceDiscovery &&
        !draft.clearCredential &&
        (draft.credential.trim() || draft.hasCredential),
    ),
    endpoint: draft.endpoint,
    model: draft.model,
    profileId: draft.hasCredential ? draft.id : undefined,
    credential: draft.credential,
  })
  const knownVoices = [...(qwenModel?.voices ?? []), ...discovered.voices]
  const configuredVoices = parseVoiceIds(
    [
      draft.voices,
      ...knownVoices.map((voice) => voice.id),
      draft.kind === "qwen" ? draft.defaultVoice : "",
    ].join("\n"),
  )
  const manualVoices = qwenModel
    ? parseVoiceIds(draft.voices)
        .filter((id) => !qwenModel.voices.some((voice) => voice.id === id))
        .join("\n")
    : draft.voices

  return (
    <form
      className="flex h-full min-h-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
      <div
        data-slot="tts-provider-form-content"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {error ? (
          <div className="mb-4">
            <StatusNotice tone="error">{error}</StatusNotice>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("settings.speech.name")} htmlFor="tts-profile-name">
            <Input
              id="tts-profile-name"
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
            />
          </Field>
          <Field
            label={t("settings.speech.endpoint")}
            htmlFor="tts-profile-endpoint"
          >
            <Input
              id="tts-profile-endpoint"
              value={draft.endpoint}
              placeholder="https://api.openai.com/v1"
              onChange={(event) => update({ endpoint: event.target.value })}
            />
          </Field>
          <Field
            label={t("settings.speech.model")}
            htmlFor="tts-profile-model"
            className="sm:col-span-2"
          >
            {draft.kind === "qwen" ? (
              <Select
                value={draft.model}
                onValueChange={(id) => {
                  const model = qwenModels.find((model) => model.id === id)
                  if (model) {
                    setShowManualVoices(false)
                    update(qwenModelDraft(model))
                  }
                }}
              >
                <SelectTrigger id="tts-profile-model" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={themeStyle}>
                  <SelectGroup>
                    {qwenModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="tts-profile-model"
                value={draft.model}
                placeholder="gpt-4o-mini-tts"
                onChange={(event) => update({ model: event.target.value })}
              />
            )}
          </Field>
          <div className="grid gap-2 sm:col-span-2">
            {draft.kind === "qwen" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-self-start"
                aria-expanded={showManualVoices}
                aria-controls="tts-profile-manual-voices"
                onClick={() => setShowManualVoices((current) => !current)}
              >
                <ChevronDown
                  data-icon="inline-start"
                  className={cn(showManualVoices && "rotate-180")}
                />
                {t("qwenTts.manualVoicesAction")}
              </Button>
            ) : null}
            {draft.kind !== "qwen" || showManualVoices ? (
              <div id="tts-profile-manual-voices">
                <Field
                  label={
                    draft.kind === "qwen"
                      ? t("qwenTts.manualVoices")
                      : t("settings.speech.voices")
                  }
                  htmlFor="tts-profile-voices"
                >
                  <textarea
                    id="tts-profile-voices"
                    className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                    value={manualVoices}
                    placeholder={t("settings.speech.voicesPlaceholder")}
                    onChange={(event) => {
                      const voices = event.target.value
                      const nextVoices = parseVoiceIds(voices)
                      update({
                        voices,
                        defaultVoice:
                          draft.kind === "qwen" ||
                          nextVoices.includes(draft.defaultVoice)
                            ? draft.defaultVoice
                            : (nextVoices[0] ?? ""),
                      })
                    }}
                  />
                  <span className="text-xs leading-5 text-muted-foreground">
                    {draft.kind === "qwen"
                      ? t("qwenTts.manualVoicesHint")
                      : t("settings.speech.voicesDescription")}
                  </span>
                </Field>
              </div>
            ) : null}
            {discovered.loading ? (
              <span role="status" className="text-sm text-muted-foreground">
                {t("qwenTts.loadingVoices")}
              </span>
            ) : null}
            {discovered.error ? (
              <StatusNotice tone="error">
                {t("qwenTts.voicesFailed")} {discovered.error}
              </StatusNotice>
            ) : null}
            {qwenModel?.voiceDiscovery &&
            (draft.credential.trim() || draft.hasCredential) &&
            !draft.clearCredential &&
            !discovered.loading &&
            !discovered.error &&
            configuredVoices.length === 0 ? (
              <span className="text-sm text-muted-foreground">
                {t("qwenTts.voicesEmpty")}
              </span>
            ) : null}
          </div>
          <Field
            label={t("settings.speech.defaultVoice")}
            htmlFor="tts-profile-default-voice"
            className="sm:col-span-2"
          >
            {draft.kind === "qwen" ? (
              <Select
                value={draft.defaultVoice}
                onValueChange={(defaultVoice) => {
                  if (defaultVoice) update({ defaultVoice })
                }}
              >
                <SelectTrigger
                  id="tts-profile-default-voice"
                  className="w-full"
                >
                  <SelectValue
                    placeholder={t("settings.speech.selectDefaultVoice")}
                  />
                </SelectTrigger>
                <SelectContent style={themeStyle}>
                  <SelectGroup>
                    {configuredVoices.map((id) => (
                      <SelectItem key={id} value={id}>
                        {knownVoices.find((voice) => voice.id === id)?.name ??
                          id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <select
                id="tts-profile-default-voice"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={draft.defaultVoice}
                disabled={configuredVoices.length === 0}
                onChange={(event) =>
                  update({ defaultVoice: event.target.value })
                }
              >
                {configuredVoices.length === 0 ? (
                  <option value="">
                    {t("settings.speech.selectDefaultVoice")}
                  </option>
                ) : null}
                {configuredVoices.map((voice) => (
                  <option key={voice} value={voice}>
                    {voice}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {(!qwenModel || qwenModel.supportsInstructions) && (
            <Field
              label={t("settings.speech.instructions")}
              htmlFor="tts-profile-instructions"
              className="sm:col-span-2"
            >
              <Input
                id="tts-profile-instructions"
                value={draft.instructions}
                placeholder={t("settings.speech.instructionsPlaceholder")}
                onChange={(event) =>
                  update({ instructions: event.target.value })
                }
              />
            </Field>
          )}
          <Field
            label={t("settings.speech.credential")}
            htmlFor="tts-profile-credential"
            className="sm:col-span-2"
          >
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="tts-profile-credential"
                type="password"
                className="pl-9"
                autoComplete="off"
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
            </div>
          </Field>
        </div>
      </div>
      <DialogFooter className="mt-4 shrink-0 flex-row items-center justify-between border-t border-border pt-3 sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Switch
              aria-labelledby="tts-profile-enabled-label"
              checked={draft.enabled}
              onCheckedChange={(enabled) => update({ enabled })}
            />
            <span id="tts-profile-enabled-label">
              {t("settings.speech.enabled")}
            </span>
          </div>
          {draft.hasCredential ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={draft.clearCredential}
                onChange={(event) =>
                  update({
                    clearCredential: event.target.checked,
                    credential: "",
                  })
                }
              />
              {t("settings.speech.clearCredential")}
            </label>
          ) : null}
        </div>
        <Button size="sm" type="submit" disabled={saving}>
          {saving ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : draft.id ? (
            <Check data-icon="inline-start" />
          ) : (
            <PlusCircle data-icon="inline-start" />
          )}
          {draft.id ? t("common.save") : t("settings.speech.addProvider")}
        </Button>
      </DialogFooter>
    </form>
  )
}

function qwenModelDraft(
  model: QwenTtsModelDto,
): Pick<
  ProfileDraft,
  "model" | "voices" | "defaultVoice" | "responseFormat" | "instructions"
> {
  return {
    model: model.id,
    voices: "",
    defaultVoice: model.voices[0]?.id ?? "",
    responseFormat: model.audioFormats[0],
    instructions: "",
  }
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("grid gap-1.5 text-sm", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function PlaybackSwitch({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span>
        <span id={`${id}-label`} className="block text-sm font-medium">
          {label}
        </span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      <Switch
        aria-labelledby={`${id}-label`}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}
