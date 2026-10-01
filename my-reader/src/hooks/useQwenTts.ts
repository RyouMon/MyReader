import { useEffect, useState } from "react"
import { api, formatApiError } from "@/lib/tauri-api"
import type {
  QwenTtsModelDto,
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
    ? result.voices
    : (profile?.options.voices ?? []).map((id) => ({
        id,
        name: id,
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
        if (active) setError(formatApiError(cause))
      })
    return () => {
      active = false
    }
  }, [enabled])
  return { presets, error }
}

export function useQwenTtsModels(enabled: boolean, endpoint: string) {
  const [result, setResult] = useState<{
    endpoint: string
    models: QwenTtsModelDto[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let active = true
    void api
      .listQwenTtsModels(endpoint)
      .then((value) => {
        if (active) {
          setResult({ endpoint, models: value })
          setError(null)
        }
      })
      .catch((cause) => {
        if (active) setError(formatApiError(cause))
      })
    return () => {
      active = false
    }
  }, [enabled, endpoint])
  return { models: result?.endpoint === endpoint ? result.models : [], error }
}

export function useQwenTtsVoices(input: {
  enabled: boolean
  endpoint: string
  model: string
  profileId?: string
  credential?: string
}) {
  const { enabled, endpoint, model, profileId, credential } = input
  const [voices, setVoices] = useState<TtsVoiceDto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setVoices([])
    setError(null)
    setLoading(enabled)
    if (!enabled) return
    let active = true
    const timer = setTimeout(() => {
      void api
        .discoverQwenTtsVoices({
          endpoint,
          model,
          profileId: profileId || null,
          credential: credential || null,
        })
        .then((value) => {
          if (active) setVoices(value)
        })
        .catch((cause) => {
          if (active) setError(formatApiError(cause))
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 400)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [enabled, endpoint, model, profileId, credential])
  return { voices, loading, error }
}
