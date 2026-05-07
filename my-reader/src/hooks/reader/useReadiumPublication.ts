import { useCallback, useEffect, useRef, useState } from "react"
import { Publication, Manifest } from "@readium/shared"

import { buildReadiumManifest } from "@/lib/readium/epubManifest"
import { TauriFetcher } from "@/lib/readium/tauriFetcher"

interface UseReadiumPublicationOptions {
  /** Tauri asset URL of the extracted EPUB directory (`convertFileSrc` result). */
  assetBaseUrl: string | null
  enabled: boolean
}

interface UseReadiumPublicationResult {
  publication: Publication | null
  loading: boolean
  error: string | null
}

/**
 * Load a Readium Publication from an extracted EPUB directory.
 * This replaces the old foliate-js based EpubParser for desktop.
 */
export function useReadiumPublication({
  assetBaseUrl,
  enabled,
}: UseReadiumPublicationOptions): UseReadiumPublicationResult {
  const [publication, setPublication] = useState<Publication | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeRequestRef = useRef(0)

  const load = useCallback(async () => {
    if (!assetBaseUrl) {
      setPublication(null)
      setError(null)
      return
    }

    const requestId = ++activeRequestRef.current
    setLoading(true)
    setError(null)

    try {
      const result = await buildReadiumManifest(assetBaseUrl)
      if (requestId !== activeRequestRef.current) return

      if (!result) {
        setError("Failed to build Readium manifest from EPUB")
        setPublication(null)
        return
      }

      const manifest = Manifest.deserialize(result.manifest)
      if (!manifest) {
        setError("Failed to deserialize Readium manifest")
        setPublication(null)
        return
      }

      const pub = new Publication({
        manifest,
        fetcher: new TauriFetcher(result.baseUrl),
      })

      setPublication(pub)
      console.info("[useReadiumPublication] Publication loaded:", {
        title: pub.metadata.title,
        readingOrderCount: pub.readingOrder.items.length,
        tocCount: pub.toc?.items.length ?? 0,
      })
    } catch (e) {
      if (requestId !== activeRequestRef.current) return
      console.error("[useReadiumPublication] Failed to load publication:", e)
      setError(String(e))
      setPublication(null)
    } finally {
      if (requestId === activeRequestRef.current) {
        setLoading(false)
      }
    }
  }, [assetBaseUrl])

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
