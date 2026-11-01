import { convertFileSrc, isTauri } from "@tauri-apps/api/core"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { errorMessage } from "@/lib/error-presentation"
import { api } from "@/lib/tauri-api"
import type { TtsConfigDto } from "@/lib/tauri-specta"

const PREVIEW_MIME_TYPES = [
  "audio/mpeg",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/wav",
]

let stopActivePreview: (() => void) | null = null

function finitePreference(value: number | null, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function systemVoiceId(voice: SpeechSynthesisVoice): string {
  return voice.voiceURI || voice.name
}

export function useTtsPreviewPlayer({
  config,
  engineId,
  voiceId,
  systemVoices,
  language: requestedLanguage,
  instructions,
  onError,
}: {
  config: TtsConfigDto | null
  engineId: string
  voiceId: string
  systemVoices?: SpeechSynthesisVoice[]
  language?: string
  instructions?: string
  onError: (error: string | null) => void
}) {
  const { t, i18n } = useTranslation()
  const language =
    requestedLanguage || i18n?.resolvedLanguage || i18n?.language || "en"
  const [previewing, setPreviewing] = useState(false)
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null)
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
    if (stopActivePreview === stopPreview) stopActivePreview = null
  }, [])

  useEffect(() => {
    onError(null)
    return stopPreview
  }, [
    engineId,
    voiceId,
    instructions,
    language,
    config?.playback.speed,
    config?.playback.pitch,
    onError,
    stopPreview,
  ])

  const preview = useCallback(
    async (candidateVoiceId = voiceId) => {
      if (!config) return
      stopActivePreview?.()
      stopPreview()
      stopActivePreview = stopPreview
      const generation = previewGenerationRef.current
      let requestId: string | null = null
      let requestPending = false
      setPreviewing(true)
      setPreviewVoiceId(candidateVoiceId)
      onError(null)
      try {
        if (engineId === "system") {
          if (typeof window === "undefined" || !window.speechSynthesis) {
            throw new Error("TTS_SYSTEM_UNAVAILABLE")
          }
          const voice = (
            systemVoices ?? window.speechSynthesis.getVoices()
          ).find((candidate) => systemVoiceId(candidate) === candidateVoiceId)
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
        if (!candidateVoiceId) throw new Error("TTS_VOICE_REQUIRED")
        requestId = `tts-preview-${crypto.randomUUID()}`
        requestPending = true
        previewRequestIdRef.current = requestId
        const artifact = await api.synthesizeTtsRequest(requestId, {
          profileId: profile.id,
          text: t("settings.speech.previewText"),
          language,
          voiceId: candidateVoiceId,
          instructions,
          speed: finitePreference(config.playback.speed, 1),
          pitch: finitePreference(config.playback.pitch, 1),
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
          onError(t("providerEditor.playbackFailed"))
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
    },
    [
      config,
      engineId,
      instructions,
      language,
      onError,
      stopPreview,
      systemVoices,
      t,
      voiceId,
    ],
  )

  return {
    preview,
    previewing,
    previewVoiceId: previewing ? previewVoiceId : null,
    stopPreview,
  }
}
