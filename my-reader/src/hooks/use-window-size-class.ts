import * as React from "react"

export type WindowSizeClass = "small" | "medium" | "large"

export const WINDOW_SIZE_BREAKPOINTS = {
  smallMax: 640,
  largeMin: 1008,
} as const

export function getWindowSizeClass(width: number): WindowSizeClass {
  if (width <= WINDOW_SIZE_BREAKPOINTS.smallMax) return "small"
  if (width < WINDOW_SIZE_BREAKPOINTS.largeMin) return "medium"
  return "large"
}

const smallQuery = `(max-width: ${WINDOW_SIZE_BREAKPOINTS.smallMax}px)`
const largeQuery = `(min-width: ${WINDOW_SIZE_BREAKPOINTS.largeMin}px)`

function subscribeWindowSizeClass(callback: () => void) {
  const small = window.matchMedia(smallQuery)
  const large = window.matchMedia(largeQuery)
  small.addEventListener("change", callback)
  large.addEventListener("change", callback)
  return () => {
    small.removeEventListener("change", callback)
    large.removeEventListener("change", callback)
  }
}

function getWindowSizeClassSnapshot() {
  return getWindowSizeClass(window.innerWidth)
}

function getServerWindowSizeClassSnapshot() {
  return "large" satisfies WindowSizeClass
}

export function useWindowSizeClass() {
  return React.useSyncExternalStore(
    subscribeWindowSizeClass,
    getWindowSizeClassSnapshot,
    getServerWindowSizeClassSnapshot,
  )
}
