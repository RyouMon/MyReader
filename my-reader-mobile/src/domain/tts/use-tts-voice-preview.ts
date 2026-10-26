import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  previewTtsProvider,
  type UpsertMobileTtsProfileInput,
} from "@/src/services/core/tts"
import { toFileUri } from "@/src/services/fs/path"
import { errorMessage } from "@/src/i18n/error-message"

let stopActivePreview: (() => void) | undefined

export function useTtsVoicePreview(identity: string) {
  const [active, setActive] = useState<number | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [state, setState] = useState<
    "idle" | "generating" | "loading" | "playing"
  >("idle")
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const rate = useRef(1)
  const player = useAudioPlayer(source)
  const status = useAudioPlayerStatus(player)
  const stop = useCallback(() => {
    request.current?.abort()
    request.current = null
    setSource(null)
    setActive(null)
    setState("idle")
  }, [])
  useEffect(() => {
    void identity
    setError(null)
    return () => {
      stop()
      if (stopActivePreview === stop) stopActivePreview = undefined
    }
  }, [identity, stop])
  useEffect(() => {
    if ((state === "loading" || state === "playing") && status.error) {
      const timer = setTimeout(() => {
        stop()
        setError(errorMessage(status.error))
      }, 0)
      return () => clearTimeout(timer)
    }
    if (state === "loading" && source && status.isLoaded) {
      const timer = setTimeout(() => {
        try {
          player.setPlaybackRate(rate.current)
          player.play()
          setState("playing")
        } catch (cause) {
          stop()
          setError(errorMessage(cause))
        }
      }, 0)
      return () => clearTimeout(timer)
    }
    if (state === "playing" && status.didJustFinish) {
      const timer = setTimeout(stop, 0)
      return () => clearTimeout(timer)
    }
  }, [
    player,
    source,
    state,
    status.error,
    status.isLoaded,
    status.didJustFinish,
    stop,
  ])
  const play = async (
    index: number,
    input: UpsertMobileTtsProfileInput,
    text: string,
  ) => {
    stopActivePreview?.()
    stopActivePreview = stop
    const controller = new AbortController()
    request.current = controller
    setActive(index)
    setState("generating")
    setError(null)
    try {
      const artifact = await previewTtsProvider(input, text, controller.signal)
      if (controller.signal.aborted) return
      rate.current = artifact.playbackRate ?? 1
      setSource(toFileUri(artifact.path))
      setState("loading")
    } catch (cause) {
      if (controller.signal.aborted) return
      stop()
      setError(errorMessage(cause))
    }
  }
  return { active, state, error, play, stop }
}
