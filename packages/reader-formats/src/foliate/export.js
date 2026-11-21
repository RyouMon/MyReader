// @ts-check
import { resourceWriter } from "./resources.js"

/** @param {number} index */
const chapter = (index) =>
  "chapter-" + String(index).padStart(4, "0") + ".xhtml"

/** @param {string} url */
async function loadDocument(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error("BOOK_CHAPTER_UNAVAILABLE")
  const text = await response.text()
  // Foliate has applied Kindle resource transforms to load(), including FONT and SVG.
  const xml = new DOMParser().parseFromString(text, "application/xhtml+xml")
  if (
    !xml.querySelector("parsererror") &&
    xml.documentElement.namespaceURI === "http://www.w3.org/1999/xhtml"
  )
    return xml
  return new DOMParser().parseFromString(text, "text/html")
}

/** @param {import("./types").Book} book @param {import("./types").Put} put @param {import("./types").Locate} [locate] */
export async function exportBook(book, put, locate = () => null) {
  if (!book.sections?.length || book.sections.length > 16384)
    throw new Error("INVALID_READING_ORDER")
  const writer = resourceWriter(put, locate)
  const pages = []
  for (const section of book.sections) {
    const url = await section.load()
    const doc = await loadDocument(url)
    pages.push({
      url,
      doc,
      title:
        section.title || doc.querySelector("h1,h2,title")?.textContent?.trim(),
    })
  }
  /** @type {{url:string,doc:Document,title?:string}[]} */
  const documents = pages
  const ids = new Map()
  for (const [index, { doc }] of documents.entries())
    for (const el of doc.querySelectorAll("[id]"))
      if (!ids.has(el.id)) ids.set(el.id, index)
  /** @param {string} href @param {number} [current] */
  async function resolve(href, current) {
    if (!href) return null
    if (href.startsWith("#")) {
      const id = decodeURIComponent(href.slice(1))
      const index =
        current !== undefined && documents[current].doc.getElementById(id)
          ? current
          : ids.get(id)
      if (index !== undefined)
        return chapter(index) + "#" + encodeURIComponent(id)
    }
    const archived =
      current === undefined ? null : locate(href, documents[current].url)
    if (
      !archived &&
      !/^(?:\d+(?:#\d+)?|filepos:\d+|kindle:pos:fid:\w+:off:\w+)$/i.test(href)
    )
      return null
    const result = await book.resolveHref?.(archived ?? href)
    if (!result || !documents[result.index]) return null
    const doc = documents[result.index].doc
    const target = result.anchor?.(doc)
    if (!target) return chapter(result.index)
    if (!target.id) {
      let n = Array.prototype.indexOf.call(doc.querySelectorAll("*"), target)
      while (doc.getElementById("reader-anchor-" + n)) n++
      target.id = "reader-anchor-" + n
    }
    return chapter(result.index) + "#" + encodeURIComponent(target.id)
  }
  /** @param {import("./types").Toc[]} items @returns {Promise<import("./types").Link[]>} */
  async function tocLinks(items) {
    const links = []
    for (const item of items) {
      const href = await resolve(item.href)
      if (href)
        links.push({
          href,
          title: item.label,
          children: item.subitems?.length
            ? await tocLinks(item.subitems)
            : undefined,
        })
    }
    return links
  }
  const toc = await tocLinks(book.toc ?? [])
  // Resolve every target before serializing any chapter, including backward references.
  for (const [i, { doc }] of documents.entries())
    for (const link of doc.querySelectorAll("a[href]")) {
      const href = await resolve(link.getAttribute("href") ?? "", i)
      if (href) link.setAttribute("href", href)
      else link.removeAttribute("href")
    }
  const readingOrder = []
  for (const [i, page] of documents.entries()) {
    await writer.cleanDocument(page.doc, page.url)
    const href = chapter(i)
    await put(
      href,
      new Blob(
        [new XMLSerializer().serializeToString(page.doc.documentElement)],
        { type: "application/xhtml+xml" },
      ),
    )
    readingOrder.push({
      href,
      type: "application/xhtml+xml",
      title: page.title,
    })
  }
  const cover = await book.getCover?.()
  if (cover) await writer.cover(cover)
  const { title, author, language } = book.metadata ?? {}
  return {
    metadata: { title, author, language },
    readingOrder,
    resources: writer.resources,
    toc: toc.length ? toc : readingOrder,
  }
}
