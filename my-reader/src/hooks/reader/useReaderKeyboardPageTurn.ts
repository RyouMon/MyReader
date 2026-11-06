import { useCallback, useEffect, useRef } from "react"

const INTERACTIVE_TARGETS =
  'input, textarea, select, [contenteditable], [role="slider"], [role="spinbutton"], [role="textbox"], [role="combobox"], [role="menu"], [role="listbox"], [role="tablist"], [role="radiogroup"], [role="dialog"], [role="alertdialog"]'

const OVERLAY_ROLES = new Set(["menu", "listbox", "dialog", "alertdialog"])

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false
  const interactive = (target as Element).closest(INTERACTIVE_TARGETS)
  if (!interactive) return false

  const role = interactive.getAttribute("role")
  if (
    role &&
    OVERLAY_ROLES.has(role) &&
    (interactive.getAttribute("data-state") === "closed" ||
      interactive.getAttribute("aria-hidden") === "true")
  ) {
    return false
  }
  return true
}

export function useReaderKeyboardPageTurn(
  enabled: boolean,
  isRtl: boolean,
  onPrevious: () => void,
  onNext: () => void,
): (event: KeyboardEvent) => void {
  const stateRef = useRef({ enabled, isRtl, onPrevious, onNext })
  useEffect(() => {
    stateRef.current = { enabled, isRtl, onPrevious, onNext }
  }, [enabled, isRtl, onNext, onPrevious])

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    const { enabled, isRtl, onPrevious, onNext } = stateRef.current
    if (
      !enabled ||
      event.defaultPrevented ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    )
      return

    if (isInteractiveTarget(event.target)) return

    let forward: boolean
    switch (event.key) {
      case "ArrowRight":
        forward = !isRtl
        break
      case "ArrowLeft":
        forward = isRtl
        break
      case "ArrowDown":
      case "PageDown":
        forward = true
        break
      case "ArrowUp":
      case "PageUp":
        forward = false
        break
      default:
        return
    }
    event.preventDefault()
    // Prevent the browser's default scroll even when a held key is ignored.
    if (event.repeat) return
    if (forward) onNext()
    else onPrevious()
  }, [])

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onKeyDown])

  return onKeyDown
}
