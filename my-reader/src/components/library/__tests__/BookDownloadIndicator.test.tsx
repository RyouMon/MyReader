import "@/i18n"
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { BookDownloadIndicator } from "../BookDownloadIndicator"

describe("BookDownloadIndicator", () => {
  it("should expose a labeled image when only the status icon is visible", () => {
    const { container } = render(
      <BookDownloadIndicator
        state={{ status: "remote_only", format: "EPUB" }}
        variant="icon"
      />,
    )

    const indicator = container.querySelector(
      '[data-download-status="remote_only"]',
    )
    expect(indicator).toHaveAttribute("role", "img")
    expect(indicator?.getAttribute("aria-label")).toBeTruthy()
  })

  it("should use visible text as the inline accessible label", () => {
    const { container } = render(
      <BookDownloadIndicator
        state={{ status: "remote_only", format: "EPUB" }}
        variant="inline"
      />,
    )

    const indicator = container.querySelector(
      '[data-download-status="remote_only"]',
    )
    expect(indicator).not.toHaveAttribute("aria-label")
    expect(indicator).not.toBeEmptyDOMElement()
  })
})
