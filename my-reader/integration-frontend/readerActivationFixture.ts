import { EpubNavigator } from "@readium/navigator"
import {
  Link,
  Links,
  Locator,
  LocatorLocations,
  Manifest,
  Metadata,
  Publication,
  Resource,
} from "@readium/shared"

const link = new Link({ href: "chapter.xhtml", type: "application/xhtml+xml" })

class Chapter extends Resource {
  async link() {
    return link
  }
  async length() {
    return (await this.read()).length
  }
  async read() {
    return new TextEncoder().encode(`
      <html xmlns="http://www.w3.org/1999/xhtml">
        <head><style>p { break-before: column; }</style></head>
        <body><p id="target">Selected page.</p><p id="resume">Saved page.</p></body>
      </html>
    `)
  }
  close() {}
}

export async function exerciseDelayedActivation(command: "activate" | "focus") {
  const container = document.getElementById("reader-fixture")!
  const publication = new Publication({
    manifest: new Manifest({
      metadata: new Metadata({ title: "Delayed activation", language: ["en"] }),
      links: new Links([]),
      readingOrder: new Links([link]),
    }),
    fetcher: { links: () => [link], get: () => new Chapter(), close: () => {} },
  })
  const initial = new Locator({
    href: link.href,
    type: link.type!,
    locations: new LocatorLocations({ position: 1, progression: 0 }),
  })
  const navigator = new EpubNavigator(
    container,
    publication,
    {
      frameLoaded: () => {},
      positionChanged: () => {},
      tap: () => true,
      click: () => true,
      zoom: () => {},
      miscPointer: () => {},
      scroll: () => {},
      customEvent: () => {},
      handleLocator: () => false,
      textSelected: () => {},
      contentProtection: () => {},
      contextMenu: () => {},
      peripheral: () => {},
    },
    [initial],
    initial,
    { preferences: { columnCount: 1 }, defaults: {} },
  )
  try {
    await navigator.load()
    const frame = navigator._cframes[0]!
    await frame.hide()
    const comms = frame.msg!
    const send = comms.send.bind(comms)
    let release: (() => void) | undefined
    let positioned!: () => void
    const initialPosition = new Promise<void>((resolve) => {
      positioned = resolve
    })
    const ready = new Promise<void>((resolve) => {
      comms.send = (key, data, callback, ...rest) =>
        send(
          key,
          data,
          key === command
            ? (ok) => {
                release = () => callback?.(ok)
                resolve()
              }
            : key === "go_progression"
              ? (ok) => {
                  callback?.(ok)
                  positioned()
                }
              : callback,
          ...rest,
        )
    })
    const visible = (id: string) => {
      const rect = frame.iframe
        .contentDocument!.getElementById(id)!
        .getBoundingClientRect()
      return (
        rect.right > 0 && rect.left < frame.iframe.contentWindow!.innerWidth
      )
    }
    await frame.show(1)
    await ready
    // show() can reveal the frame before its asynchronous positioning completes.
    await initialPosition
    const restored = visible("resume")
    comms.send = send
    const target = initial.copyWithLocations({ fragments: ["target"] })
    const navigated = await new Promise<boolean>((resolve) =>
      navigator.go(target, false, resolve),
    )
    const before = visible("target")
    const lateProgressions: unknown[] = []
    comms.send = (key, data, ...rest) => {
      if (key === "go_progression") lateProgressions.push(data)
      return send(key, data, ...rest)
    }
    release!()
    // A message round trip drains any stale progression command sent by the ACK.
    await new Promise<void>((resolve) =>
      send("focus", undefined, () => resolve()),
    )
    return {
      restored,
      navigated,
      before,
      after: visible("target"),
      lateProgressions,
    }
  } finally {
    await navigator.destroy()
  }
}
