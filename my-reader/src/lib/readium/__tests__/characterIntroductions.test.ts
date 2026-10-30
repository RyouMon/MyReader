import { describe, expect, it, vi } from "vitest"
import { EpubSearchService } from "../epubSearch"
import { findCharacterIntroductions } from "../characterIntroductions"

describe("character introductions", () => {
  it("uses reader search locators and limits context to the introduction section", async () => {
    const resources = [
      {
        href: "book.xhtml",
        type: "application/xhtml+xml",
        html: '<body><h1>目录</h1><nav><p>人物介绍</p></nav><h1 id="cast">人物介绍</h1><p>陈默：老师。</p><p>林岚：旅人。</p><h1>第一章</h1><p>不应发送给 AI 的正文。</p></body>',
      },
    ]
    const service = new EpubSearchService(resources, [])
    const search = vi.spyOn(service, "start")
    const passages = await findCharacterIntroductions(service, resources, [])
    expect(search).toHaveBeenCalledWith("人物介绍")
    expect(passages).toHaveLength(1)
    expect(passages[0].text).toContain("陈默：老师。")
    expect(passages[0].text).toContain("林岚：旅人。")
    expect(passages[0].text).not.toContain("不应发送")
    expect(passages[0].locator.href).toBe("book.xhtml")
  })

  it("can find a TOC-labelled introduction whose text has no heading", async () => {
    const resources = [
      {
        href: "cast.xhtml",
        type: "application/xhtml+xml",
        html: "<p>陈默：老师。</p><p>林岚：旅人。</p>",
      },
    ]
    const passages = await findCharacterIntroductions(
      new EpubSearchService(resources, []),
      resources,
      [{ id: "cast", label: "登場人物", pageIndex: 0, href: "cast.xhtml" }],
    )
    expect(passages[0].text).toContain("林岚")
    expect(passages[0].title).toBe("登場人物")
  })

  it("does not invent context from passing mentions or image-only introductions", async () => {
    const resources = [
      {
        href: "body.xhtml",
        type: "application/xhtml+xml",
        html: "<p>他看了人物介绍，然后离开。</p>",
      },
      {
        href: "cast.xhtml",
        type: "application/xhtml+xml",
        html: '<h1>人物介绍</h1><img src="cast.jpg">',
      },
    ]
    expect(
      await findCharacterIntroductions(
        new EpubSearchService(resources, []),
        resources,
        [],
      ),
    ).toEqual([])
  })

  it("uses the introduction heading even when a TOC entry points at a shared resource", async () => {
    const resources = [
      {
        href: "book.xhtml",
        type: "application/xhtml+xml",
        html: "<h1>序章</h1><p>排除之前的正文</p><h1>人物介绍</h1><p>林岚：旅人。</p><h1>第一章</h1><p>排除后面的正文</p>",
      },
    ]
    const result = await findCharacterIntroductions(
      new EpubSearchService(resources, []),
      resources,
      [{ id: "cast", label: "人物介绍", href: "book.xhtml", pageIndex: 0 }],
    )
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe("林岚：旅人。")
  })

  it("does not confuse English words containing cast with an introduction", async () => {
    const resources = [
      {
        href: "body.xhtml",
        type: "application/xhtml+xml",
        title: "Forecast",
        html: "<h1>Forecast</h1><p>The weather forecast mentioned rain.</p>",
      },
    ]
    expect(
      await findCharacterIntroductions(
        new EpubSearchService(resources, []),
        resources,
        [],
      ),
    ).toEqual([])
  })

  it("preserves separate entries and does not include neighboring sections", async () => {
    const resources = [
      {
        href: "book.xhtml",
        type: "application/xhtml+xml",
        html: '<section id="cast"><h2>人物介绍</h2><p>陈默：老师。</p><p>林岚：旅人。</p></section><p>其他章节正文</p>',
      },
    ]
    const result = await findCharacterIntroductions(
      new EpubSearchService(resources, []),
      resources,
      [
        {
          id: "cast",
          label: "人物介绍",
          href: "book.xhtml#cast",
          pageIndex: 0,
        },
      ],
    )
    expect(result).toHaveLength(1)
    expect(result[0].text).toContain("陈默：老师。\n林岚：旅人。")
    expect(result[0].text).not.toContain("其他章节正文")
  })

  it("closes its search session when reading fails instead of reporting no matches", async () => {
    const service = {
      start: vi.fn().mockResolvedValue({ id: "one" }),
      next: vi.fn().mockRejectedValue(new Error("read failure")),
      close: vi.fn().mockResolvedValue(undefined),
    }
    await expect(findCharacterIntroductions(service, [], [])).rejects.toThrow(
      "read failure",
    )
    expect(service.close).toHaveBeenCalledWith("one")
  })
})
