import "@/i18n"
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DataSourceTypeSelector } from "../DataSourceTypeSelector"

describe("DataSourceTypeSelector", () => {
  it("should hide decorative type icons from assistive technology", () => {
    const { container } = render(
      <DataSourceTypeSelector value="local" onChange={vi.fn()} />,
    )

    const typeIcons = container.querySelectorAll("button > div:first-child svg")
    expect(typeIcons).toHaveLength(3)
    for (const icon of typeIcons) {
      expect(icon).toHaveAttribute("aria-hidden", "true")
      expect(icon).toHaveAttribute("focusable", "false")
    }
    expect(
      container.querySelectorAll('[data-icon="local-storage"]'),
    ).toHaveLength(1)
    expect(
      container.querySelectorAll('[data-icon="webdav-server"]'),
    ).toHaveLength(1)
  })
})
