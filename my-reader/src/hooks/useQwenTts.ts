import { useEffect, useState } from "react"
import { api } from "@/lib/tauri-api"
import type { TtsProviderProfileDto, TtsVoiceDto } from "@/lib/tauri-specta"

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
        language: "mul",
        gender: null,
      }))
}
