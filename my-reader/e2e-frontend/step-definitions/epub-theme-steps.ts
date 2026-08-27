import { expect } from "@playwright/test"
import { createBdd } from "playwright-bdd"
import { test } from "../fixtures/test"

const { Given, When, Then } = createBdd(test)

Given("EPUB 正文声明了内联白底黑字样式", async ({ page }) => {
  await page.goto("/")
  await page.setContent(`
    <!doctype html>
    <html style="background-color: #ffffff !important; color: #000000 !important">
      <head><title>Theme regression fixture</title></head>
      <body style="background-color: #ffffff !important; color: #000000 !important">
        <p style="background-color: #ffffff !important; color: #000000 !important">
          Theme-aware EPUB content
        </p>
      </body>
    </html>
  `)
})

When("阅读器对正文应用 Night 主题", async ({ page }) => {
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
        if (!("blob" in resource)) continue
        const source = await resource.blob.text()
        if (resource.as === "link" && resource.rel === "stylesheet") {
          const style = document.createElement("style")
          style.textContent = source
          document.head.append(style)
        } else if (resource.as === "script") {
          const script = document.createElement("script")
          script.textContent = source
          document.body.append(script)
        }
      }
    }
  })
})

Then("EPUB 正文应显示 Night 主题的前景色和背景色", async ({ page }) => {
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
