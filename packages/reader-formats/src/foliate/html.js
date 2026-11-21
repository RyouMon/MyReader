// @ts-check
/** Only addresses explicitly present in the supplied archive can resolve.
 * @param {string[]} files @param {string} inputRoot */
export function archiveLinks(files, inputRoot) {
  const allowed = new Set(
    files.map(
      (name) =>
        new URL(name.split("/").map(encodeURIComponent).join("/"), inputRoot)
          .href,
    ),
  )
  /** @param {string} ref @param {string} base */
  return (ref, base) => {
    try {
      const target = new URL(ref, base)
      return allowed.has(target.href.split("#")[0]) ? target.href : null
    } catch {
      return null
    }
  }
}

/** @param {import("./types").Archive} input @param {string} root */
export function htmlBook(input, root) {
  const pages = [
    input.entry,
    ...input.files.filter(
      (path) => path !== input.entry && /\.(?:html?|xhtml)$/i.test(path),
    ),
  ]
  const urls = pages.map(
    (name) =>
      new URL(name.split("/").map(encodeURIComponent).join("/"), root).href,
  )
  return {
    sections: urls.map((url) => ({ load: () => url })),
    /** @param {string} href */
    resolveHref(href) {
      const [path, id] = href.split("#")
      const index = urls.indexOf(path)
      return {
        index,
        /** @param {Document} doc */ anchor: (/** @type {Document} */ doc) =>
          doc.getElementById(decodeURIComponent(id ?? "")),
      }
    },
  }
}
