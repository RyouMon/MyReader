// @ts-check
const mimeTypes = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "font/woff": "woff",
  "font/woff2": "woff2",
  "font/ttf": "ttf",
  "font/otf": "otf",
  "text/css": "css",
}

/** @param {Blob} blob @param {string} hint */
async function mediaType(blob, hint) {
  const declared = blob.type.split(";")[0]
  if (Object.hasOwn(mimeTypes, declared)) return declared
  const bytes = new Uint8Array(await blob.slice(0, 256).arrayBuffer())
  const sig = String.fromCharCode(...bytes.slice(0, 12))
  if (sig.startsWith("\x89PNG")) return "image/png"
  if (sig.startsWith("\xff\xd8\xff")) return "image/jpeg"
  if (sig.startsWith("GIF8")) return "image/gif"
  if (sig.endsWith("WEBP")) return "image/webp"
  if (sig.startsWith("wOF2")) return "font/woff2"
  if (sig.startsWith("wOFF")) return "font/woff"
  if (sig.startsWith("OTTO")) return "font/otf"
  if (sig.startsWith("\0\x01\0\0")) return "font/ttf"
  if (/<svg[\s>]/i.test(new TextDecoder().decode(bytes))) return "image/svg+xml"
  return hint
}

// Drop active elements and attributes before handing the document to a Navigator.
/** @param {Document} doc */
function stripActive(doc) {
  const safe =
    /^(?:id|class|lang|dir|title|alt|role|style|href|src|width|height|colspan|rowspan|align|valign|rel|type|name|start|value|viewBox|preserveAspectRatio|d|x|y|x1|x2|y1|y2|cx|cy|rx|ry|r|points|fill|stroke|transform|xmlns(?::.*)?|xml:lang|epub:type|xlink:href|aria-[\w-]+|data-foliate-id)$/i
  for (const node of doc.querySelectorAll("*")) {
    if (
      /^(?:script|iframe|frame|frameset|object|embed|base|form|input|button|textarea|meta|foreignobject|use|animate.*|set|audio|video|source|track|noscript|template)$/i.test(
        node.localName,
      )
    ) {
      node.remove()
      continue
    }
    for (const a of [...node.attributes])
      if (
        !safe.test(a.name) ||
        (/^(fill|stroke)$/i.test(a.name) && /url/i.test(a.value))
      )
        node.removeAttributeNode(a)
  }
}

/** @param {import("./types").Put} put @param {import("./types").Locate} locate */
export function resourceWriter(put, locate) {
  /** @type {Map<string,string>} */
  const mapped = new Map()
  /** @type {import("./types").Link[]} */
  const resources = []
  const local = /^(blob:|data:)/i
  /** @param {string} value @param {string} base @param {Set<string>} ancestors */
  async function css(value, base, ancestors) {
    // Reject escapes, comments, imports and image-set() which can load quoted URLs.
    const clean = value.replace(/\/\*[\s\S]*?\*\//g, "")
    if (
      /\\|@import|(?:image-set|image|cross-fade|paint|src|expression)\s*\(|-moz-binding|behavior\s*:/i.test(
        clean,
      )
    )
      return ""
    const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^()'"]*))\s*\)/gi
    let output = "",
      last = 0
    for (const m of clean.matchAll(pattern)) {
      const url = await save((m[1] ?? m[2] ?? m[3]).trim(), base, "", ancestors)
      output +=
        clean.slice(last, m.index) + (url ? 'url("' + url + '")' : "none")
      last = m.index + m[0].length
    }
    return output + clean.slice(last)
  }
  /** @param {string} ref @param {string} base @param {string} hint @param {Set<string>} ancestors @returns {Promise<string|null>} */
  async function save(ref, base, hint, ancestors) {
    const url = local.test(ref) ? ref : locate(ref, base)
    if (!url || ancestors.has(url)) return null
    const known = mapped.get(url)
    if (known) return known
    const response = await fetch(url)
    if (!response.ok) throw new Error("BOOK_RESOURCE_UNAVAILABLE")
    let blob = await response.blob()
    const type = await mediaType(blob, hint)
    const ext = mimeTypes[/** @type {keyof typeof mimeTypes} */ (type)]
    if (!ext) return null
    const next = new Set([...ancestors, url])
    if (type === "text/css")
      blob = new Blob([await css(await blob.text(), url, next)], { type })
    if (type === "image/svg+xml") {
      const svg = new DOMParser().parseFromString(
        await blob.text(),
        "image/svg+xml",
      )
      if (svg.documentElement.localName !== "svg") return null
      await cleanDocument(svg, url, next)
      blob = new Blob(
        [new XMLSerializer().serializeToString(svg.documentElement)],
        { type },
      )
    }
    const name =
      "asset-" + String(resources.length).padStart(5, "0") + "." + ext
    await put(name, blob)
    mapped.set(url, name)
    resources.push({ href: name, type })
    return name
  }
  /** @param {Document} doc @param {string} base @param {Set<string>} [ancestors] */
  async function cleanDocument(doc, base, ancestors = new Set()) {
    stripActive(doc)
    for (const el of doc.querySelectorAll("*")) {
      const tag = el.localName.toLowerCase()
      if (tag === "style")
        el.textContent = await css(el.textContent ?? "", base, ancestors)
      if (el.hasAttribute("style"))
        el.setAttribute(
          "style",
          await css(el.getAttribute("style") ?? "", base, ancestors),
        )
      for (const attr of [...el.attributes].filter((a) =>
        ["href", "src"].includes(a.localName),
      )) {
        if (tag === "a" && attr.name === "href") continue
        const stylesheet =
          tag === "link" &&
          el.getAttribute("rel")?.toLowerCase() === "stylesheet"
        const resource =
          stylesheet || tag === "img" || tag === "image"
            ? await save(
                attr.value,
                base,
                stylesheet ? "text/css" : "",
                ancestors,
              )
            : null
        if (resource) attr.value = resource
        else el.removeAttributeNode(attr)
      }
    }
  }
  return {
    resources,
    cleanDocument,
    /** @param {Blob} blob */ async cover(/** @type {Blob} */ blob) {
      const url = URL.createObjectURL(blob)
      try {
        const name = await save(url, "", "", new Set())
        const link = resources.find((r) => r.href === name)
        if (link) link.rel = ["cover"]
      } finally {
        URL.revokeObjectURL(url)
      }
    },
  }
}
