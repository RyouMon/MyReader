import { type RefObject, useEffect, useRef } from "react"

type ReaderPointerPositionHandler = (clientX: number, clientY: number) => void

function iframeHostPoint(
  iframe: HTMLIFrameElement,
  frameWindow: Window,
  event: PointerEvent,
): { clientX: number; clientY: number } {
  const rect = iframe.getBoundingClientRect()
  const scaleX =
    frameWindow.innerWidth > 0 ? rect.width / frameWindow.innerWidth : 1
  const scaleY =
    frameWindow.innerHeight > 0 ? rect.height / frameWindow.innerHeight : 1
  return {
    clientX: rect.left + event.clientX * scaleX,
    clientY: rect.top + event.clientY * scaleY,
  }
}

/**
 * 将同源 Readium iframe 内的指针坐标映射回宿主阅读窗口。
 * Readium 会复用或替换 iframe，因此同时监听 load 与子树变化。
 */
export function useReaderIframePointerBridge(
  containerRef: RefObject<HTMLElement | null>,
  onPointerPosition: ReaderPointerPositionHandler,
): void {
  const onPointerPositionRef = useRef(onPointerPosition)

  useEffect(() => {
    onPointerPositionRef.current = onPointerPosition
  }, [onPointerPosition])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const iframeCleanups = new Map<HTMLIFrameElement, () => void>()

    const connect = (iframe: HTMLIFrameElement) => {
      if (iframeCleanups.has(iframe)) return

      let disconnectWindow: (() => void) | undefined
      const connectWindow = () => {
        disconnectWindow?.()
        disconnectWindow = undefined

        try {
          const frameWindow = iframe.contentWindow
          if (!frameWindow) return
          const onPointer = (event: PointerEvent) => {
            const point = iframeHostPoint(iframe, frameWindow, event)
            onPointerPositionRef.current(point.clientX, point.clientY)
          }
          frameWindow.addEventListener("pointerover", onPointer, {
            passive: true,
          })
          frameWindow.addEventListener("pointermove", onPointer, {
            passive: true,
          })
          disconnectWindow = () => {
            frameWindow.removeEventListener("pointerover", onPointer)
            frameWindow.removeEventListener("pointermove", onPointer)
          }
        } catch {
          // Readium resources are normally same-origin; ignore inaccessible frames.
        }
      }

      iframe.addEventListener("load", connectWindow)
      connectWindow()
      iframeCleanups.set(iframe, () => {
        iframe.removeEventListener("load", connectWindow)
        disconnectWindow?.()
      })
    }

    const disconnect = (iframe: HTMLIFrameElement) => {
      iframeCleanups.get(iframe)?.()
      iframeCleanups.delete(iframe)
    }

    const forEachIframe = (
      node: Node,
      callback: (iframe: HTMLIFrameElement) => void,
    ) => {
      if (
        node instanceof HTMLIFrameElement &&
        node.classList.contains("readium-navigator-iframe")
      ) {
        callback(node)
      }
      if (!(node instanceof Element)) return
      node
        .querySelectorAll<HTMLIFrameElement>(".readium-navigator-iframe")
        .forEach(callback)
    }

    container
      .querySelectorAll<HTMLIFrameElement>(".readium-navigator-iframe")
      .forEach(connect)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.removedNodes.forEach((node) => {
          forEachIframe(node, disconnect)
        })
        mutation.addedNodes.forEach((node) => {
          forEachIframe(node, connect)
        })
      }
    })
    observer.observe(container, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      iframeCleanups.forEach((cleanup) => {
        cleanup()
      })
      iframeCleanups.clear()
    }
  }, [containerRef])
}
