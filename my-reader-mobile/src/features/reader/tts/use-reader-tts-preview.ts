import { normalizeTtsLanguage } from "@my-reader/tools/reader-tts-language"
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio"
import * as Speech from "expo-speech"
import { useCallback, useEffect, useRef, useState } from "react"

import { type MobileTtsConfig, synthesizeTts } from "@/src/services/core/tts"
import { toFileUri } from "@/src/services/fs/path"

const PREVIEW_MIME_TYPES = [
  "audio/mpeg",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/wav",
]

export type ReaderTtsPreviewState =
  | "idle"
  | "generating"
  | "loading"
  | "playing"

export function useReaderTtsPreview({
  config,
  language,
  onError,
  text,
  voiceId,
  voiceLanguage,
}: {
  config: MobileTtsConfig | null
  language: string
  onError: (error: unknown) => void
  text: string
  voiceId?: string
  voiceLanguage?: string
}) {
  const previewLanguage = normalizeTtsLanguage(language) || "und"
  const selectedProfile =
    config?.defaultEngine.kind === "provider"
      ? config.profiles.find(
          (profile) => profile.id === config.defaultEngine.profileId,
        )
      : undefined
  const [state, setState] = useState<ReaderTtsPreviewState>("idle")
  const [source, setSource] = useState<string | null>(null)
  const player = useAudioPlayer(source)
  const status = useAudioPlayerStatus(player)
  const abortRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)

  const stop = useCallback(() => {
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    void Speech.stop()
    setSource(null)
    setState("idle")
  }, [])

  useEffect(
    () => () => {
      generationRef.current += 1
      abortRef.current?.abort()
      abortRef.current = null
      void Speech.stop()
    },
    [],
  )

  useEffect(() => {
    if ((state === "loading" || state === "playing") && status.error) {
      const error = status.error
      const timeout = setTimeout(() => {
        setSource(null)
        setState("idle")
        onError(error)
      }, 0)
      return () => clearTimeout(timeout)
    }
    if (state === "loading" && source && status.isLoaded) {
      const timeout = setTimeout(() => {
        try {
          player.play()
          setState("playing")
        } catch (error) {
          setSource(null)
          setState("idle")
          onError(error)
        }
      }, 0)
      return () => clearTimeout(timeout)
    }
    if (state === "playing" && status.didJustFinish) {
      const timeout = setTimeout(() => {
        setSource(null)
        setState("idle")
      }, 0)
      return () => clearTimeout(timeout)
    }
  }, [
    onError,
    player,
    source,
    state,
    status.didJustFinish,
    status.error,
    status.isLoaded,
  ])

  const start = useCallback(async () => {
    if (!config) return
    stop()
    const generation = generationRef.current

    if (config.defaultEngine.kind === "system") {
      setState("playing")
      Speech.speak(text, {
        language:
          voiceLanguage ||
          (previewLanguage === "und" ? undefined : previewLanguage),
        voice: voiceId,
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

    if (!selectedProfile || !voiceId) return
    const controller = new AbortController()
    abortRef.current = controller
    setState("generating")
    try {
      const artifact = await synthesizeTts(
        {
          profileId: selectedProfile.id,
          text,
          language: previewLanguage,
          voiceId,
          speed: config.playback.speed,
          acceptedMimeTypes: PREVIEW_MIME_TYPES,
          cachePolicy: "bypass",
        },
        { signal: controller.signal },
      )
      if (controller.signal.aborted || generationRef.current !== generation) {
        return
      }
      abortRef.current = null
      setSource(toFileUri(artifact.path))
      setState("loading")
    } catch (error) {
      if (controller.signal.aborted || generationRef.current !== generation) {
        return
      }
      abortRef.current = null
      setState("idle")
      onError(error)
    }
  }, [
    config,
    onError,
    previewLanguage,
    selectedProfile,
    stop,
    text,
    voiceId,
    voiceLanguage,
  ])

  return {
    canPreview:
      config?.defaultEngine.kind === "system" ||
      Boolean(selectedProfile && voiceId),
    start,
    state,
    stop,
  }
}
