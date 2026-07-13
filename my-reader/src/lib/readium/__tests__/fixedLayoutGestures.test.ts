import { describe, expect, it } from "vitest"
import {
  consumeWheelPageTurn,
  createWheelPageTurnState,
  wheelZoomFactor,
  zoomAtPoint,
} from "../fixedLayoutGestures"

describe("fixedLayoutGestures", () => {
  it("should keep the content under the pointer fixed when zooming", () => {
    const next = zoomAtPoint(
      { scale: 1, offsetX: 0, offsetY: 0 },
      2,
      { x: 200, y: 100 },
      { width: 1000, height: 800 },
      1,
      4,
    )

    expect(next).toEqual({ scale: 2, offsetX: -200, offsetY: -100 })
  })

  it("should return a bounded zoom factor when the wheel is modified", () => {
    expect(
      wheelZoomFactor(
        {
          clientX: 0,
          clientY: 0,
          ctrlKey: true,
          metaKey: false,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
          deltaX: 0,
          deltaY: -100,
          deltaZ: 0,
          timeStamp: 0,
        },
        { width: 1000, height: 800 },
      ),
    ).toBe(1.25)
  })

  it("should turn only once when wheel deltas belong to one gesture", () => {
    const state = createWheelPageTurnState()
    const viewport = { width: 1000, height: 800 }
    const input = {
      clientX: 0,
      clientY: 0,
      ctrlKey: false,
      metaKey: false,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaX: 0,
      deltaZ: 0,
    }

    expect(
      consumeWheelPageTurn(
        state,
        { ...input, deltaY: 45, timeStamp: 10 },
        viewport,
      ),
    ).toBeNull()
    expect(
      consumeWheelPageTurn(
        state,
        { ...input, deltaY: 45, timeStamp: 20 },
        viewport,
      ),
    ).toEqual({ axis: "y", direction: 1 })
    expect(
      consumeWheelPageTurn(
        state,
        { ...input, deltaY: 200, timeStamp: 30 },
        viewport,
      ),
    ).toBeNull()
  })

  it("should unlock page turning when the wheel gesture pauses", () => {
    const state = createWheelPageTurnState()
    const viewport = { width: 1000, height: 800 }
    const input = {
      clientX: 0,
      clientY: 0,
      ctrlKey: false,
      metaKey: false,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaX: 0,
      deltaY: 100,
      deltaZ: 0,
    }

    expect(
      consumeWheelPageTurn(state, { ...input, timeStamp: 10 }, viewport),
    ).toEqual({ axis: "y", direction: 1 })
    expect(
      consumeWheelPageTurn(state, { ...input, timeStamp: 250 }, viewport),
    ).toEqual({ axis: "y", direction: 1 })
  })
})
