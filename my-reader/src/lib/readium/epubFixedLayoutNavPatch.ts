import type { EpubNavigator } from "@readium/navigator"
import type { Link, Locator } from "@readium/shared"

type EpubNavigatorRuntime = {
  changeResource(relative: number): Promise<boolean>
  listeners: { positionChanged: (locator: Locator) => void }
}

/**
 * Patches an `EpubNavigator` instance so fixed-layout navigation emits stable locator changes.
 *
 * Upstream Readium calls `changeResource` without awaiting; `resizeHandler` or a
 * second navigation can interleave before `apply()` finishes, and `first_visible_locator`
 * may merge iframe progression into a stale `href`, so persisted progression can move
 * while the visible slide does not.
 */
export function patchEpubNavigatorFixedLayoutGoNav(nav: EpubNavigator): void {
  const n = nav as unknown as EpubNavigatorRuntime
  let queue = Promise.resolve()
  const originalGo = nav.go.bind(nav)

  const enqueue = (relative: 1 | -1, cb: (ok: boolean) => void) => {
    queue = queue.then(async () => {
      try {
        const ok = await n.changeResource(relative)
        if (ok) {
          n.listeners.positionChanged(nav.currentLocator)
        }
        cb(ok)
      } catch (err) {
        console.error("[patchEpubNavigatorFixedLayoutGoNav]", err)
        cb(false)
      }
    })
  }

  nav.goForward = (_animated, cb) => {
    enqueue(1, cb)
  }
  nav.goBackward = (_animated, cb) => {
    enqueue(-1, cb)
  }
  nav.go = (locator, animated, cb) => {
    originalGo(locator, animated, (ok) => {
      if (ok) {
        n.listeners.positionChanged(nav.currentLocator)
      }
      cb(ok)
    })
  }
  nav.goLink = (link: Link, animated, cb) => {
    nav.go(link.locator, animated, cb)
  }
}
