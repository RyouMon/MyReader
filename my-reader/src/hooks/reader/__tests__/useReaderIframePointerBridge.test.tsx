import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useReaderIframePointerBridge } from "../useReaderIframePointerBridge"

describe("useReaderIframePointerBridge", () => {
  it("forwards cancelable wheels after frame insertion and reload, then detaches", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    const ref = { current: container }
    const onPointerPosition = vi.fn()
    const onWheel = vi.fn((event: WheelEvent) => event.preventDefault())
    const replacement = vi.fn((event: WheelEvent) => event.preventDefault())
    const { rerender, unmount } = renderHook(
      ({ handler }) =>
        useReaderIframePointerBridge(ref, onPointerPosition, handler),
      { initialProps: { handler: onWheel } },
    )
    const iframe = document.createElement("iframe")
    iframe.className = "readium-navigator-iframe"
    const wrapper = document.createElement("div")
    wrapper.append(iframe)
    await act(async () => {
      container.append(wrapper)
    })
    const frameWindow = iframe.contentWindow!
    const dispatch = () => {
      const event = new WheelEvent("wheel", { cancelable: true, deltaY: 120 })
      frameWindow.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(dispatch()).toBe(true)
    expect(onWheel).toHaveBeenCalledTimes(1)
    iframe.dispatchEvent(new Event("load"))
    rerender({ handler: replacement })
    expect(dispatch()).toBe(true)
    expect(onWheel).toHaveBeenCalledTimes(1)
    expect(replacement).toHaveBeenCalledTimes(1)
    await act(async () => wrapper.remove())
    expect(dispatch()).toBe(false)
    expect(replacement).toHaveBeenCalledTimes(1)
    unmount()
    container.remove()
  })

  it("forwards keyboard events from the active reading frame", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    const iframe = document.createElement("iframe")
    iframe.className = "readium-navigator-iframe"
    container.append(iframe)
    const onKeyDown = vi.fn((event: KeyboardEvent) => event.preventDefault())
    const onPointerPosition = vi.fn()
    const { unmount } = renderHook(() =>
      useReaderIframePointerBridge(
        { current: container },
        onPointerPosition,
        undefined,
        onKeyDown,
      ),
    )

    const event = new KeyboardEvent("keydown", {
      key: "PageDown",
      cancelable: true,
    })
    iframe.contentWindow?.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(onKeyDown).toHaveBeenCalledTimes(1)

    unmount()
    container.remove()
  })

  it("should map iframe pointer coordinates into the host viewport", () => {
    const container = document.createElement("div")
    const iframe = document.createElement("iframe")
    iframe.className = "readium-navigator-iframe"
    container.appendChild(iframe)
    document.body.appendChild(container)

    const frameWindow = iframe.contentWindow
    expect(frameWindow).not.toBeNull()
    Object.defineProperty(frameWindow, "innerWidth", {
      configurable: true,
      value: 200,
    })
    Object.defineProperty(frameWindow, "innerHeight", {
      configurable: true,
      value: 100,
    })
    iframe.getBoundingClientRect = () =>
      ({
        x: 10,
        y: 20,
        top: 20,
        right: 410,
        bottom: 220,
        left: 10,
        width: 400,
        height: 200,
        toJSON: () => ({}),
      }) as DOMRect

    const onPointerPosition = vi.fn()
    renderHook(() =>
      useReaderIframePointerBridge({ current: container }, onPointerPosition),
    )

    frameWindow?.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 100,
        clientY: 50,
      }),
    )

    expect(onPointerPosition).toHaveBeenCalledWith(210, 120)
  })
})
