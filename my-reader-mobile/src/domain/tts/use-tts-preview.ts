import { normalizeTtsLanguage } from "@my-reader/tools/reader-tts-language"
import * as Speech from "expo-speech"
import { useCallback, useEffect, useRef, useState } from "react"
import { ttsMaximumPlaybackSpeed } from "@/src/constants/tts"

import { type MobileTtsConfig, synthesizeTts } from "@/src/services/core/tts"
import { toFileUri } from "@/src/services/fs/path"
import { usePreviewAudioPlayer } from "./use-preview-audio-player"

const PREVIEW_MIME_TYPES = [
  "audio/mpeg",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/wav",
]

export type TtsPreviewState = "idle" | "generating" | "loading" | "playing"

let stopActivePreview: (() => void) | null = null

export function useTtsPreview({
  config,
  language,
  onError,
  text,
  voiceId,
  voiceLanguage,
  instructions,
}: {
  config: MobileTtsConfig | null
  language: string
  onError: (error: unknown) => void
  text: string
  voiceId?: string
  voiceLanguage?: string
  instructions?: string
}) {
  const previewLanguage = normalizeTtsLanguage(language) || "und"
  const selectedProfile =
    config?.defaultEngine.kind === "provider"
      ? config.profiles.find(
          (profile) => profile.id === config.defaultEngine.profileId,
        )
      : undefined
  const [state, setState] = useState<TtsPreviewState>("idle")
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null)
  const systemActiveRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)

  const handlePlaying = useCallback(() => {
    setState("playing")
  }, [])

  const handleFinish = useCallback(() => {
    setState("idle")
  }, [])

  const handlePlaybackError = useCallback(
    (error: unknown) => {
      setState("idle")
      onError(error)
    },
    [onError],
  )

  const { loadAndPlay, stop: stopAudio } = usePreviewAudioPlayer({
    onPlaying: handlePlaying,
    onFinish: handleFinish,
    onError: handlePlaybackError,
  })

  const stop = useCallback(() => {
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    if (systemActiveRef.current) void Speech.stop()
    systemActiveRef.current = false
    if (stopActivePreview === stop) stopActivePreview = null
    stopAudio()
    setState("idle")
  }, [stopAudio])

  useEffect(() => stop, [stop])

  const start = useCallback(
    async (candidateVoiceId = voiceId, candidateLanguage = voiceLanguage) => {
      if (!config) return
      stopActivePreview?.()
      stop()
      stopActivePreview = stop
      setPreviewVoiceId(candidateVoiceId ?? "")
      const generation = generationRef.current

      if (config.defaultEngine.kind === "system") {
        setState("playing")
        systemActiveRef.current = true
        Speech.speak(text, {
          language:
            candidateLanguage ||
            (previewLanguage === "und" ? undefined : previewLanguage),
          voice: candidateVoiceId || undefined,
          rate: config.playback.speed,
          pitch: config.playback.pitch,
          onDone: () => {
            if (generationRef.current === generation) setState("idle")
          },
          onStopped: () => {
            if (generationRef.current === generation) setState("idle")
          },
          onError: (error) => {
            if (generationRef.current !== generation) return
            setState("idle")
            onError(error)
          },
        })
        return
      }

      if (!selectedProfile || !candidateVoiceId) return
      const controller = new AbortController()
      abortRef.current = controller
      setState("generating")
      try {
        const artifact = await synthesizeTts(
          {
            profileId: selectedProfile.id,
            text,
            language: previewLanguage,
            voiceId: candidateVoiceId,
            instructions,
            speed: Math.min(
              config.playback.speed,
              ttsMaximumPlaybackSpeed(selectedProfile),
            ),
            acceptedMimeTypes: PREVIEW_MIME_TYPES,
            cachePolicy: "bypass",
          },
          { signal: controller.signal },
        )
        if (controller.signal.aborted || generationRef.current !== generation) {
          return
        }
        abortRef.current = null
        setState("loading")
        await loadAndPlay(toFileUri(artifact.path), artifact.playbackRate ?? 1)
      } catch (error) {
        if (controller.signal.aborted || generationRef.current !== generation) {
          return
        }
        abortRef.current = null
        setState("idle")
        onError(error)
      }
    },
    [
      config,
      instructions,
      loadAndPlay,
      onError,
      previewLanguage,
      selectedProfile,
      stop,
      text,
      voiceId,
      voiceLanguage,
    ],
  )

  return {
    canPreview:
      config?.defaultEngine.kind === "system" ||
      Boolean(selectedProfile && voiceId),
    start,
    previewVoiceId: state === "idle" ? null : previewVoiceId,
    state,
    stop,
  }
}
