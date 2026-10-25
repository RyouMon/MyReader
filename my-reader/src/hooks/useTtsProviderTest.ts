import i18n from "@/i18n"
import { convertFileSrc, isTauri } from "@tauri-apps/api/core"
import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/tauri-api"
import { errorMessage } from "@/lib/error-presentation"
import type { UpsertTtsProviderInput } from "@/lib/tauri-specta"

let stopActivePreview: (() => void) | undefined

export function useTtsProviderTest(input: UpsertTtsProviderInput) {
  const [state, setState] = useState<
    "idle" | "testing" | "playing" | "success"
  >("idle")
  const [error, setError] = useState<string | null>(null)
  const request = useRef<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const identity = JSON.stringify(input)
  const stop = useCallback(() => {
    if (request.current) void api.cancelTtsSynthesis(request.current)
    request.current = null
    if (audio.current) {
      audio.current.onended = null
      audio.current.onerror = null
      audio.current.pause()
      audio.current = null
    }
    setState("idle")
  }, [])
  useEffect(() => {
    void identity
    setError(null)
    setState("idle")
    return () => {
      stop()
      if (stopActivePreview === stop) stopActivePreview = undefined
    }
  }, [identity, stop])

  const test = async (text: string) => {
    stopActivePreview?.()
    stopActivePreview = stop
    const id = `provider-test-${crypto.randomUUID()}`
    request.current = id
    setState("testing")
    setError(null)
    try {
      const artifact = await api.testTtsProvider(id, input, text)
      if (request.current !== id) return
      const player = new Audio(
        isTauri() ? convertFileSrc(artifact.path) : artifact.path,
      )
      audio.current = player
      player.onended = () => {
        if (audio.current !== player) return
        audio.current = null
        setState("success")
      }
      player.onerror = () => {
        if (audio.current !== player) return
        audio.current = null
        setState("idle")
        setError(i18n.t("providerEditor.playbackFailed"))
      }
      await player.play()
      if (audio.current === player) setState("playing")
    } catch (error) {
      if (request.current !== id) return
      stop()
      setError(errorMessage(error))
    } finally {
      if (request.current === id) request.current = null
    }
  }
  return { state, error, test, stop }
}
