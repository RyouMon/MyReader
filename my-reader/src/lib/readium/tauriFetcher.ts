import type { Fetcher, Link, Resource } from "@readium/shared"
import { convertFileSrc, isTauri } from "@tauri-apps/api/core"

class TauriResource implements Resource {
  private readonly url: string

  constructor(url: string) {
    this.url = url
  }

  close(): void {}

  async link(): Promise<Link> {
    throw new Error("Not implemented")
  }

  async read(): Promise<Uint8Array | undefined> {
    const res = await fetch(this.url)
    if (!res.ok) return undefined
    return new Uint8Array(await res.arrayBuffer())
  }

  async length(): Promise<number> {
    const res = await fetch(this.url, { method: "HEAD" })
    return Number(res.headers.get("content-length") ?? 0)
  }

  async readAsJSON(): Promise<unknown> {
    const res = await fetch(this.url)
    return res.json()
  }

  async readAsString(): Promise<string> {
    const res = await fetch(this.url)
    return res.text()
  }

  async readAsXML(): Promise<XMLDocument> {
    const text = await this.readAsString()
    return new DOMParser().parseFromString(text, "application/xml")
  }
}

function toFetchableUrl(path: string): string {
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("asset://")
  )
    return path
  if (isTauri()) return convertFileSrc(path)
  return path
}

/**
 * A Readium Fetcher that resolves resources using Tauri's asset protocol.
 * This allows Readium navigators to access local EPUB files in a Tauri app.
 */
export class TauriFetcher implements Fetcher {
  private readonly basePath: string

  constructor(basePath: string) {
    this.basePath = basePath.replace(/\/$/, "")
  }

  close(): void {}

  links(): Link[] {
    return []
  }

  get(link: Link): Resource {
    const href = link.href
    // If href is already a full URL, use it directly
    const url = href.includes(":")
      ? href
      : toFetchableUrl(`${this.basePath}/${href}`)
    return new TauriResource(url)
  }
}
