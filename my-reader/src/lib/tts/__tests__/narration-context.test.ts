import { describe, expect, it } from "vitest"
import { Locator, LocatorLocations, LocatorText } from "@readium/shared"
import { narrationContext } from "../narration-context"
import type { EpubTextResource } from "@/lib/readium/epubContentLocators"
import type { EpubTtsUtterance } from "@/lib/readium/epubTts"

const utterance = (id: string, text: string, href = "second.xhtml") =>
  ({
    id,
    plain: text,
    locator: new Locator({
      href,
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.5 }),
      text: new LocatorText({
        highlight: text,
        before: "before",
        after: "after",
      }),
    }),
  }) as EpubTtsUtterance
const resources: EpubTextResource[] = [
  { href: "first.xhtml", type: "application/xhtml+xml", html: "<p>first</p>" },
  {
    href: "second.xhtml",
    type: "application/xhtml+xml",
    html: "<p>second</p>",
  },
]
describe("narration context", () => {
  it("retains exact source and locator, bounds surrounding context without splitting surrogate pairs", async () => {
    const current = utterance("current", "你好😀")
    const values = [
      utterance("prior", "😀".repeat(1500)),
      current,
      utterance("next", "后".repeat(1500)),
    ]
    const request = await narrationContext(3, current, values, resources)
    expect(request.text).toBe("你好😀")
    expect(JSON.parse(request.sourceKey)).toEqual(current.locator.serialize())
    expect(request.position).toBe(0.75)
    expect(request.before).toBe("😀".repeat(900))
    expect(request.after).toBe("后".repeat(900))
    expect(request.contentVersion).toMatch(/^[a-f0-9]{64}$/)
    expect(request).not.toHaveProperty("resources")
    const resumed = await narrationContext(3, current, values, resources)
    expect(resumed.contentVersion).toBe(request.contentVersion)
    const changed = await narrationContext(3, current, values, [
      { ...resources[0]!, html: "edited" },
      resources[1]!,
    ])
    expect(changed.contentVersion).not.toBe(request.contentVersion)
  })
  it("uses locator context when the native utterance is outside the loaded list", async () => {
    const current = utterance("external", "exact", "missing.xhtml")
    expect(await narrationContext(3, current, [], [])).toMatchObject({
      before: "before",
      after: "after",
      position: 0.5,
      text: "exact",
    })
  })
})
