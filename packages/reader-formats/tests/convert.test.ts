import { Blob as NodeBlob } from "node:buffer"
import { readFile } from "node:fs/promises"
import { URL as NodeURL } from "node:url"
import { afterEach, expect, it, vi } from "vitest"
import type { Link } from "../src/foliate/types"

type Manifest = {
  metadata: { title: string }
  readingOrder: Link[]
  resources: Link[]
  toc: Link[]
}
const fetchOriginal = globalThis.fetch.bind(globalThis)
afterEach(() => {
  vi.unstubAllGlobals()
  delete window.webkit
})

async function convert(kind: string, files: Record<string, NodeBlob>) {
  vi.resetModules()
  vi.stubGlobal("CSS", {
    escape: (value: string) =>
      value.replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c),
  })
  vi.stubGlobal("Blob", NodeBlob)
  vi.stubGlobal("URL", NodeURL)
  const entries = new Map<string, Blob>()
  let manifest: Manifest | undefined
  let aborted = false
  const done = new Promise<string>((resolve) => {
    window.webkit = {
      messageHandlers: { readerFormat: { postMessage: resolve } },
    }
  })
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = new URL(url)
      if (["blob:", "data:"].includes(path.protocol)) return fetchOriginal(url)
      const input = path.pathname.split("/input/")[1]
      if (input !== undefined && files[input])
        return new Response(await files[input].arrayBuffer(), {
          headers: { "content-type": files[input].type },
        })
      if (path.pathname.endsWith("/description"))
        return Response.json({
          kind,
          entry: Object.keys(files)[0],
          files: Object.keys(files),
        })
      if (path.pathname.includes("/output/")) {
        entries.set(path.pathname.split("/").at(-1)!, init?.body as Blob)
        return new Response()
      }
      if (path.pathname.endsWith("/finish")) {
        manifest = JSON.parse(String(init?.body))
        return new Response()
      }
      if (path.pathname.endsWith("/abort")) {
        aborted = true
        return new Response()
      }
      throw new Error("Unexpected book request: " + path)
    }),
  )
  await import("../src/foliate/run.js")
  const result = await done
  return { result, manifest: manifest!, entries, aborted }
}

it("exports the real FB2 parser's pictures, notes, backlinks and stylesheet before destroying it", async () => {
  const data = await readFile(
    new NodeURL("./fixtures/ReaderFormats.fb2", import.meta.url),
  )
  const { result, manifest, entries } = await convert("fb2", {
    book: new NodeBlob([data]),
  })
  expect(result).toBe("ok")
  expect(manifest.metadata.title).toBe("Lantern Notes")
  expect(manifest.readingOrder).toHaveLength(3)
  const first = await entries.get(manifest.readingOrder[0].href)!.text()
  const notes = await entries.get(manifest.readingOrder[2].href)!.text()
  expect(first).toContain('href="chapter-0002.xhtml#note-one"')
  expect(notes).toContain('href="chapter-0000.xhtml#opening"')
  expect(first).not.toMatch(/(?:blob:|data:image)/)
  const doc = new DOMParser().parseFromString(first, "application/xhtml+xml")
  expect(doc.querySelector("parsererror")).toBeNull()
  expect(doc.querySelector("p")?.namespaceURI).toBe(
    "http://www.w3.org/1999/xhtml",
  )
  expect(entries.has(doc.querySelector("img")!.getAttribute("src")!)).toBe(true)
  expect(manifest.resources.map((r) => r.type)).toContain("text/css")
  expect(manifest.resources.find((r) => r.rel?.includes("cover"))?.type).toBe(
    "image/png",
  )
})

it("writes a self-contained HTML archive, including nested CSS fonts and SVG images", async () => {
  const { result, entries, manifest } = await convert("html", {
    "book/index.html": new NodeBlob([
      '<html><head><link rel="stylesheet" href="theme.css"/></head><body><h1>Opening</h1><a href="end.xhtml#last">Next</a><img src="art.svg"/><img src="https://example.invalid/no.png"/><script>bad()</script></body></html>',
    ]),
    "book/end.xhtml": new NodeBlob([
      '<html><body><p id="last">End</p></body></html>',
    ]),
    "book/theme.css": new NodeBlob([
      '@font-face {font-family:book;src:url("font.woff2")} body{font-family:book}',
    ]),
    "book/font.woff2": new NodeBlob(["wOF2 sample"]),
    "book/art.svg": new NodeBlob([
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>',
    ]),
  })
  expect(result).toBe("ok")
  const page = await entries.get(manifest.readingOrder[0].href)!.text()
  expect(page).toContain("chapter-0001.xhtml#last")
  expect(page).not.toMatch(/<script|example.invalid/)
  const css = await entries
    .get(manifest.resources.find((r) => r.type === "text/css")!.href)!
    .text()
  expect(css).toContain(
    manifest.resources.find((r) => r.type === "font/woff2")!.href,
  )
  expect(manifest.resources.some((r) => r.type === "image/svg+xml")).toBe(true)
})

it("closes failed parser sessions without publishing an incomplete manifest", async () => {
  const res = await convert("mobi", { book: new NodeBlob(["not a book"]) })
  expect(res.result).not.toBe("ok")
  expect(res.aborted).toBe(true)
  expect(res.manifest).toBeUndefined()
})

it.each([
  "Lantern.mobi",
  "Lantern.azw3",
  "Combo.mobi",
])("exports %s through the pinned Kindle parser", async (name) => {
  const data = await readFile(
    new NodeURL("./fixtures/" + name, import.meta.url),
  )
  const { result, manifest, entries } = await convert("mobi", {
    book: new NodeBlob([data]),
  })
  expect(result).toBe("ok")
  expect(manifest.readingOrder.length).toBeGreaterThan(1)
  const pages = await Promise.all(
    manifest.readingOrder.map((link) => entries.get(link.href)!.text()),
  )
  expect(pages.join(" ")).toContain("lantern glowed")
  expect(pages.join(" ")).not.toMatch(
    /(?:href|src)="(?:blob:|kindle:|filepos:)/,
  )
  expect(manifest.toc.some((link) => link.href.startsWith("chapter-"))).toBe(
    true,
  )
  expect(
    manifest.resources.some((link) => link.type?.startsWith("image/")),
  ).toBe(true)
  if (name !== "Lantern.mobi")
    expect(
      manifest.resources.some((link) => link.type?.startsWith("font/")),
    ).toBe(true)
})
