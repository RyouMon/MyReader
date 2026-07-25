import type { DataSourceWebdav } from "@my-reader/tools/types/data-source"
import { canonicalRelativePath } from "../../fs/path"

type WebDavDataSource = DataSourceWebdav & { password: string }

function normalizeRemotePath(path: string) {
  const trimmed = path.trim()
  if (!trimmed || trimmed === "/") return ""
  return `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`
}

function normalizeHrefPath(href: string) {
  const trimmed = href.trim()
  if (!trimmed) return ""
  let pathname = trimmed
  try {
    pathname = new URL(trimmed).pathname
  } catch {
    pathname = trimmed
  }
  const plain = canonicalRelativePath(pathname)
  return plain ? `/${plain}` : "/"
}

function extractTagValue(xml: string, tag: string) {
  const match = xml.match(
    new RegExp(`<[^>]*${tag}[^>]*>([\\s\\S]*?)</[^>]*${tag}>`, "i"),
  )
  return match?.[1]?.trim() ?? ""
}

function decodeXml(text: string) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
}

function toRemoteEntryPath(
  source: WebDavDataSource,
  href: string,
  isDirectory: boolean,
) {
  const normalizedPath = normalizeHrefPath(href).replace(
    /\/+$/,
    isDirectory ? "/" : "",
  )
  const basePath = normalizeRemotePath(source.rootPath ?? "")
  const expectedPrefix = `${basePath}/`.replace(/\/+/g, "/")

  if (!normalizedPath) return ""

  if (!basePath) {
    return normalizedPath === "/"
      ? ""
      : normalizedPath.replace(/\/+$/, isDirectory ? "/" : "")
  }

  if (normalizedPath === basePath || normalizedPath === `${basePath}/`)
    return ""

  if (normalizedPath.startsWith(expectedPrefix)) {
    const relativePath = normalizedPath.slice(basePath.length)
    return normalizeRemotePath(relativePath).replace(
      /\/+$/,
      isDirectory ? "/" : "",
    )
  }

  return normalizeRemotePath(normalizedPath).replace(
    /\/+$/,
    isDirectory ? "/" : "",
  )
}

export function parseWebDavPropfind(source: WebDavDataSource, xml: string) {
  const responses =
    xml.match(/<[^>]*response[^>]*>[\s\S]*?<\/[^>]*response>/gi) ?? []
  return responses
    .map((chunk) => {
      const href = decodeXml(extractTagValue(chunk, "href"))
      const displayName = decodeXml(extractTagValue(chunk, "displayname"))
      const isDirectory = /<(?:[^>:]*:)?collection(?:\s[^>]*)?\s*\/?>/i.test(
        chunk,
      )
      const remotePath = toRemoteEntryPath(source, href, isDirectory)
      const fallbackName = remotePath.split("/").filter(Boolean).at(-1) ?? href
      return {
        href: remotePath,
        path: remotePath,
        name: displayName || fallbackName,
        isDirectory,
      }
    })
    .filter((entry) => entry.href)
}
