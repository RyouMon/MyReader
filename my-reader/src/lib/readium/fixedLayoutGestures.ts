export type FixedLayoutWheelInput = {
  clientX: number
  clientY: number
  ctrlKey: boolean
  metaKey: boolean
  deltaMode: number
  deltaX: number
  deltaY: number
  deltaZ: number
  timeStamp: number
}

export type ViewportSize = {
  width: number
  height: number
}

export type ZoomPanState = {
  scale: number
  offsetX: number
  offsetY: number
}

export type WheelPageTurnState = {
  amount: number
  axis: "x" | "y"
  lastTimestamp: number
  locked: boolean
}

export type WheelPageTurn = {
  axis: "x" | "y"
  direction: -1 | 1
}

const LINE_DELTA_PIXELS = 40
const PAGE_TURN_THRESHOLD = 80
const PAGE_TURN_GESTURE_GAP_MS = 180

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeWheelDeltas(
  input: FixedLayoutWheelInput,
  viewport: ViewportSize,
): { x: number; y: number } {
  if (input.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return {
      x: input.deltaX * LINE_DELTA_PIXELS,
      y: input.deltaY * LINE_DELTA_PIXELS,
    }
  }
  if (input.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return {
      x: input.deltaX * viewport.width,
      y: input.deltaY * viewport.height,
    }
  }
  return { x: input.deltaX, y: input.deltaY }
}

export function wheelZoomFactor(
  input: FixedLayoutWheelInput,
  viewport: ViewportSize,
): number | null {
  if (!input.ctrlKey && !input.metaKey) return null

  const { y } = normalizeWheelDeltas(input, viewport)
  if (y === 0) return null

  const pinchFactor = Math.exp(-input.deltaY / 100)
  const looksLikeTrackpadPinch =
    input.ctrlKey &&
    !input.metaKey &&
    input.deltaMode === WheelEvent.DOM_DELTA_PIXEL &&
    input.deltaX === 0 &&
    input.deltaZ === 0 &&
    Math.abs(pinchFactor - 1) < 0.05
  const factor = looksLikeTrackpadPinch ? pinchFactor : Math.exp(-y / 300)
  return clamp(factor, 0.8, 1.25)
}

export function zoomAtPoint(
  state: ZoomPanState,
  factor: number,
  pointFromViewportCenter: { x: number; y: number },
  viewport: ViewportSize,
  minScale: number,
  maxScale: number,
): ZoomPanState {
  const scale = clamp(state.scale * factor, minScale, maxScale)
  if (scale === state.scale) return state
  if (scale <= 1) return { scale, offsetX: 0, offsetY: 0 }

  const ratio = scale / state.scale
  const maxX = (viewport.width * (scale - 1)) / 2
  const maxY = (viewport.height * (scale - 1)) / 2
  return {
    scale,
    offsetX: clamp(
      pointFromViewportCenter.x -
        (pointFromViewportCenter.x - state.offsetX) * ratio,
      -maxX,
      maxX,
    ),
    offsetY: clamp(
      pointFromViewportCenter.y -
        (pointFromViewportCenter.y - state.offsetY) * ratio,
      -maxY,
      maxY,
    ),
  }
}

export function createWheelPageTurnState(): WheelPageTurnState {
  return {
    amount: 0,
    axis: "y",
    lastTimestamp: Number.NEGATIVE_INFINITY,
    locked: false,
  }
}

export function consumeWheelPageTurn(
  state: WheelPageTurnState,
  input: FixedLayoutWheelInput,
  viewport: ViewportSize,
): WheelPageTurn | null {
  const { x, y } = normalizeWheelDeltas(input, viewport)
  const axis = Math.abs(x) > Math.abs(y) ? "x" : "y"
  const delta = axis === "x" ? x : y
  if (delta === 0) return null

  if (input.timeStamp - state.lastTimestamp > PAGE_TURN_GESTURE_GAP_MS) {
    state.amount = 0
    state.locked = false
  }
  state.lastTimestamp = input.timeStamp
  if (state.locked) return null

  if (state.axis !== axis || state.amount > 0 !== delta > 0) {
    state.amount = 0
  }
  state.axis = axis
  state.amount += delta
  if (Math.abs(state.amount) < PAGE_TURN_THRESHOLD) return null

  state.locked = true
  return { axis, direction: state.amount > 0 ? 1 : -1 }
}
