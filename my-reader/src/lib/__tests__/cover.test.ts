import { describe, expect, it, vi } from "vitest"

/**
 * Override browser user agent before importing the module under test.
 */
function setUserAgentForModuleLoad(userAgent: string): void {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  })
}

/**
 * Decode base64url payload back to the original UTF-8 book path.
 */
function decodeBookPathFromCoverUrl(url: string): string {
  const encoded = url.split("/").at(-1)
  if (!encoded) {
    throw new Error(`invalid cover url: ${url}`)
  }
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/")
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

describe("buildCoverUrl", () => {
  it("在 Windows 环境输出 bookcover 的 http URL", async () => {
    setUserAgentForModuleLoad("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
    vi.resetModules()
    const { buildCoverUrl } = await import("../cover")

    const url = buildCoverUrl("lib-1", "Author/Book (1)")

    expect(url.startsWith("http://bookcover.localhost/lib-1/")).toBe(true)
    expect(decodeBookPathFromCoverUrl(url)).toBe("Author/Book (1)")
  })

  it("在非 Windows 环境输出 bookcover 自定义协议 URL", async () => {
    setUserAgentForModuleLoad("Mozilla/5.0 (X11; Linux x86_64)")
    vi.resetModules()
    const { buildCoverUrl } = await import("../cover")

    const url = buildCoverUrl("lib-2", "中文/章节.epub")

    expect(url.startsWith("bookcover://localhost/lib-2/")).toBe(true)
    expect(decodeBookPathFromCoverUrl(url)).toBe("中文/章节.epub")
  })
})
