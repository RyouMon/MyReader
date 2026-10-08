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
