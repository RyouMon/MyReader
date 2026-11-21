/** Runs only the short-lived parser served by Core. Book content stays in its own origin. */
export function runPublicationParser(entry: string): Promise<void> {
  const url = new URL(entry)
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1")
    throw new Error("Invalid publication parser address")
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe")
    frame.hidden = true
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin")
    frame.referrerPolicy = "no-referrer"
    function finish(error?: string) {
      window.clearTimeout(timeout)
      window.removeEventListener("message", receive)
      frame.remove()
      if (error) reject(new Error(error))
      else resolve()
    }
    function receive(event: MessageEvent) {
      if (
        event.origin !== url.origin ||
        event.source !== frame.contentWindow ||
        typeof event.data?.readerFormat !== "string"
      )
        return
      finish(
        event.data.readerFormat === "ok" ? undefined : event.data.readerFormat,
      )
    }
    const timeout = window.setTimeout(
      () => finish("Publication preparation timed out"),
      180_000,
    )
    window.addEventListener("message", receive)
    frame.onerror = () => finish("Cannot open publication parser")
    frame.src = entry
    document.body.append(frame)
  })
}

export async function readPreparedManifest(baseUrl: string) {
  const href = baseUrl.replace(/\/$/, "") + "/manifest.json"
  const response = await fetch(href)
  if (!response.ok) throw new Error("Cannot open prepared publication manifest")
  const manifest = await response.json()
  return {
    baseUrl,
    manifest: {
      ...manifest,
      links: [{ href, rel: "self", type: "application/webpub+json" }],
    },
  }
}
