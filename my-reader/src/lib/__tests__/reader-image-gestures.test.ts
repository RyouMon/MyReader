import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const filename = resolve(
  __dirname,
  "../../../../my-reader-mobile/modules/readium/ios/Resources/reader-image-actions.js",
)

describe("native reader image long press", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("ignores text and cancels when the reader starts scrolling", async () => {
    vi.useFakeTimers()
    const doc = document.implementation.createHTMLDocument()
    const onImage = vi.fn()
    const wnd = { ReaderImage: { onImage }, getSelection: () => null }
    doc.body.innerHTML =
      '<p>Text selection</p><img src="https://readium.test/cover.jpg">'
    vi.stubGlobal("window", wnd)
    vi.stubGlobal("document", doc)
    await import(filename)
    const press = (element: Element) => {
      const event = new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 20,
        clientY: 20,
        button: 0,
      })
      Object.defineProperty(event, "isPrimary", { value: true })
      element.dispatchEvent(event)
    }
    press(doc.querySelector("p")!)
    vi.advanceTimersByTime(600)
    expect(onImage).not.toHaveBeenCalled()
    press(doc.querySelector("img")!)
    doc.dispatchEvent(new Event("scroll"))
    vi.advanceTimersByTime(600)
    expect(onImage).not.toHaveBeenCalled()
    press(doc.querySelector("img")!)
    vi.advanceTimersByTime(600)
    expect(onImage).toHaveBeenCalledWith("https://readium.test/cover.jpg")
  })

  it("sends the selected SVG image to iOS once and consumes only its completed long press", async () => {
    vi.useFakeTimers()
    const doc = document.implementation.createHTMLDocument()
    doc.body.innerHTML =
      '<svg><image href="https://reader.test/picture.png" /></svg><p>Text</p>'
    const postMessage = vi.fn()
    const removeAllRanges = vi.fn()
    const wnd = {
      webkit: { messageHandlers: { readerImage: { postMessage } } },
      getSelection: () => ({ removeAllRanges }),
    }
    vi.stubGlobal("window", wnd)
    vi.stubGlobal("document", doc)
    await import(filename)
    vi.resetModules()
    await import(filename)
    expect(doc.querySelectorAll("style")).toHaveLength(1)
    const image = doc.querySelector("image")!
    const pointer = (type: string, x: number, primary = true) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        clientX: x,
        button: 0,
      })
      Object.defineProperty(event, "isPrimary", { value: primary })
      image.dispatchEvent(event)
    }
    pointer("pointerdown", 0, false)
    vi.advanceTimersByTime(600)
    pointer("pointerdown", 0)
    pointer("pointermove", 20)
    vi.advanceTimersByTime(600)
    pointer("pointerdown", 0)
    pointer("pointerup", 0)
    vi.advanceTimersByTime(600)
    expect(postMessage).not.toHaveBeenCalled()
    pointer("pointerdown", 0)
    vi.advanceTimersByTime(500)
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({
      src: "https://reader.test/picture.png",
    })
    expect(removeAllRanges).toHaveBeenCalledOnce()
    const click = new MouseEvent("click", { bubbles: true, cancelable: true })
    image.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    const textClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    })
    doc.querySelector("p")!.dispatchEvent(textClick)
    expect(textClick.defaultPrevented).toBe(false)
    const menu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    })
    image.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
  })
})
