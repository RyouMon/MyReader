// @ts-check
import { makeFB2 } from "../../vendor/foliate-js/fb2.js"
import { MOBI } from "../../vendor/foliate-js/mobi.js"
import { unzlibSync } from "../../vendor/foliate-js/vendor/fflate.js"
import { exportBook } from "./export.js"
import { archiveLinks, htmlBook } from "./html.js"

const root = new URL("../../../", import.meta.url)
/** @param {string} path @param {RequestInit} [options] */
async function request(path, options) {
  const response = await fetch(new URL(path, root), options)
  if (!response.ok)
    throw new Error((await response.text()) || "PUBLICATION_PREPARE_FAILED")
  return response
}

/** @param {import("./types").Archive} input @returns {Promise<import("./types").Book>} */
async function openBook(input) {
  const inputRoot = new URL("input/", root).href
  if (input.kind === "html") return htmlBook(input, inputRoot)
  const file = await (
    await request(
      "input/" + input.entry.split("/").map(encodeURIComponent).join("/"),
    )
  ).blob()
  if (input.kind === "fb2") return makeFB2(file)
  return new MOBI({ unzlib: unzlibSync }).open(file)
}

async function convert() {
  /** @type {import("./types").Archive} */
  const input = await (await request("description")).json()
  const book = await openBook(input)
  try {
    const manifest = await exportBook(
      book,
      async (name, blob) => {
        await request("output/" + name, { method: "PUT", body: blob })
      },
      archiveLinks(
        input.kind === "html" ? input.files : [],
        new URL("input/", root).href,
      ),
    )
    await request("finish", { method: "POST", body: JSON.stringify(manifest) })
  } finally {
    book.destroy?.()
  }
}

async function main() {
  let message = "ok"
  try {
    await convert()
  } catch (error) {
    message = error instanceof Error ? error.message : String(error)
    await request("abort", { method: "POST" }).catch(() => {})
  }
  // Completion is delivered only after Core has closed and published the cache.
  window.webkit?.messageHandlers?.readerFormat?.postMessage(message)
  window.ReaderFormat?.postMessage(message)
  if (window.parent !== window)
    window.parent.postMessage({ readerFormat: message }, "*")
}
void main()
