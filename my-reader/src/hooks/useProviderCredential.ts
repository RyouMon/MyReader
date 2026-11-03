import { useEffect, useState } from "react"
import { api } from "@/lib/tauri-api"
import { errorMessage } from "@/lib/error-presentation"

export function useProviderCredential(
  kind: "tts" | "llm",
  id: string | undefined,
  onLoad: (credential: string) => void,
) {
  const [loadedId, setLoadedId] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setLoadedId(undefined)
    setError(null)
    if (!id) return
    let active = true
    const load = kind === "tts" ? api.getTtsCredential : api.getLlmCredential
    void load(id)
      .then((value) => {
        if (!active) return
        onLoad(value ?? "")
        setLoadedId(id)
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause))
      })
    return () => {
      active = false
    }
  }, [kind, id, onLoad])
  return { loading: Boolean(id && loadedId !== id), error }
}
