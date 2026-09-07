import { expect, test } from "@playwright/test"

test("applies Readium theme colors under the production CSP", async ({
  page,
}) => {
  await page.goto("/")
  await page.setContent(`
    <!doctype html>
    <html style="background-color: #ffffff !important; color: #000000 !important">
      <head>
        <meta
          http-equiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
        >
        <title>Theme regression fixture</title>
      </head>
      <body style="background-color: #ffffff !important; color: #000000 !important">
        <p style="background-color: #ffffff !important; color: #000000 !important">
          Theme-aware EPUB content
        </p>
      </body>
    </html>
  `)

  await page.evaluate(async () => {
    document.documentElement.style.setProperty(
      "--USER__backgroundColor",
      "#121212",
    )
    document.documentElement.style.setProperty("--USER__textColor", "#ffffff")

    const modulePath = "/src/lib/readium/readerFonts.ts"
    const { createReaderFontInjectables } = await import(modulePath)
    const injectables = createReaderFontInjectables()
    for (const rule of injectables.rules) {
      for (const resource of rule.append ?? []) {
        const source =
          "blob" in resource
            ? URL.createObjectURL(resource.blob)
            : new URL(resource.url, document.baseURI).toString()
        if (resource.as === "link" && resource.rel === "stylesheet") {
          const link = document.createElement("link")
          link.id = resource.id ?? ""
          link.rel = resource.rel
          link.href = source
          document.head.append(link)
        } else if (resource.as === "script") {
          const script = document.createElement("script")
          script.id = resource.id ?? ""
          script.src = source
          document.body.append(script)
          await new Promise<void>((resolve) => {
            script.addEventListener("load", () => resolve(), { once: true })
            script.addEventListener("error", () => resolve(), { once: true })
          })
        }
      }
    }
  })

  const colors = await page.evaluate(() => {
    const paragraph = document.querySelector("p")
    if (!paragraph) throw new Error("Missing EPUB paragraph fixture")
    const rootStyle = getComputedStyle(document.documentElement)
    const bodyStyle = getComputedStyle(document.body)
    const paragraphStyle = getComputedStyle(paragraph)
    return {
      root: {
        backgroundColor: rootStyle.backgroundColor,
        color: rootStyle.color,
      },
      body: {
        backgroundColor: bodyStyle.backgroundColor,
        color: bodyStyle.color,
      },
      paragraph: {
        backgroundColor: paragraphStyle.backgroundColor,
        color: paragraphStyle.color,
      },
    }
  })

  expect(colors).toEqual({
    root: {
      backgroundColor: "rgb(18, 18, 18)",
      color: "rgb(255, 255, 255)",
    },
    body: {
      backgroundColor: "rgb(18, 18, 18)",
      color: "rgb(255, 255, 255)",
    },
    paragraph: {
      backgroundColor: "rgba(0, 0, 0, 0)",
      color: "rgb(255, 255, 255)",
    },
  })
})
