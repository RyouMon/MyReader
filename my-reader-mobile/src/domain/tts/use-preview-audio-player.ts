import { type AudioStatus, setAudioModeAsync, useAudioPlayer } from "expo-audio"
import { useCallback, useEffect, useMemo, useRef } from "react"

const PREVIEW_LOAD_TIMEOUT_MS = 10_000

type PlaybackPhase = "idle" | "loading" | "playing"

type UsePreviewAudioPlayerOptions = {
  onPlaying: () => void
  onFinish: () => void
  onError: (error: unknown) => void
}

/**
 * Manages local TTS preview playback on a single persistent `expo-audio` player.
 *
 * Keeps the `playbackStatusUpdate` listener attached before calling `player.replace(uri)`
 * so fast local files on iOS/Android cannot emit `readyToPlay` or `failed` before JS subscribes,
 * configures iOS playback audio mode for silent-switch audibility, and enforces a load timeout.
 */
export function usePreviewAudioPlayer({
  onPlaying,
  onFinish,
  onError,
}: UsePreviewAudioPlayerOptions) {
  const player = useAudioPlayer(null)
  const callbacksRef = useRef({ onPlaying, onFinish, onError })
  const phaseRef = useRef<PlaybackPhase>("idle")
  const tokenRef = useRef(0)
  const rateRef = useRef(1)
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    callbacksRef.current = { onPlaying, onFinish, onError }
  }, [onError, onFinish, onPlaying])

  const clearLoadTimer = useCallback(() => {
    if (loadTimerRef.current !== null) {
      clearTimeout(loadTimerRef.current)
      loadTimerRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    const wasActive = phaseRef.current !== "idle"
    tokenRef.current += 1
    phaseRef.current = "idle"
    clearLoadTimer()
    if (!wasActive) return
    try {
      player.pause?.()
    } catch {
      // Ignore pause errors when the player is already released.
    }
  }, [clearLoadTimer, player])

  useEffect(() => {
    const handleStatus = (status: Partial<AudioStatus>) => {
      const phase = phaseRef.current
      if (phase === "idle") return
      const token = tokenRef.current

      if (status.error) {
        clearLoadTimer()
        phaseRef.current = "idle"
        try {
          player.pause?.()
        } catch {
          // Ignore pause errors on playback failure.
        }
        callbacksRef.current.onError(status.error)
        return
      }

      if (
        phase === "loading" &&
        status.isLoaded &&
        status.playbackState !== "ended"
      ) {
        clearLoadTimer()
        phaseRef.current = "playing"
        try {
          player.setPlaybackRate(rateRef.current)
          player.play()
          callbacksRef.current.onPlaying()
        } catch (cause) {
          if (tokenRef.current === token) {
            phaseRef.current = "idle"
            callbacksRef.current.onError(cause)
          }
        }
        return
      }

      if (phase === "playing" && status.didJustFinish) {
        clearLoadTimer()
        phaseRef.current = "idle"
        callbacksRef.current.onFinish()
      }
    }

    const subscription = player.addListener?.(
      "playbackStatusUpdate",
      handleStatus,
    )
    return () => {
      clearLoadTimer()
      subscription?.remove()
    }
  }, [clearLoadTimer, player])

  useEffect(() => stop, [stop])

  const loadAndPlay = useCallback(
    async (uri: string, playbackRate = 1) => {
      const wasPlaying = phaseRef.current === "playing"
      const token = ++tokenRef.current
      clearLoadTimer()
      rateRef.current = playbackRate
      phaseRef.current = "loading"

      try {
        await setAudioModeAsync?.({
          playsInSilentMode: true,
          interruptionMode: "doNotMix",
        })
      } catch {
        // Continue playback if platform audio mode configuration fails.
      }

      if (tokenRef.current !== token || phaseRef.current !== "loading") return

      try {
        if (wasPlaying) player.pause?.()
        player.replace(uri)
      } catch (cause) {
        if (tokenRef.current === token) {
          phaseRef.current = "idle"
          callbacksRef.current.onError(cause)
        }
        return
      }

      if (tokenRef.current !== token || phaseRef.current !== "loading") return

      loadTimerRef.current = setTimeout(() => {
        if (tokenRef.current !== token || phaseRef.current !== "loading") {
          return
        }
        phaseRef.current = "idle"
        try {
          player.pause?.()
        } catch {
          // Ignore pause failures on load timeout.
        }
        callbacksRef.current.onError(new Error("TTS_AUDIO_LOAD_TIMEOUT"))
      }, PREVIEW_LOAD_TIMEOUT_MS)
    },
    [clearLoadTimer, player],
  )

  return useMemo(() => ({ loadAndPlay, stop }), [loadAndPlay, stop])
}
