import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"

function pdfFixture(): Buffer {
  const drawing = "0 0 0 rg 10 10 80 80 re f\n"
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>",
    `<< /Length ${drawing.length} >>\nstream\n${drawing}endstream`,
  ]
  let pdf = "%PDF-1.4\n"
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf)
}

function pdfImageFixture(cropped = false): Buffer {
  const drawing = cropped
    ? "q 200 0 0 100 0 0 cm /Im0 Do Q\n"
    : "q 60 0 0 40 20 30 cm /Im0 Do Q\n"
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>",
  ]
  for (let page = 0; page < 3; page++) {
    const boxes = cropped
      ? `/MediaBox [0 0 200 100] /CropBox [${page === 2 ? "100 0 200 100" : "0 0 100 100"}]`
      : "/MediaBox [0 0 100 100]"
    objects.push(
      `<< /Type /Page /Parent 2 0 R ${boxes} /Resources << /XObject << /Im0 ${9 + page} 0 R >> >> /Contents ${4 + page * 2} 0 R >>`,
    )
    objects.push(`<< /Length ${drawing.length} >>\nstream\n${drawing}endstream`)
  }
  for (const color of ["ff0000", "00ff00", "0000ff"]) {
    const pixels = `${color.repeat(4)}>`
    objects.push(
      `<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${pixels.length} >>\nstream\n${pixels}\nendstream`,
    )
  }
  let pdf = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`
  })
  return Buffer.from(
    `${pdf}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  )
}

for (const direction of ["ltr", "rtl"] as const) {
  test(`copies only the visible image inside each PDF CropBox (${direction})`, async ({
    page,
  }) => {
    await page.route("**/qa-cropped-images.pdf", (route) =>
      route.fulfill({
        contentType: "application/pdf",
        body: pdfImageFixture(true),
      }),
    )
    await page.goto("/")
    const result = await page.evaluate(async (direction) => {
      Object.defineProperty(navigator, "platform", {
        configurable: true,
        value: "MacIntel",
      })
      const navigatorPath = "/src/lib/readium/PdfNavigator.ts"
      const imagePath = "/src/lib/reader-image.ts"
      const { PdfNavigator } = await import(navigatorPath)
      const { imageSourceAtEvent } = await import(imagePath)
      const nav = new PdfNavigator(`${location.origin}/qa-cropped-images.pdf`)
      const parent = document.createElement("div")
      parent.style.cssText = "position:fixed;left:0;top:0;z-index:9999"
      const canvas = document.createElement("canvas")
      parent.append(canvas)
      document.body.append(parent)
      try {
        await nav.load()
        nav.spreadMode = "double"
        await nav.renderPageAt(canvas, 2, 804, 400, direction)
        const hitPages = Array.from(
          parent.querySelectorAll(".textLayerImages"),
          (layer) => {
            const rect = layer.getBoundingClientRect()
            return Number(
              document
                .elementFromPoint(
                  rect.left + rect.width / 2,
                  rect.top + rect.height / 2,
                )
                ?.closest<HTMLElement>("[data-reader-page]")?.dataset
                .readerPage,
            )
          },
        )
        const copies = []
        for (const placeholder of parent.querySelectorAll<HTMLCanvasElement>(
          ".textLayerImages canvas",
        )) {
          const event = new MouseEvent("contextmenu", { bubbles: true })
          placeholder.dispatchEvent(event)
          const source = imageSourceAtEvent(event)
          const image = new Image()
          image.src = `data:image/png;base64,${source.data}`
          await image.decode()
          const copy = document.createElement("canvas")
          copy.width = image.naturalWidth
          copy.height = image.naturalHeight
          const context = copy.getContext("2d")!
          context.drawImage(image, 0, 0)
          const pixels = context.getImageData(
            0,
            0,
            copy.width,
            copy.height,
          ).data
          copies.push({
            position: source.position,
            width: copy.width,
            height: copy.height,
            transparent: pixels.some(
              (value, index) => index % 4 === 3 && value === 0,
            ),
            color: Array.from(
              context.getImageData(copy.width / 2, copy.height / 2, 1, 1).data,
            ),
          })
        }
        return { copies, hitPages }
      } finally {
        await nav.destroy()
        parent.remove()
      }
    }, direction)
    const expected = [
      {
        position: 2,
        width: 500,
        height: 500,
        transparent: false,
        color: [0, 255, 0, 255],
      },
      {
        position: 3,
        width: 500,
        height: 500,
        transparent: false,
        color: [0, 0, 255, 255],
      },
    ]
    if (direction === "rtl") expected.reverse()
    expect(result.copies).toEqual(expected)
    expect(result.hitPages).toEqual(expected.map((copy) => copy.position))
  })
}

