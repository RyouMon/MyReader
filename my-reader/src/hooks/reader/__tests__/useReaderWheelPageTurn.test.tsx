import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useReaderIframePointerBridge } from "../useReaderIframePointerBridge"
import { useReaderWheelPageTurn } from "../useReaderWheelPageTurn"

describe("EPUB wheel page turns", () => {
  let timestamp = 0
  let container: HTMLDivElement
  let iframe: HTMLIFrameElement

  beforeEach(() => {
    timestamp = 0
    vi.spyOn(performance, "now").mockImplementation(() => timestamp)
    container = document.createElement("div")
    iframe = document.createElement("iframe")
    iframe.className = "readium-navigator-iframe"
    container.append(iframe)
    document.body.append(container)
    Object.defineProperty(container, "clientHeight", { value: 600 })
  })

  afterEach(() => {
    container.remove()
    vi.restoreAllMocks()
  })

  function mountReader(enabled = true) {
    const ref = { current: container }
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    const onPointer = vi.fn()
    const hook = renderHook(
      ({ enabled }) => {
        const onWheel = useReaderWheelPageTurn(ref, enabled, onPrevious, onNext)
        useReaderIframePointerBridge(ref, onPointer, onWheel)
      },
      { initialProps: { enabled } },
    )
    return { ...hook, onPrevious, onNext }
  }

  function wheel(target: EventTarget, init: WheelEventInit = {}, gap = 200) {
    timestamp += gap
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
      ...init,
    })
    target.dispatchEvent(event)
    return event
  }

  it("turns down forward and up backward from the page and its iframe", () => {
    const { onPrevious, onNext } = mountReader()
    expect(wheel(iframe.contentDocument!.body).defaultPrevented).toBe(true)
    expect(wheel(container, { deltaY: -120 }).defaultPrevented).toBe(true)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrevious).toHaveBeenCalledTimes(1)
  })

  it("accumulates small deltas and consumes inertia once across frame changes", () => {
    const { onNext } = mountReader()
    for (let i = 0; i < 12; i++) {
      wheel(
        i < 4 ? iframe.contentDocument!.body : container,
        { deltaY: 20 },
        30,
      )
    }
    expect(onNext).toHaveBeenCalledTimes(1)
    wheel(container)
    expect(onNext).toHaveBeenCalledTimes(2)
  })

  it.each([
    { deltaMode: WheelEvent.DOM_DELTA_LINE, deltaY: 3 },
    { deltaMode: WheelEvent.DOM_DELTA_PAGE, deltaY: 1 },
  ])("supports wheel delta units $deltaMode", (init) => {
    const { onNext } = mountReader()
    wheel(iframe.contentDocument!.body, init)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { deltaX: 200, deltaY: 5 },
    { deltaY: 0 },
  ])("leaves modified or horizontal gestures alone: %j", (init) => {
    const { onNext, onPrevious } = mountReader()
    expect(wheel(iframe.contentDocument!.body, init).defaultPrevented).toBe(
      false,
    )
    expect(onNext).not.toHaveBeenCalled()
    expect(onPrevious).not.toHaveBeenCalled()
  })

  it("leaves continuous scrolling and panels alone and resets partial gestures", () => {
    const { onNext, rerender } = mountReader()
    wheel(container, { deltaY: 40 })
    rerender({ enabled: false })
    expect(wheel(iframe.contentDocument!.body).defaultPrevented).toBe(false)
    rerender({ enabled: true })
    wheel(container, { deltaY: 40 }, 10)
    expect(onNext).not.toHaveBeenCalled()
    wheel(container, { deltaY: 40 }, 10)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(wheel(document.body).defaultPrevented).toBe(false)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it("respects editable book content and events already handled by the book", () => {
    const { onNext } = mountReader()
    const textarea = iframe.contentDocument!.createElement("textarea")
    iframe.contentDocument!.body.append(textarea)
    expect(wheel(textarea).defaultPrevented).toBe(false)
    const cancel = (event: Event) => event.preventDefault()
    iframe.contentDocument!.body.addEventListener("wheel", cancel, {
      passive: false,
    })
    wheel(iframe.contentDocument!.body)
    expect(onNext).not.toHaveBeenCalled()
  })

  it("disconnects wheel listeners when the reader unmounts", () => {
    const { onNext, unmount } = mountReader()
    unmount()
    expect(wheel(container).defaultPrevented).toBe(false)
    expect(wheel(iframe.contentDocument!.body).defaultPrevented).toBe(false)
    expect(onNext).not.toHaveBeenCalled()
  })
})
