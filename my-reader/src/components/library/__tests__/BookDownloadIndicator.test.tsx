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

  it("should show a dashed cloud when the file exists only locally", () => {
    const { container } = render(
      <BookDownloadIndicator
        state={{ status: "local_only", format: "EPUB" }}
        variant="icon"
      />,
    )

    const indicator = container.querySelector(
      '[data-download-status="local_only"]',
    )
    expect(indicator?.querySelector("svg")).toHaveAttribute(
      "stroke-dasharray",
      "2 2",
    )
  })

  it("should show an up arrow when the file is uploading", () => {
    const { container } = render(
      <BookDownloadIndicator
        state={{ status: "uploading", format: "EPUB", percent: 50 }}
        variant="icon"
      />,
    )

    const indicator = container.querySelector(
      '[data-download-status="uploading"]',
    )
    expect(indicator).toHaveAttribute("aria-label", "已上传 50%")
    expect(indicator?.querySelectorAll("svg")).toHaveLength(2)
  })
})
