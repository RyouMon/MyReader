import { describe, expect, it } from "vitest"
import { readerImageFileName } from "../src/reader-image-export"

describe("reader image filenames", () => {
  it("uses book metadata and the actual page while retaining the original extension", () => {
    expect(
      readerImageFileName({ title: "山海", authors: ["张三"] }, 12, "001.JPEG"),
    ).toBe("张三-山海-12.JPEG")
  })

  it.each([
    undefined,
    [],
    [""],
    ["Unknown"],
    ["未知作者"],
  ])("omits absent or placeholder authors: %j", (authors) => {
    expect(
      readerImageFileName({ title: "山海", authors }, 2, "image.png"),
    ).toBe("山海-2.png")
  })

  it("uses the MIME type for extensionless resources without changing their format", () => {
    expect(
      readerImageFileName(
        { title: "山海", authors: ["张三", "李四"] },
        8,
        "blob-id",
        "image/webp",
      ),
    ).toBe("张三、李四-山海-8.webp")
  })

  it("makes metadata safe for filesystem names", () => {
    expect(
      readerImageFileName(
        { title: "A/B: C", authors: ["D\\E"] },
        3,
        "page.png",
      ),
    ).toBe("D_E-A_B_ C-3.png")
  })
})
