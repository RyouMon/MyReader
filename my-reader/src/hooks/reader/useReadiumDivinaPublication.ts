import { Manifest, Publication } from "@readium/shared"
import { useCallback, useEffect, useRef, useState } from "react"
import { buildDivinaManifestJson } from "@/lib/readium/divinaManifest"
import { TauriFetcher } from "@/lib/readium/tauriFetcher"

interface UseReadiumDivinaPublicationOptions {
  /** Tauri asset URL of the extracted CBZ directory (`convertFileSrc`). Preferred over HTTP streamer. */
  extractedDirUrl: string | null
  bookTitle: string
  extractedEntries: string[]
  enabled: boolean
}

interface UseReadiumDivinaPublicationResult {
  publication: Publication | null
  loading: boolean
  error: string | null
}

export function useReadiumDivinaPublication({
  extractedDirUrl,
  bookTitle,
  extractedEntries,
  enabled,
}: UseReadiumDivinaPublicationOptions): UseReadiumDivinaPublicationResult {
  const [publication, setPublication] = useState<Publication | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeRequestRef = useRef(0)

  const load = useCallback(async () => {
    if (!extractedDirUrl) {
      setPublication(null)
      setError(null)
      return
    }

    const requestId = ++activeRequestRef.current
    setLoading(true)
    setError(null)

    try {
      const manifestRecord = buildDivinaManifestJson({
        contentBaseUrl: extractedDirUrl,
        title: bookTitle || "Comic",
        relativePaths: extractedEntries,
      })
      if (requestId !== activeRequestRef.current) return

      if (!manifestRecord) {
        setError("No image pages found in comic archive")
        setPublication(null)
        return
      }

      const manifest = Manifest.deserialize(manifestRecord)
      if (!manifest) {
        setError("Failed to deserialize DIVINA manifest")
        setPublication(null)
        return
      }

      const pub = new Publication({
        manifest,
        fetcher: new TauriFetcher(extractedDirUrl.replace(/\/?$/, "")),
      })

      setPublication(pub)
    } catch (e) {
      if (requestId !== activeRequestRef.current) return
      console.error("[useReadiumDivinaPublication]", e)
      setError(String(e))
      setPublication(null)
    } finally {
      if (requestId === activeRequestRef.current) {
        setLoading(false)
      }
    }
  }, [extractedDirUrl, bookTitle, extractedEntries])

  useEffect(() => {
    if (!enabled) {
      setPublication(null)
      setError(null)
      setLoading(false)
      return
    }
    load()
  }, [enabled, load])

  return { publication, loading, error }
}
