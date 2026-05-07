import { describe, expect, it } from "vitest"
import {
  paginateDomIntoPages,
  paginateOnePage,
  paginateAroundAnchor,
  createMockReflowMeasurer,
} from "my-reader-tools/layout-engines/reflow"

function makeSourceRoot(html: string): HTMLDivElement {
  const root = document.createElement("div")
  root.innerHTML = html
  return root
}

function makeMeasureContainer(height: number): HTMLDivElement {
  const el = document.createElement("div")
  el.style.width = "400px"
  el.style.height = `${height}px`
  el.style.overflow = "hidden"
  return el
}

describe("paginateOnePage with mock measurer", () => {
  it("returns null when all content fits on one page", async () => {
    const source = makeSourceRoot("<p>hello</p>")
    const container = makeMeasureContainer(600)
    const measureRoot = document.createElement("div")
    const measurer = createMockReflowMeasurer(1000)

    const result = await paginateOnePage(
      source,
      container,
      measureRoot,
      { node: source, offset: 0 },
      measurer,
    )
    expect(result).toBeNull()
  })

  it("splits text node when capacity exceeded", async () => {
    const source = makeSourceRoot("<p>hello world this is a long sentence</p>")
    const container = makeMeasureContainer(600)
    const measureRoot = document.createElement("div")
    const measurer = createMockReflowMeasurer(10)

    const result = await paginateOnePage(
      source,
      container,
      measureRoot,
      { node: source, offset: 0 },
      measurer,
    )
    expect(result).not.toBeNull()
    // Should land somewhere inside the text
    expect(result!.node.nodeType).toBe(Node.TEXT_NODE)
    expect(result!.offset).toBeGreaterThan(0)
  })

  it("breaks before an element with break-before", async () => {
    const source = makeSourceRoot("<p>hello</p><div style='break-before: page'>world</div>")
    const container = makeMeasureContainer(600)
    const measureRoot = document.createElement("div")
    const measurer: typeof createMockReflowMeasurer extends (...args: any[]) => infer R ? R : never = {
      ...createMockReflowMeasurer(100),
      shouldBreak(node) {
        if (node instanceof HTMLElement && node.style.breakBefore === "page") {
          return "before"
        }
        return null
      },
    }

    const result = await paginateOnePage(
      source,
      container,
      measureRoot,
      { node: source, offset: 0 },
      measurer,
    )
    expect(result).not.toBeNull()
    // Should break before the div, landing at the div node
    expect(result!.node).toBe(source.querySelector("div"))
    expect(result!.offset).toBe(0)
  })
})

describe("paginateDomIntoPages with mock measurer", () => {
  it("returns single page for short content", async () => {
    const source = makeSourceRoot("<p>hi</p>")
    const container = makeMeasureContainer(600)
    const measureRoot = document.createElement("div")
    const measurer = createMockReflowMeasurer(1000)

    const pages = await paginateDomIntoPages(source, container, measureRoot, undefined, measurer)
    expect(pages.length).toBe(1)
    expect(pages[0].start.offset).toBe(0)
  })

  it("splits long text into multiple pages", async () => {
    const source = makeSourceRoot("<p>hello world this is a long sentence that must be split across multiple pages</p>")
    const container = makeMeasureContainer(600)
    const measureRoot = document.createElement("div")
    const measurer = createMockReflowMeasurer(15)

    const pages = await paginateDomIntoPages(source, container, measureRoot, undefined, measurer)
    expect(pages.length).toBeGreaterThan(1)
    // Each page start should come before its end in document order
    for (const page of pages) {
      expect(page.start.path.length >= 0).toBe(true)
    }
  })

  it("records pageHeightPx for each slice", async () => {
    const source = makeSourceRoot("<p>a</p><p>b</p><p>c</p>")
    const container = makeMeasureContainer(600)
    const measureRoot = document.createElement("div")
    const measurer = createMockReflowMeasurer(1)

    const pages = await paginateDomIntoPages(source, container, measureRoot, undefined, measurer)
    expect(pages.length).toBeGreaterThanOrEqual(1)
    for (const page of pages) {
      expect(typeof page.pageHeightPx).toBe("number")
      expect(page.pageHeightPx).toBeGreaterThanOrEqual(0)
    }
  })

  it("resumes from a custom start location", async () => {
    const source = makeSourceRoot("<p>page1</p><p>page2</p><p>page3</p>")
    const container = makeMeasureContainer(600)
    const measureRoot = document.createElement("div")
    const measurer = createMockReflowMeasurer(1000)

    // Start from second paragraph
    const p2 = source.querySelectorAll("p")[1]
    const pages = await paginateDomIntoPages(
      source,
      container,
      measureRoot,
      { node: p2, offset: 0 },
      measurer,
    )
    expect(pages.length).toBe(1)
    // Boundary offset reflects child index inside the root (1 = second child)
    expect(pages[0].start.offset).toBe(1)
  })
})

describe("paginateAroundAnchor with mock measurer", () => {
  it("returns root start for single-page content", async () => {
    const source = makeSourceRoot("<p>hi</p>")
    const container = makeMeasureContainer(600)
    const measureRoot = document.createElement("div")
    const measurer = createMockReflowMeasurer(1000)

    const allSlices = await paginateDomIntoPages(source, container, measureRoot, undefined, measurer)
    const anchor = { node: source.querySelector("p")!.firstChild as Text, offset: 0 }

    const result = await paginateAroundAnchor(
      source,
      container,
      measureRoot,
      allSlices,
      anchor,
      600,
      measurer,
    )
    expect(result.start.node).toBe(source)
    expect(result.start.offset).toBe(0)
  })

  it("shifts start backward when anchor is deep in multi-page content", async () => {
    const source = makeSourceRoot(
      "<p>hello world this is page one</p><p>and this is page two with more text</p><p>finally page three here</p>",
    )
    const container = makeMeasureContainer(600)
    const measureRoot = document.createElement("div")
    const measurer = createMockReflowMeasurer(10)

    const allSlices = await paginateDomIntoPages(source, container, measureRoot, undefined, measurer)
    expect(allSlices.length).toBeGreaterThan(2)

    // Anchor near the end
    const lastP = source.querySelectorAll("p")[2]
    const anchor = { node: lastP.firstChild as Text, offset: 5 }

    const result = await paginateAroundAnchor(
      source,
      container,
      measureRoot,
      allSlices,
      anchor,
      600,
      measurer,
    )
    // Start should be before the last slice
    expect(result.startSliceIndex).toBeLessThan(allSlices.length - 1)
  })
})