test("PDF.js image actions crop the correct page after spread zoom changes", async ({
  page,
}) => {
  await page.route("**/qa-images.pdf", (route) =>
    route.fulfill({ contentType: "application/pdf", body: pdfImageFixture() }),
  )
  await page.goto("/")
  const result = await page.evaluate(async () => {
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "MacIntel",
    })
    const modulePath = "/src/lib/readium/PdfNavigator.ts"
    const { PdfNavigator } = await import(modulePath)
    const nav = new PdfNavigator(`${location.origin}/qa-images.pdf`)
    const parent = document.createElement("div")
    parent.style.position = "relative"
    const canvas = document.createElement("canvas")
    parent.append(canvas)
    document.body.append(parent)
    const crops = () =>
      Array.from(
        parent.querySelectorAll<HTMLCanvasElement>(".textLayerImages canvas"),
      ).map((image) => {
        image.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }))
        const color = image
          .getContext("2d")!
          .getImageData(
            Math.floor(image.width / 2),
            Math.floor(image.height / 2),
            1,
            1,
          ).data
        return {
          position: Number(
            image.closest<HTMLElement>("[data-reader-page]")?.dataset
              .readerPage,
          ),
          color: Array.from(color),
          width: image.width,
          height: image.height,
        }
      })
    try {
      await nav.load()
      nav.spreadMode = "double"
      await nav.renderPageAt(canvas, 2, 800, 500)
      const first = crops()
      nav.renderScale = 2
      await nav.renderPageAt(canvas, 2, 800, 500)
      return { first, zoomed: crops() }
    } finally {
      await nav.destroy()
      parent.remove()
    }
  })
  expect(result.first.map((crop) => crop.color)).toEqual([
    [0, 255, 0, 255],
    [0, 0, 255, 255],
  ])
  expect(result.first.map((crop) => crop.position)).toEqual([2, 3])
  expect(result.zoomed.map((crop) => crop.color)).toEqual([
    [0, 255, 0, 255],
    [0, 0, 255, 255],
  ])
  expect(result.zoomed[1].width).toBeGreaterThan(result.first[1].width)
})

test("renders a PDF with its real worker and releases it on close", async ({
  page,
}) => {
  const tauriConfig = JSON.parse(
    readFileSync(
      new URL("../../../src-tauri/tauri.conf.json", import.meta.url),
      "utf8",
    ),
  ) as { app: { security: { csp: string } } }
  const workerStates: { closed: boolean }[] = []
  page.on("worker", (worker) => {
    const state = { closed: false }
    workerStates.push(state)
    worker.on("close", () => {
      state.closed = true
    })
  })
  await page.route("**/qa-fixture.pdf", (route) =>
    route.fulfill({ contentType: "application/pdf", body: pdfFixture() }),
  )
  await page.goto("/")
  await page.setContent(`
    <!doctype html>
    <html><head>
      <meta http-equiv="Content-Security-Policy" content="${tauriConfig.app.security.csp}">
    </head><body><canvas id="pdf-page"></canvas></body></html>
  `)
  const result = await page.evaluate(async () => {
    const modulePath = "/src/lib/readium/PdfNavigator.ts"
    const { PdfNavigator } = await import(modulePath)
    const navigator = new PdfNavigator(`${location.origin}/qa-fixture.pdf`)
    const canvas = document.querySelector<HTMLCanvasElement>("#pdf-page")!
    try {
      await navigator.load()
      await navigator.renderPage(canvas, 400, 400)
      const pixel = canvas
        .getContext("2d")!
        .getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
        ).data
      return { pages: navigator.totalPages, pixel: Array.from(pixel) }
    } finally {
      await navigator.destroy()
    }
  })

  expect(result.pages).toBe(1)
  expect(result.pixel).toEqual([0, 0, 0, 255])
  expect(workerStates.length).toBeGreaterThan(0)
  await expect
    .poll(() => workerStates.every((state) => state.closed))
    .toBe(true)
})
