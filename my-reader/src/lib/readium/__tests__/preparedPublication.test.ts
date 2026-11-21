import { afterEach, expect, it, vi } from "vitest"
import {
  readPreparedManifest,
  runPublicationParser,
} from "../preparedPublication"

const origin = "http://127.0.0.1:58970"

afterEach(() => vi.unstubAllGlobals())

it("accepts the result only from the active parser and removes its frame", async () => {
  const result = runPublicationParser(origin + "/fixture/index.html")
  const frame = document.querySelector("iframe")!
  const message = (source: Window, sender: string, readerFormat: string) =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source,
        origin: sender,
        data: { readerFormat },
      }),
    )

  message(window, origin, "wrong window")
  message(frame.contentWindow!, "http://127.0.0.1:58971", "wrong origin")
  expect(frame.isConnected).toBe(true)
  message(frame.contentWindow!, origin, "ok")
  await result
  expect(frame.isConnected).toBe(false)
})

it("reports a parser failure and releases the frame for a later attempt", async () => {
  const result = runPublicationParser(origin + "/fixture/index.html")
  const frame = document.querySelector("iframe")!
  window.dispatchEvent(
    new MessageEvent("message", {
      origin,
      source: frame.contentWindow,
      data: { readerFormat: "Invalid book" },
    }),
  )
  await expect(result).rejects.toThrow("Invalid book")
  expect(frame.isConnected).toBe(false)
  expect(() => runPublicationParser("https://example.org/book")).toThrow()
})

it("opens cached resources relative to the manifest location", async () => {
  const base = "asset://localhost/cache/book/"
  const readingOrder = [
    { href: "chapter-0001.xhtml", type: "application/xhtml+xml" },
  ]
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ readingOrder }))
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
  vi.stubGlobal("fetch", fetch)
  const { manifest } = await readPreparedManifest(base)
  expect(fetch).toHaveBeenCalledWith(base + "manifest.json")
  expect(manifest.readingOrder).toEqual(readingOrder)
  expect(manifest.links[0]).toMatchObject({
    href: base + "manifest.json",
    rel: "self",
  })
  await expect(readPreparedManifest(base)).rejects.toThrow("manifest")
})
