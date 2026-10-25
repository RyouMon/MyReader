import { useEffect, useState } from "react"
import { api } from "@/lib/tauri-api"
import { errorMessage } from "@/lib/error-presentation"
import type {
  QwenTtsPresetDto,
  TtsProviderProfileDto,
  TtsVoiceDto,
} from "@/lib/tauri-specta"

export function useProviderTtsVoices(profile?: TtsProviderProfileDto) {
  const id = profile?.kind === "qwen" ? profile.id : undefined
  const revision = profile?.revision
  const [result, setResult] = useState<{
    id: string
    revision: number
    voices: TtsVoiceDto[]
  } | null>(null)
  useEffect(() => {
    if (!id || revision == null) return
    let active = true
    void api
      .listTtsVoices(id)
      .then((voices) => {
        if (active) setResult({ id, revision, voices })
      })
      .catch(() => {
        if (active) setResult(null)
      })
    return () => {
      active = false
    }
  }, [id, revision])
  return result && result.id === id && result.revision === revision
    ? result.voices.map((voice) => ({
        ...voice,
        name: profile?.voiceNames?.[voice.id] || voice.name,
      }))
    : (profile?.options.voices ?? []).map((id) => ({
        id,
        name: profile?.voiceNames?.[id] || id,
        language: "mul",
        gender: null,
      }))
}

export function useQwenTtsPresets(enabled: boolean) {
  const [presets, setPresets] = useState<QwenTtsPresetDto[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let active = true
    void api
      .listQwenTtsPresets()
      .then((value) => {
        if (active) {
          setPresets(value)
          setError(null)
        }
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause))
      })
    return () => {
      active = false
    }
  }, [enabled])
  return { presets, error }
}
