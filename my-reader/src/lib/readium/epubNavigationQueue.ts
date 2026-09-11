import type { EpubNavigator } from "@readium/navigator"
import type { Link } from "@readium/shared"

const patchedNavigators = new WeakSet<EpubNavigator>()
const NAVIGATION_CALLBACK_TIMEOUT_MS = 1_500

type NavigationCallback = (ok: boolean) => void
type NavigationOperation = (done: NavigationCallback) => void

/** Prevents overlapping Readium frame-pool updates from competing for visibility. */
export function patchEpubNavigatorNavigationQueue(nav: EpubNavigator): void {
  if (patchedNavigators.has(nav)) return
  patchedNavigators.add(nav)

  const originalGo = nav.go.bind(nav)
  const originalGoForward = nav.goForward.bind(nav)
  const originalGoBackward = nav.goBackward.bind(nav)
  let queue = Promise.resolve()

  const enqueue = (
    operation: NavigationOperation,
    callback: NavigationCallback,
  ) => {
    queue = queue.then(
      () =>
        new Promise<void>((resolve) => {
          let completed = false
          let timeoutId: number | null = null
          const done = (ok: boolean) => {
            if (completed) return
            completed = true
            if (timeoutId !== null) window.clearTimeout(timeoutId)
            resolve()
            callback(ok)
          }
          timeoutId = window.setTimeout(
            () => done(false),
            NAVIGATION_CALLBACK_TIMEOUT_MS,
          )
          try {
            operation(done)
          } catch (error) {
            console.error("[patchEpubNavigatorNavigationQueue]", error)
            done(false)
          }
        }),
    )
  }

  nav.go = (locator, animated, callback) => {
    enqueue((done) => originalGo(locator, animated, done), callback)
  }
  nav.goForward = (animated, callback) => {
    enqueue((done) => originalGoForward(animated, done), callback)
  }
  nav.goBackward = (animated, callback) => {
    enqueue((done) => originalGoBackward(animated, done), callback)
  }
  nav.goLink = (link: Link, animated, callback) => {
    nav.go(link.locator, animated, callback)
  }
}
