import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { isMacPlatform, isWindowsPlatform } from "@/lib/platform"
import { imageSourceAtEvent, readerImagePayload } from "@/lib/reader-image"
import { api } from "@/lib/tauri-api"
import type { ReaderImageSource } from "@/types/reader"
import type { ReaderImageBook } from "@my-reader/tools/reader-image-export"

export function useReaderImageActions(
  root: HTMLElement | null,
  book: ReaderImageBook,
  position: number,
) {
  const { t } = useTranslation()
  const supported = isMacPlatform() || isWindowsPlatform()
  const [target, setTarget] = useState<{
    source: ReaderImageSource
    x: number
    y: number
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const run = useCallback(
    async (
      action: "copy" | "save" | "prepareShare",
      sources: () => Promise<ReaderImageSource[]>,
    ) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      try {
        const images = await sources()
        if (!images.length) throw new Error("READER_NOT_READY")
        if (images.some((image) => "capture" in image)) {
          root?.ownerDocument.documentElement.classList.add(
            "reader-image-capture",
          )
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          )
        }
        const results: string[] = []
        try {
          for (const image of images) {
            const payload = await readerImagePayload(image, book)
            const result = await api.readerImageAction(
              action,
              payload.name,
              payload.data,
              payload.capture,
            )
            if (result) results.push(result)
          }
        } finally {
          root?.ownerDocument.documentElement.classList.remove(
            "reader-image-capture",
          )
        }
        if (action === "prepareShare" && results.length)
          await api.shareReaderImages(results)
        else if (results.length)
          toast.success(
            t(action === "copy" ? "reader.imageCopied" : "reader.imageSaved"),
          )
      } catch (error) {
        console.error("Reader image action failed", error)
        toast.error(t("reader.imageActionFailed"))
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [t, root, book],
  )

  useEffect(() => {
    if (!root || !supported) return
    const documents = new Map<Document, EventListener>()
    const bind = (doc: Document, frame?: HTMLIFrameElement) => {
      if (documents.has(doc)) return
      const handler: EventListener = (event) => {
        if (!frame && !root.contains(event.target as Node)) return
        const mouse = event as MouseEvent
        const source = imageSourceAtEvent(mouse)
        if (!source) return
        mouse.preventDefault()
        const rect = frame?.getBoundingClientRect()
        setTarget({
          source: { ...source, position: source.position ?? position },
          x: mouse.clientX + (rect?.left ?? 0),
          y: mouse.clientY + (rect?.top ?? 0),
        })
      }
      doc.addEventListener("contextmenu", handler)
      documents.set(doc, handler)
    }
    const scan = () => {
      bind(root.ownerDocument)
      root.querySelectorAll("iframe").forEach((frame) => {
        try {
          if (frame.contentDocument) bind(frame.contentDocument, frame)
        } catch {
          /* Cross-origin content is not a publication resource. */
        }
      })
    }
    scan()
    root.addEventListener("load", scan, true)
    const observer = new MutationObserver(scan)
    observer.observe(root, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      root.removeEventListener("load", scan, true)
      documents.forEach((listener, doc) =>
        doc.removeEventListener("contextmenu", listener),
      )
    }
  }, [root, supported, position])
  return { supported, target, setTarget, busy, run }
}
