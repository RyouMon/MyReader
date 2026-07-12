import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useReaderIframePointerBridge } from "../useReaderIframePointerBridge"

describe("useReaderIframePointerBridge", () => {
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
