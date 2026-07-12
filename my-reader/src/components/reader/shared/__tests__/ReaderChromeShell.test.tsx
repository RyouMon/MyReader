import { readerChromePalette } from "@my-reader/tools/reader-chrome-palette"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReaderChromeShell, readerChromeThemeStyle } from "../ReaderChromeShell"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
})

const topBar = {
  bookTitle: "疯传",
  chapterTitle: "诱因",
  bookmarked: false,
  onToggleToc: vi.fn(),
  onToggleBookmark: vi.fn(),
  onToggleSettings: vi.fn(),
}

describe("ReaderChromeShell", () => {
  it("should derive reflowable chrome colors from the reading theme", () => {
    const style = readerChromeThemeStyle("green")
    const palette = readerChromePalette("#000000", "#C5E7CD")

    expect(style).toMatchObject({
      "--reader-chrome-bg": palette.bg,
      "--reader-panel-bg": palette.sheetSurface,
      "--reader-chrome-segment-idle": palette.segmentIdle,
      "--reader-chrome-segment-active": palette.segmentActive,
      "--reader-chrome-toc-row-idle": "transparent",
      "--reader-chrome-toc-row-hover": palette.segmentIdle,
      "--reader-chrome-toc-row-active": palette.tocRowActive,
    })
  })

  it("should keep the fixed layout chrome palette when rendering PDF or CBZ", () => {
    expect(readerChromeThemeStyle("green", "fixed-layout")).toBeUndefined()
  })

  it("should keep the bottom region outside the Readium region when rendering EPUB", () => {
    const { container } = render(
      <ReaderChromeShell
        readerRootRef={{ current: null }}
        chromeVisible
        showChrome={vi.fn()}
        scheduleChromeHide={vi.fn()}
        topBar={topBar}
        tocPanel={null}
        settingsPanel={null}
        main={<main data-testid="readium-region" />}
        bottomStatusBar={<div data-testid="bottom-region" />}
      />,
    )

    const readiumRegion = screen.getByTestId("readium-region")
    const bottomRegion = screen.getByTestId("bottom-region")
    const content = container.querySelector(".reader-window-content")
    const footer = container.querySelector(".reader-window-footer")

    expect(content).toContainElement(readiumRegion)
    expect(content).not.toContainElement(bottomRegion)
    expect(footer).toContainElement(bottomRegion)
    expect(footer?.previousElementSibling).toBe(content)
  })

  it("should mark fixed-layout content for overlay chrome when rendering PDF or CBZ", () => {
    const { container } = render(
      <ReaderChromeShell
        readerRootRef={{ current: null }}
        chromeVisible
        showChrome={vi.fn()}
        scheduleChromeHide={vi.fn()}
        readerMode="fixed-layout"
        topBar={topBar}
        tocPanel={null}
        settingsPanel={null}
        main={<main />}
        bottomStatusBar={<div />}
      />,
    )

    expect(container.querySelector(".reader-window-paper")).toHaveAttribute(
      "data-reader-mode",
      "fixed-layout",
    )
  })

  it("should mark fixed-layout chrome visible when chrome is shown", () => {
    const { container } = render(
      <ReaderChromeShell
        readerRootRef={{ current: null }}
        chromeVisible
        showChrome={vi.fn()}
        scheduleChromeHide={vi.fn()}
        readerMode="fixed-layout"
        topBar={topBar}
        tocPanel={null}
        settingsPanel={null}
        main={<main />}
        bottomStatusBar={<div />}
      />,
    )

    expect(container.querySelector(".reader-window-paper")).toHaveAttribute(
      "data-reader-chrome-visible",
      "true",
    )
  })

  it("should mark fixed-layout chrome hidden when chrome is hidden", () => {
    const { container } = render(
      <ReaderChromeShell
        readerRootRef={{ current: null }}
        chromeVisible={false}
        showChrome={vi.fn()}
        scheduleChromeHide={vi.fn()}
        readerMode="fixed-layout"
        topBar={topBar}
        tocPanel={null}
        settingsPanel={null}
        main={<main />}
        bottomStatusBar={<div />}
      />,
    )

    expect(container.querySelector(".reader-window-paper")).toHaveAttribute(
      "data-reader-chrome-visible",
      "false",
    )
  })

  it("should recreate fixed-layout background layer when settings panel remains open", () => {
    const props = {
      readerRootRef: { current: null },
      chromeVisible: true,
      showChrome: vi.fn(),
      scheduleChromeHide: vi.fn(),
      panelsOpen: true,
      onClosePanels: vi.fn(),
      readerMode: "fixed-layout" as const,
      topBar,
      tocPanel: null,
      settingsPanel: <aside data-testid="settings-panel" />,
      main: <main />,
    }
    const { container, rerender } = render(
      <ReaderChromeShell {...props} readerBackgroundColor="#000000" />,
    )

    expect(screen.getByTestId("settings-panel")).toBeInTheDocument()
    expect(container.querySelector(".reader-window-paper")).toHaveStyle({
      "--reader-bg": "#000000",
      "--viewer-bg": "#000000",
    })
    const blackBackgroundLayer = container.querySelector(
      ".reader-fixed-layout-background",
    )
    expect(blackBackgroundLayer).toHaveStyle({ backgroundColor: "#000000" })

    rerender(<ReaderChromeShell {...props} readerBackgroundColor="#FFFFFF" />)

    expect(screen.getByTestId("settings-panel")).toBeInTheDocument()
    expect(container.querySelector(".reader-window-paper")).toHaveStyle({
      "--reader-bg": "#FFFFFF",
      "--viewer-bg": "#FFFFFF",
    })
    const whiteBackgroundLayer = container.querySelector(
      ".reader-fixed-layout-background",
    )
    expect(whiteBackgroundLayer).toHaveStyle({ backgroundColor: "#FFFFFF" })
    expect(whiteBackgroundLayer).not.toBe(blackBackgroundLayer)
  })

  it("should schedule chrome hiding when the pointer leaves the bottom region", () => {
    const scheduleChromeHide = vi.fn()
    const { container } = render(
      <ReaderChromeShell
        readerRootRef={{ current: null }}
        chromeVisible
        showChrome={vi.fn()}
        scheduleChromeHide={scheduleChromeHide}
        topBar={topBar}
        tocPanel={null}
        settingsPanel={null}
        main={<main />}
        bottomStatusBar={<div />}
      />,
    )

    const footer = container.querySelector(".reader-window-footer")
    const content = container.querySelector(".reader-window-content")
    expect(footer).not.toBeNull()
    expect(content).not.toBeNull()
    fireEvent.pointerLeave(footer as Element, { relatedTarget: content })

    expect(scheduleChromeHide).toHaveBeenCalledOnce()
  })
})
