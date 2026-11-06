import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useReaderIframePointerBridge } from "../useReaderIframePointerBridge"
import { useReaderKeyboardPageTurn } from "../useReaderKeyboardPageTurn"

describe("useReaderKeyboardPageTurn", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mount(enabled = true, isRtl = false) {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    const hook = renderHook(
      ({ active }) =>
        useReaderKeyboardPageTurn(active, isRtl, onPrevious, onNext),
      { initialProps: { active: enabled } },
    )
    return { ...hook, onPrevious, onNext }
  }

  function key(
    keyName: string,
    init: KeyboardEventInit = {},
    target: EventTarget = window,
  ) {
    const event = new KeyboardEvent("keydown", {
      key: keyName,
      bubbles: true,
      cancelable: true,
      ...init,
    })
    target.dispatchEvent(event)
    return event
  }

  it.each([
    ["ArrowRight", "next"],
    ["ArrowDown", "next"],
    ["PageDown", "next"],
    ["ArrowLeft", "previous"],
    ["ArrowUp", "previous"],
    ["PageUp", "previous"],
  ])("turns %s in the expected direction for LTR", (keyName, action) => {
    const { onPrevious, onNext } = mount()
    const event = key(keyName)
    expect(event.defaultPrevented).toBe(true)
    expect(action === "next" ? onNext : onPrevious).toHaveBeenCalledTimes(1)
    expect(action === "next" ? onPrevious : onNext).not.toHaveBeenCalled()
  })

  it("reverses horizontal arrows for RTL while keeping vertical paging stable", () => {
    const { onPrevious, onNext } = mount(true, true)
    key("ArrowRight")
    key("ArrowLeft")
    key("ArrowDown")
    key("ArrowUp")
    key("PageDown")
    key("PageUp")
    expect(onPrevious).toHaveBeenCalledTimes(3)
    expect(onNext).toHaveBeenCalledTimes(3)
  })

  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { isComposing: true },
  ])("leaves shortcuts and composition alone: %j", (init) => {
    const { onPrevious, onNext } = mount()
    const event = key("PageDown", init)
    expect(event.defaultPrevented).toBe(false)
    expect(onPrevious).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it("prevents native scrolling without queuing auto-repeated page turns", () => {
    const { onNext, onPrevious } = mount()
    key("PageDown")
    expect(key("PageDown", { repeat: true }).defaultPrevented).toBe(true)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrevious).not.toHaveBeenCalled()
  })

  it("respects cancelled events, unrelated keys and listener cleanup", () => {
    const { onNext, unmount } = mount()
    const event = new KeyboardEvent("keydown", {
      key: "PageDown",
      cancelable: true,
    })
    event.preventDefault()
    window.dispatchEvent(event)
    expect(key("Enter").defaultPrevented).toBe(false)
    unmount()
    expect(key("PageDown").defaultPrevented).toBe(false)
    expect(onNext).not.toHaveBeenCalled()
  })

  it("leaves editing controls and disabled readers alone", () => {
    const { onPrevious, onNext, rerender } = mount()
    const input = document.createElement("input")
    document.body.append(input)
    input.focus()
    expect(key("ArrowDown", {}, input).defaultPrevented).toBe(false)
    rerender({ active: false })
    input.blur()
    expect(key("ArrowDown").defaultPrevented).toBe(false)
    expect(onPrevious).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
    input.remove()
  })

  it("keeps paging available after a menu returns focus to its toolbar button", () => {
    const { onNext } = mount()
    const button = document.createElement("button")
    document.body.append(button)
    expect(key("ArrowRight", {}, button).defaultPrevented).toBe(true)
    expect(onNext).toHaveBeenCalledTimes(1)
    button.remove()
  })

  it("handles replaced book frames once and respects their controls and current panel state", async () => {
    const container = document.createElement("div")
    const ref = { current: container }
    document.body.append(container)
    const onNext = vi.fn()
    const onPrevious = vi.fn()
    const { rerender, unmount } = renderHook(
      ({ enabled }) => {
        const onKeyDown = useReaderKeyboardPageTurn(
          enabled,
          false,
          onPrevious,
          onNext,
        )
        useReaderIframePointerBridge(ref, () => {}, undefined, onKeyDown)
      },
      { initialProps: { enabled: true } },
    )
    const iframe = document.createElement("iframe")
    iframe.className = "readium-navigator-iframe"
    await act(async () => {
      container.append(iframe)
    })
    const frameWindow = iframe.contentWindow!
    expect(
      key("ArrowDown", {}, frameWindow.document.body).defaultPrevented,
    ).toBe(true)
    iframe.dispatchEvent(new Event("load"))
    key("PageUp", {}, frameWindow.document.body)
    const field = frameWindow.document.createElement("div")
    field.innerHTML =
      '<div role="menu"><button><span>Action</span></button></div>'
    frameWindow.document.body.append(field)
    expect(
      key("ArrowDown", {}, field.querySelector("span")!).defaultPrevented,
    ).toBe(false)
    field.setAttribute("contenteditable", "true")
    expect(key("ArrowDown", {}, field).defaultPrevented).toBe(false)
    rerender({ enabled: false })
    expect(
      key("ArrowDown", {}, frameWindow.document.body).defaultPrevented,
    ).toBe(false)
    rerender({ enabled: true })
    await act(async () => {
      iframe.remove()
    })
    expect(key("ArrowDown", {}, frameWindow).defaultPrevented).toBe(false)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrevious).toHaveBeenCalledTimes(1)
    unmount()
    container.remove()
  })
})
