import { useCallback, useEffect, useRef, useState } from "react"
import { errorMessage } from "@/src/i18n/error-message"
import {
  previewTtsProvider,
  type UpsertMobileTtsProfileInput,
} from "@/src/services/core/tts"
import { toFileUri } from "@/src/services/fs/path"
import { usePreviewAudioPlayer } from "./use-preview-audio-player"

let stopActivePreview: (() => void) | undefined

export function useTtsVoicePreview(
  identity: string,
  onError?: (error: unknown) => boolean,
) {
  const [active, setActive] = useState<number | null>(null)
  const [state, setState] = useState<
    "idle" | "generating" | "loading" | "playing"
  >("idle")
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const resetUi = useCallback(() => {
    setActive(null)
    setState("idle")
  }, [])

  const handlePlaybackError = useCallback(
    (cause: unknown) => {
      resetUi()
      if (onErrorRef.current?.(cause)) return
      setError(errorMessage(cause))
    },
    [resetUi],
  )

  const handlePlaying = useCallback(() => {
    setState("playing")
  }, [])

  const { loadAndPlay, stop: stopAudio } = usePreviewAudioPlayer({
    onPlaying: handlePlaying,
    onFinish: resetUi,
    onError: handlePlaybackError,
  })

  const stop = useCallback(() => {
    request.current?.abort()
    request.current = null
    stopAudio()
    resetUi()
  }, [resetUi, stopAudio])

  useEffect(() => {
    void identity
    setError(null)
    return () => {
      stop()
      if (stopActivePreview === stop) stopActivePreview = undefined
    }
  }, [identity, stop])

  const play = async (
    index: number,
    input: UpsertMobileTtsProfileInput,
    text: string,
    voiceId: string,
  ) => {
    stopActivePreview?.()
    stopActivePreview = stop
    const controller = new AbortController()
    request.current = controller
    setActive(index)
    setState("generating")
    setError(null)
    try {
      const artifact = await previewTtsProvider(
        input,
        text,
        voiceId,
        controller.signal,
      )
      if (controller.signal.aborted) return
      request.current = null
      setState("loading")
      await loadAndPlay(toFileUri(artifact.path), artifact.playbackRate ?? 1)
    } catch (cause) {
      if (controller.signal.aborted) return
      stop()
      if (onErrorRef.current?.(cause)) return
      setError(errorMessage(cause))
    }
  }

  return { active, state, error, play, stop }
}
